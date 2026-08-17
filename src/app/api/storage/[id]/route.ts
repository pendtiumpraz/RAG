import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/modules/core/auth';
import { storageService } from '@/modules/storage';
import { wajibPerPenyedia } from '../validasi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PutBody = z.object({
  provider: z.enum(['s3', 'r2', 'gcs', 'azure', 's3-compat']),
  label: z.string().trim().max(80).optional().nullable(),
  credentials: z.record(z.unknown()).default({}),
  isDefault: z.boolean().default(false).optional(),
});

/** PUT /api/storage/{id} — perbarui label & kredensial penyimpanan. */
export async function PUT(
  req: NextRequest, ctx: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  const { id } = await ctx.params;
  const parsed = PutBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Input tidak valid' }, { status: 400 });
  }
  const kred = wajibPerPenyedia(parsed.data.provider, parsed.data.credentials);
  // Saklar superadmin — superadmin boleh bekerja dengan penyedia apa pun.
  await storageService.pastikanAktif(parsed.data.provider, user.role === 'superadmin');
  const saved = await storageService.save({
    tenantId: user.tenantId,
    userId: user.id,
    id,
    provider: parsed.data.provider,
    label: parsed.data.label,
    credentials: kred,
    isDefault: parsed.data.isDefault,
  });
  return NextResponse.json({ storage: saved });
}

/** POST /api/storage/{id}/test — uji koneksi nyata ke penyedia. */
export async function POST(
  req: NextRequest, ctx: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  const { id } = await ctx.params;
  // Dapatkan provider penyimpanan ini untuk memeriksa saklar superadmin.
  const tampilan = await storageService.get(user.tenantId, user.id, id);
  if (tampilan) {
    await storageService.pastikanAktif(tampilan.provider, user.role === 'superadmin');
  }
  const hasil = await storageService.test(user.tenantId, user.id, id);
  return NextResponse.json(hasil);
}

/** DELETE /api/storage/{id} — hapus (soft) penyimpanan. */
export async function DELETE(
  _req: NextRequest, ctx: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  const { id } = await ctx.params;
  await storageService.remove(user.tenantId, user.id, id);
  return NextResponse.json({ ok: true });
}
