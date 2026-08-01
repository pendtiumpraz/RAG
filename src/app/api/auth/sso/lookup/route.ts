import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ssoService } from '@/modules/auth/sso.service';
import { NAMA_KUKI_SSO, domainEmail } from '@/modules/auth/sso';
import { rateLimitBersama } from '@/modules/core/limits-bersama';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({ email: z.string().min(3).max(320) });

/** Umur kuki pemilih koneksi — cukup untuk satu perjalanan ke IdP dan kembali. */
const UMUR_KUKI_DETIK = 600;

/**
 * POST /api/auth/sso/lookup — apakah domain email ini punya SSO?
 *
 * PUBLIK menurut keadaannya: orang yang sedang mencoba masuk belum punya
 * sesi. Karena itu dibatasi laju per IP — endpoint yang menjawab "domain ini
 * punya SSO" adalah alat pemetaan pelanggan kalau bisa ditanyai tanpa batas.
 *
 * Jawabannya SENGAJA cuma { sso: boolean }. Nama tenant, jenis IdP, dan
 * issuer-nya tak pernah dikirim: semuanya struktur internal pelanggan, dan
 * tak satu pun dibutuhkan peramban untuk melanjutkan.
 *
 * Koneksi yang cocok disimpan di KUKI, bukan di URL. Panggilan balik OAuth
 * kembali ke /api/auth/callback/sso tanpa membawa parameter kueri kita, jadi
 * tanpa kuki tak ada cara tahu koneksi mana yang sedang dipakai — dan
 * menebaknya berarti menukar kode otorisasi dengan kredensial yang salah.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const rl = await rateLimitBersama(`sso-lookup:${ip}`, 10, 10 / 60);
  if (!rl.ok) {
    return NextResponse.json({ error: 'Terlalu banyak percobaan' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } });
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ sso: false });

  const domain = domainEmail(parsed.data.email);
  if (!domain) return NextResponse.json({ sso: false });

  const koneksi = await ssoService.resolveByDomain(domain);
  if (!koneksi) return NextResponse.json({ sso: false });

  const res = NextResponse.json({ sso: true });
  res.cookies.set(NAMA_KUKI_SSO, koneksi.id, {
    httpOnly: true,
    /* `lax` WAJIB, bukan `strict`: kuki ini harus ikut terbawa saat IdP
       mengalihkan peramban kembali ke kita, dan `strict` justru menahannya
       tepat pada perjalanan yang membutuhkannya. */
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: UMUR_KUKI_DETIK,
  });
  return res;
}
