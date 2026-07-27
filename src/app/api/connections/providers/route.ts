import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/modules/core/auth';
import { oauthAppService } from '@/modules/auth/oauth-app.service';

export const runtime = 'nodejs';

/**
 * GET /api/connections/providers — provider storage mana yang SIAP dipakai.
 *
 * Ada supaya UI tak lagi menawarkan tombol "Connect Google" yang pasti gagal
 * ketika OAuth-nya belum dikonfigurasi. Sebelumnya tautannya tetap tampil dan
 * pengguna mendarat di JSON galat mentah.
 *
 * Membaca lewat oauthAppService, jadi ikut mengenali kredensial yang disimpan
 * di database — bukan hanya env.
 *
 * Hanya membalas ADA/TIDAKNYA konfigurasi — tak pernah menyebut client id
 * apalagi secret.
 */
export async function GET() {
  await getCurrentUser();
  const [google, microsoft] = await Promise.all([
    oauthAppService.get('google'),
    oauthAppService.get('microsoft'),
  ]);
  return NextResponse.json({ google: !!google, microsoft: !!microsoft });
}
