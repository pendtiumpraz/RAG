import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/modules/core/auth';

export const runtime = 'nodejs';

/**
 * GET /api/connections/providers — provider storage mana yang SIAP dipakai.
 *
 * Ada supaya UI tak lagi menawarkan tombol "Connect Google" yang pasti gagal
 * ketika env OAuth-nya belum dipasang. Sebelumnya tautannya tetap tampil dan
 * pengguna mendarat di JSON galat mentah.
 *
 * Hanya membalas ADA/TIDAKNYA konfigurasi — tak pernah menyebut nilai
 * client id apalagi secret.
 */
export async function GET() {
  await getCurrentUser();
  return NextResponse.json({
    google: !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET,
    microsoft: !!process.env.MS_CLIENT_ID && !!process.env.MS_CLIENT_SECRET,
  });
}
