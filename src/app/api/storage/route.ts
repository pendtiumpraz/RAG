import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/modules/core/auth';
import { storageService } from '@/modules/storage';
import { wajibPerPenyedia } from './validasi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/storage — daftar penyimpanan objek terhubung user (tanpa rahasia). */
export async function GET() {
  const user = await getCurrentUser();
  const daftar = await storageService.list(user.tenantId, user.id);
  return NextResponse.json({
    daftar,
    pilihanPenyedia: await storageService.pilihanPenyedia(),
  });
}

const Body = z.object({
  provider: z.enum(['s3', 'r2', 'gcs', 'azure', 's3-compat']),
  label: z.string().trim().max(80).optional().nullable(),
  credentials: z.record(z.unknown()).default({}),
  isDefault: z.boolean().default(false).optional(),
});

/** POST /api/storage — hubungkan penyimpanan objek baru (BYOB). */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Input tidak valid' }, { status: 400 });
  }
  const kred = wajibPerPenyedia(parsed.data.provider, parsed.data.credentials);

  // Saklar superadmin: non-superadmin TIDAK boleh menyambung penyedia yang
  // dimatikan. Superadmin tetap boleh apa pun (uji/migrasi/dukungan).
  await storageService.pastikanAktif(parsed.data.provider, user.role === 'superadmin');

  const saved = await storageService.save({
    tenantId: user.tenantId,
    userId: user.id,
    provider: parsed.data.provider,
    label: parsed.data.label,
    credentials: kred,
    isDefault: parsed.data.isDefault ?? false,
  });
  return NextResponse.json({ storage: saved }, { status: 201 });
}
