import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authService } from '@/modules/auth/auth.service';
import { rateLimitBersama } from '@/modules/core/limits-bersama';

export const runtime = 'nodejs';

const Body = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(200),
});

/**
 * POST /api/auth/login-status — KENAPA login barusan gagal.
 *
 * NextAuth sengaja menolak akun pending dengan cara yang sama seperti password
 * salah, supaya endpoint login tak bisa dipakai menebak email mana yang
 * terdaftar. Tapi pengguna yang sah berhak tahu bahwa akunnya sedang menunggu
 * verifikasi — bukan mengira salah ketik password.
 *
 * Endpoint ini menjembatani keduanya: ia hanya menyebut status akun SETELAH
 * password terbukti benar. Password salah selalu dijawab `invalid`, jadi tak
 * ada informasi yang bisa dipanen tanpa kredensial yang sah.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const rl = await rateLimitBersama(`login-status:${ip}`, 10, 10 / 60);
  if (!rl.ok) {
    return NextResponse.json({ outcome: 'invalid' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } });
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ outcome: 'invalid' });

  const outcome = await authService.credentialOutcome(parsed.data.email, parsed.data.password);
  return NextResponse.json({ outcome });
}
