import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq, isNull } from 'drizzle-orm';
import { chatbots } from '@/modules/core/db';
import { withTenant } from '@/modules/core/db/tenant-context';
import { audit } from '@/modules/core/guardrails';
import { apiRoute } from '../../../_guard';
import { tenantOwner } from '../../../_actor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Cap ±300KB gambar (base64 ±400KB) — sama dengan jalur dashboard. Logo
 *  widget tampil ≤30px; lebih besar cuma memberatkan DB dan pemuatan widget. */
const MAKS_DATAURL = 420_000;

const Body = z.object({
  dataUrl: z.string()
    .max(MAKS_DATAURL, 'Logo terlalu besar — maksimal ±300KB')
    // SVG DITOLAK dengan sengaja: ia bisa membawa <script>, dan logo ini
    // dirender di halaman pelanggan, bukan di halaman kita.
    .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/,
      'Format harus PNG, JPEG, atau WebP (SVG ditolak — bisa membawa skrip)'),
});

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/v1/chatbots/{id}/logo — kembaran ber-API-key dari jalur dashboard.
 *
 * Ada karena logo adalah SATU-SATUNYA bagian tampilan chatbot yang tak bisa
 * diatur lewat `PUT /api/v1/chatbots/{id}`: ia kolom tersendiri, bukan bagian
 * `themeConfig`. Tanpa rute ini, panel "ubah tampilan" di sistem pemanggil
 * lengkap kecuali satu kolom — dan justru kolom yang paling kelihatan.
 *
 * Menerima data URL (bukan multipart) karena berkasnya kecil dan memang
 * disimpan sebagai data URL di kolom `logo`; mengubahnya jadi multipart hanya
 * menambah satu bentuk permintaan tanpa mengubah apa pun yang tersimpan.
 */
export const POST = apiRoute<Ctx>('write', async (req, ctx, caller) => {
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Input tidak valid' }, { status: 400 });
  }

  const updated = await withTenant(caller.tenantId, async (tx) =>
    (await tx.update(chatbots)
      .set({ logo: parsed.data.dataUrl, updatedAt: new Date() })
      // `tenantId` DISERTAKAN, tidak diserahkan ke RLS sendirian. Ini tulis,
      // bukan baca: RLS yang lumpuh di sini berarti satu tenant bisa MENGGANTI
      // logo chatbot tenant lain hanya dengan menebak id-nya.
      .where(and(
        eq(chatbots.tenantId, caller.tenantId),
        eq(chatbots.id, id),
        isNull(chatbots.deletedAt),
      ))
      .returning({ id: chatbots.id, publicKey: chatbots.publicKey }))[0] ?? null);
  if (!updated) return NextResponse.json({ error: 'Chatbot tidak ditemukan' }, { status: 404 });

  const owner = await tenantOwner(caller.tenantId);
  await audit(caller.tenantId, owner?.id ?? 'system', 'chatbot.logo_uploaded', id,
    { bytes: parsed.data.dataUrl.length, via: 'api' });

  return NextResponse.json({ ok: true, logoUrl: `/api/chat/${updated.publicKey}/logo` });
});

/** DELETE /api/v1/chatbots/{id}/logo — widget kembali ke inisial. */
export const DELETE = apiRoute<Ctx>('write', async (_req, ctx, caller) => {
  const { id } = await ctx.params;
  const updated = await withTenant(caller.tenantId, async (tx) =>
    (await tx.update(chatbots)
      .set({ logo: null, updatedAt: new Date() })
      .where(and(
        eq(chatbots.tenantId, caller.tenantId),
        eq(chatbots.id, id),
        isNull(chatbots.deletedAt),
      ))
      .returning({ id: chatbots.id }))[0] ?? null);
  if (!updated) return NextResponse.json({ error: 'Chatbot tidak ditemukan' }, { status: 404 });

  const owner = await tenantOwner(caller.tenantId);
  await audit(caller.tenantId, owner?.id ?? 'system', 'chatbot.logo_removed', id, { via: 'api' });
  return NextResponse.json({ ok: true });
});
