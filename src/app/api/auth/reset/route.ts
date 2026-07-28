import { NextRequest, NextResponse } from 'next/server';
import { authTokenService } from '@/modules/auth/auth-token.service';
import { rateLimit } from '@/modules/core/limits';

export const runtime = 'nodejs';

/** POST /api/auth/reset {token, password} — publik (dari tautan email, 1 jam). */
export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown';
  if (!rateLimit(`reset:${ip}`, 10, 1 / 60).ok) {
    return NextResponse.json({ error: 'Terlalu banyak percobaan' }, { status: 429 });
  }
  const { token, password } = await req.json().catch(() => ({}));
  if (typeof token !== 'string' || typeof password !== 'string' || password.length < 8) {
    return NextResponse.json({ error: 'Password minimal 8 karakter' }, { status: 400 });
  }
  const userId = await authTokenService.consume('reset', token);
  if (!userId) return NextResponse.json({ error: 'Tautan tidak valid atau kedaluwarsa' }, { status: 400 });
  await authTokenService.setPassword(userId, password);
  return NextResponse.json({ ok: true });
}
