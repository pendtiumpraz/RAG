import { NextResponse } from 'next/server';
import { periksaLisensi } from '@/modules/core/lisensi';
import { superadminRoute } from '../_guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/license — keadaan lisensi pemasangan ini.
 *
 * SUPERADMIN, bukan publik. Isi lisensi menyebut nama organisasi pemegangnya,
 * masa berlakunya, dan nomor serinya — semuanya berguna bagi yang ingin
 * memetakan siapa memakai apa. `/api/health` sengaja dibiarkan minim dan
 * TIDAK ikut menyebutnya, karena ia permukaan yang paling sering dipindai.
 *
 * Tak ada endpoint untuk MENGUBAH lisensi: ia hidup di env, dan mengubahnya
 * lewat HTTP berarti siapa pun yang menembus satu akun superadmin bisa
 * menerbitkan masa berlaku untuk dirinya sendiri.
 */
export const GET = superadminRoute(async () => {
  const h = periksaLisensi();
  return NextResponse.json(h, { headers: { 'cache-control': 'no-store' } });
});
