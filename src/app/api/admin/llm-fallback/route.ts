import { NextResponse } from 'next/server';
import { z } from 'zod';
import { superadminRoute } from '../_guard';
import { platformSettingsService, MODEL_CADANGAN_BAWAAN } from '@/modules/payments/platform-settings.service';
import { listLlmModels } from '@/modules/chat/llm-catalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * MODEL CADANGAN (fallback) tingkat platform.
 *
 * Dipakai dua kali oleh chat.service: sebagai bawaan bila tenant belum memilih
 * model, dan sebagai tujuan FAILOVER ketika model aktif menolak (kuota habis,
 * 429, penyedia mati). Keputusan pemasangan — karena itu superadmin, bukan
 * per-tenant, dan tersimpan di platform_settings supaya bisa diganti tanpa
 * deploy.
 */

/** GET /api/admin/llm-fallback — nilai sekarang + pilihan yang sah. */
export const GET = superadminRoute(async () => {
  const cfg = await platformSettingsService.get();
  /* Pilihan diambil dari KATALOG (registry cloud + model server sendiri),
     bukan daftar tertulis: model cadangan yang tak ada di katalog akan gagal
     tepat pada saat ia paling dibutuhkan — ketika model utama sudah jatuh. */
  const model = (await listLlmModels()).map((m) => ({
    id: m.id, label: m.label, provider: m.provider,
  }));
  return NextResponse.json({
    fallbackLlmModel: cfg.fallbackLlmModel,
    bawaan: MODEL_CADANGAN_BAWAAN,
    model,
  });
});

const Body = z.object({
  /** null / string kosong = kembali ke bawaan kode. */
  fallbackLlmModel: z.string().trim().nullable(),
});

/** PUT /api/admin/llm-fallback — setel model cadangan. */
export const PUT = superadminRoute(async (req, _ctx, user) => {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Input tidak valid' }, { status: 400 });
  }
  const nilai = parsed.data.fallbackLlmModel?.trim() || null;

  /* Divalidasi ke katalog SEBELUM disimpan. Cadangan yang salah ketik tak
     menimbulkan galat apa pun hari ini — ia diam sampai model utama gagal,
     lalu ikut gagal, dan pada saat itu tak ada yang ingat pernah mengetiknya. */
  if (nilai && !(await listLlmModels()).some((m) => m.id === nilai)) {
    return NextResponse.json(
      { error: `Model "${nilai}" tak ada di katalog. Untuk model dari server LLM sendiri, jalankan "Test koneksi" dulu.` },
      { status: 400 });
  }

  const cfg = await platformSettingsService.update(
    { id: user.id, tenantId: user.tenantId },
    { fallbackLlmModel: nilai });
  return NextResponse.json({ fallbackLlmModel: cfg.fallbackLlmModel });
});
