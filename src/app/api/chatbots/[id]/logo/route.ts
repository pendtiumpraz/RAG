import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { eq, and, isNull } from 'drizzle-orm';
import { requireRole } from '@/modules/core/auth';
import { withTenant } from '@/modules/core/db/tenant-context';
import { chatbots } from '@/modules/core/db';
import { audit } from '@/modules/core/guardrails';

export const runtime = 'nodejs';

/** Cap ±300KB gambar (base64 ±400KB) — logo widget tampil ≤30px; lebih
 *  besar dari ini cuma memberatkan DB dan pemuatan widget. */
const MAX_DATAURL_CHARS = 420_000;

const Body = z.object({
  dataUrl: z.string()
    .max(MAX_DATAURL_CHARS, 'Logo terlalu besar — maksimal ±300KB')
    .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/,
      'Format harus PNG, JPEG, atau WebP (SVG sengaja ditolak — bisa membawa skrip)'),
});

/** POST /api/chatbots/:id/logo — unggah logo branding chatbot (admin). */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireRole('superadmin', 'admin');
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Input tidak valid' }, { status: 400 });
  }
  const updated = await withTenant(user.tenantId, async (tx) =>
    (await tx.update(chatbots).set({ logo: parsed.data.dataUrl, updatedAt: new Date() })
      .where(and(eq(chatbots.id, id), isNull(chatbots.deletedAt)))
      .returning({ id: chatbots.id, publicKey: chatbots.publicKey }))[0] ?? null);
  if (!updated) return NextResponse.json({ error: 'Chatbot tidak ditemukan' }, { status: 404 });

  await audit(user.tenantId, user.id, 'chatbot.logo_uploaded', id, { bytes: parsed.data.dataUrl.length });
  return NextResponse.json({ ok: true, logoUrl: `/api/chat/${updated.publicKey}/logo` });
}

/** DELETE /api/chatbots/:id/logo — hapus logo (widget kembali ke inisial/default). */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireRole('superadmin', 'admin');
  const { id } = await ctx.params;
  const updated = await withTenant(user.tenantId, async (tx) =>
    (await tx.update(chatbots).set({ logo: null, updatedAt: new Date() })
      .where(and(eq(chatbots.id, id), isNull(chatbots.deletedAt)))
      .returning({ id: chatbots.id }))[0] ?? null);
  if (!updated) return NextResponse.json({ error: 'Chatbot tidak ditemukan' }, { status: 404 });
  await audit(user.tenantId, user.id, 'chatbot.logo_removed', id, {});
  return NextResponse.json({ ok: true });
}
