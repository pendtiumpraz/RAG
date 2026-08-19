import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { ensureIntegrations } from '@/app/api/_wire';
import { ValidationError } from '@/modules/chatbot/chatbot.service';

/**
 * Pembungkus rute S2S BERTOKEN MASTER — untuk provisioning tenant baru & mint
 * kunci per-tenant (B3/B4). Ini SENGAJA di luar apiRoute(scope): kunci scope
 * milik satu tenant, sedangkan rute ini justru MEMBUAT tenant, jadi tak ada
 * tenant untuk di-scope. Token master = kunci ke seluruh platform → hanya
 * dipakai server-ke-server tepercaya (mis. server Maira), tak pernah di
 * peramban.
 *
 * Token dikirim sama seperti kunci API: `Authorization: Bearer <token>` atau
 * `X-Api-Key`. Nilainya di env `NALAR_MASTER_KEY`. Bila env kosong/pendek,
 * jalurnya dianggap TIDAK DIKONFIGURASI (503) — env kosong tak boleh jadi
 * pintu terbuka.
 */
const MIN_KEY_LEN = 32;

function masterKeyOk(raw: string): boolean {
  const expected = process.env.NALAR_MASTER_KEY ?? '';
  if (expected.length < MIN_KEY_LEN) return false;
  const a = Buffer.from(raw, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Whitelist DOMAIN — lapisan tambahan di atas token master. Hanya
 * mairasales.com (+ subdomain: app./admin./dst.) yang boleh memanggil
 * provisioning dari peramban. Domain dasar bisa dioverride via
 * `NALAR_S2S_ALLOWED_DOMAIN` (staging), default 'mairasales.com'.
 *
 * KEPUTUSAN kasus Origin kosong: request S2S dari server Maira adalah fetch
 * sisi-server dan LAZIM tanpa header Origin/Referer. Karena token master
 * sudah jadi kontrol utama, request tanpa Origin DIIZINKAN — whitelist domain
 * hanya menyaring request yang MEMBAWA Origin (yaitu dari peramban). Origin
 * ADA tapi bukan mairasales.com → 403.
 */
export function originAllowed(req: NextRequest): boolean {
  const base = (process.env.NALAR_S2S_ALLOWED_DOMAIN || 'mairasales.com').toLowerCase();
  const source = req.headers.get('origin') || req.headers.get('referer');
  if (!source) return true; // S2S tanpa Origin → dikawal token master saja.
  let host: string;
  try {
    host = new URL(source).hostname.toLowerCase();
  } catch {
    return false; // Origin/Referer ada tapi tak bisa di-parse → tolak.
  }
  return host === base || host.endsWith('.' + base);
}

export function masterRoute<C>(
  handler: (req: NextRequest, ctx: C) => Promise<NextResponse>,
) {
  return async (req: NextRequest, ctx: C): Promise<NextResponse> => {
    ensureIntegrations();

    if ((process.env.NALAR_MASTER_KEY ?? '').length < MIN_KEY_LEN) {
      return NextResponse.json(
        { error: 'Provisioning S2S tidak dikonfigurasi.' }, { status: 503 });
    }

    const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    const raw = bearer || req.headers.get('x-api-key') || '';
    if (!raw || !masterKeyOk(raw)) {
      return NextResponse.json({ error: 'Token master tidak sah.' }, {
        status: 401,
        headers: { 'WWW-Authenticate': 'Bearer realm="Nalar Master"' },
      });
    }

    if (!originAllowed(req)) {
      return NextResponse.json(
        { error: 'Origin tidak diizinkan untuk provisioning S2S.' }, { status: 403 });
    }

    try {
      return await handler(req, ctx);
    } catch (e) {
      if (e instanceof ValidationError) {
        return NextResponse.json({ error: e.message }, { status: 422 });
      }
      console.error('[api/v1/master]', e);
      return NextResponse.json({ error: 'Galat internal.' }, { status: 500 });
    }
  };
}
