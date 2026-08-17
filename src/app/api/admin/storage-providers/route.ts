import { NextResponse } from 'next/server';
import { z } from 'zod';
import { superadminRoute } from '../_guard';
import { platformSettingsService } from '@/modules/payments/platform-settings.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * SAKLAR PENYEDIA PENYIMPANAN — dibaca & disetel superadmin.
 *
 * Memutuskan penyedia BYOB mana yang boleh dipakai di seluruh platform.
 * 'platform' (blob Vercel dari env) SELALU tersedia dan TIDAK pernah ada di
 * sini — ia bawaan aman yang tak bisa dimatikan. Kunci yang hilang di nilai
 * tersimpan berarti 'terbuka' (pakai bawaan), jadi menyimpan peta lengkap
 * yang eksplisit di sini menghindari salah tafsir.
 */

const NAMA_PENYEDIA = [
  's3', 'r2', 'gcs', 'azure', 's3-compat',
] as const;

const Body = z.object({
  enabled: z.record(z.boolean()),
});

/** GET — peta penyedia yang sedang terbuka (default kode + yang berlaku). */
export const GET = superadminRoute(async () => {
  const cfg = await platformSettingsService.get();
  const enabled = cfg.enabledStorageProviders;
  return NextResponse.json({
    enabled,
    /* Label tampilan + penjelasan, dipakai panel superadmin. */
    penyedia: NAMA_PENYEDIA.map((p) => ({
      provider: p,
      nyala: enabled[p] !== false,
      label: LABEL_PENYEDIA[p],
    })),
  });
});

/** PUT — simpan peta terbuka/matikan per penyedia. */
export const PUT = superadminRoute(async (req, _ctx, user) => {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Input tidak valid' }, { status: 400 });
  }

  // Peta yang disimpan dipotong ke 5 penyedia yang dikenal. Kunci tak dikenal
  // dibuang (tak disimpan) — mencegah superadmin mengetik salah lalu membuat
  // "penyedia" hantu yang tak pernah diuji aplikasi.
  const enabled: Record<string, boolean> = {};
  for (const p of NAMA_PENYEDIA) {
    enabled[p] = parsed.data.enabled[p] !== false;
  }

  const cfg = await platformSettingsService.update(
    { id: user.id, tenantId: user.tenantId },
    { enabledStorageProviders: enabled },
  );
  return NextResponse.json({ ok: true, enabled: cfg.enabledStorageProviders });
});

const LABEL_PENYEDIA: Record<(typeof NAMA_PENYEDIA)[number], string> = {
  s3: 'AWS S3',
  r2: 'Cloudflare R2',
  gcs: 'Google Cloud Storage',
  azure: 'Azure Blob Storage',
  's3-compat': 'S3-compatible (MinIO, Wasabi, …)',
};
