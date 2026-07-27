import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/modules/core/auth';
import { connectionService } from '@/modules/connections/connection.service';
import { oauthAppService } from '@/modules/auth/oauth-app.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/connections/google/picker-token?accountEmail=…
 *
 * Access token Google MILIK USER SENDIRI, untuk membuka Google Picker di
 * browser (mode Drive 'picker', keputusan D10).
 *
 * Kenapa token boleh sampai ke browser padahal aturan proyek berbunyi "keys
 * never reach the browser": aturan itu untuk API key provider yang dibayar
 * tenant. Ini token OAuth user untuk Drive-nya sendiri, dan Picker API memang
 * mensyaratkan token di sisi client — tidak ada cara lain. Token TIDAK
 * memberi akses lebih dari yang sudah dimiliki user, hanya `drive.file`
 * (berkas yang dibuat/dipilih lewat app ini), dan berumur pendek (~1 jam).
 * Refresh token TIDAK pernah dikirim.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Belum login' }, { status: 401 });

  const app = await oauthAppService.get('google');
  if (app?.driveAccessMode !== 'picker') {
    // Mode 'full' tak butuh Picker — tutup endpoint agar token tak diumbar
    // ke browser tanpa alasan.
    return NextResponse.json({ error: 'Mode Drive bukan picker' }, { status: 409 });
  }

  const accountEmail = req.nextUrl.searchParams.get('accountEmail') ?? undefined;
  const accessToken = await connectionService.getAccessToken(
    user.tenantId, user.id, 'google', accountEmail,
  );
  if (!accessToken) {
    return NextResponse.json(
      { error: 'Akun Google belum terhubung — hubungkan dulu di halaman Knowledge' },
      { status: 404 },
    );
  }
  return NextResponse.json({ accessToken });
}
