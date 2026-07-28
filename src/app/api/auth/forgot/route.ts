import { NextRequest, NextResponse } from 'next/server';
import { authTokenService } from '@/modules/auth/auth-token.service';
import { mailerService } from '@/modules/mail/mailer.service';
import { rateLimit } from '@/modules/core/limits';

export const runtime = 'nodejs';

/**
 * POST /api/auth/forgot {email} — publik.
 * SELALU membalas 200 yang sama, terdaftar atau tidak — endpoint ini tak
 * boleh jadi alat menebak email mana yang punya akun (pola yang sama dgn
 * login). Email reset hanya benar-benar terkirim bila akunnya ada,
 * ber-password (bukan OAuth-only), dan SMTP aktif.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown';
  if (!rateLimit(`forgot:${ip}`, 5, 1 / 120).ok) {
    return NextResponse.json({ error: 'Terlalu banyak percobaan' }, { status: 429 });
  }
  const { email } = await req.json().catch(() => ({}));
  if (typeof email !== 'string' || !email.includes('@')) {
    return NextResponse.json({ error: 'email wajib' }, { status: 400 });
  }

  const user = await authTokenService.findUserByEmail(email);
  if (user?.hasPassword && await mailerService.isConfigured()) {
    const token = await authTokenService.issue(user.id, 'reset');
    void mailerService.sendPasswordReset(email.trim().toLowerCase(), token);
  }
  return NextResponse.json({ ok: true, message: 'Bila email itu terdaftar, tautan reset sudah dikirim.' });
}
