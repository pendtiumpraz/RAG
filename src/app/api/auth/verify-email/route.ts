import { NextRequest, NextResponse } from 'next/server';
import { authTokenService } from '@/modules/auth/auth-token.service';
import { rateLimitBersama } from '@/modules/core/limits-bersama';

export const runtime = 'nodejs';

/** POST /api/auth/verify-email {token} — publik (dari tautan email).
 *  Token = otentikasinya; sekali pakai, 24 jam. */
export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown';
  if (!(await rateLimitBersama(`verify:${ip}`, 10, 1 / 60)).ok) {
    return NextResponse.json({ error: 'Terlalu banyak percobaan' }, { status: 429 });
  }
  const { token } = await req.json().catch(() => ({}));
  if (typeof token !== 'string' || !token) {
    return NextResponse.json({ error: 'token wajib' }, { status: 400 });
  }
  const userId = await authTokenService.consume('verify', token);
  if (!userId) return NextResponse.json({ error: 'Tautan tidak valid atau kedaluwarsa' }, { status: 400 });
  await authTokenService.markEmailVerified(userId);
  return NextResponse.json({ ok: true });
}
