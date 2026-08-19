import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { ensureIntegrations } from '@/app/api/_wire';
import { ValidationError } from '@/modules/chatbot/chatbot.service';
import { platformSettingsService } from '@/modules/payments/platform-settings.service';

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
 * Whitelist DOMAIN — lapisan tambahan di atas token master. Daftar domain yang
 * boleh memanggil provisioning DARI PERAMBAN kini DIATUR SUPERADMIN dari DB
 * (platform_settings.s2s_allowed_domains, migrasi 0053), bukan hardcode. Tiap
 * domain juga mencakup subdomainnya (app./admin./dst.). Bawaan
 * 'mairasales.com' (atau env NALAR_S2S_ALLOWED_DOMAIN) dipakai selagi DB kosong.
 *
 * Fungsi ini sengaja MURNI (daftar domain di-inject) supaya bisa diuji tanpa
 * DB — `masterRoute` yang mengambil daftarnya dari service lalu meneruskannya.
 *
 * KEPUTUSAN kasus Origin kosong: request S2S dari server Maira adalah fetch
 * sisi-server dan LAZIM tanpa header Origin/Referer. Karena token master
 * sudah jadi kontrol utama, request tanpa Origin DIIZINKAN — whitelist domain
 * hanya menyaring request yang MEMBAWA Origin (yaitu dari peramban). Origin
 * ADA tapi bukan salah satu domain whitelist → 403.
 */
export function originAllowed(req: NextRequest, allowedDomains: string[]): boolean {
  const source = req.headers.get('origin') || req.headers.get('referer');
  if (!source) return true; // S2S tanpa Origin → dikawal token master saja.
  let host: string;
  try {
    host = new URL(source).hostname.toLowerCase();
  } catch {
    return false; // Origin/Referer ada tapi tak bisa di-parse → tolak.
  }
  return allowedDomains.some((base) => host === base || host.endsWith('.' + base));
}

/**
 * Normalisasi input domain jadi hostname bersih lowercase, atau `null` bila tak
 * masuk akal sebagai domain publik. Menerima 'mairasales.com' maupun
 * 'https://mairasales.com/apa/pun'. Menolak kosong, IP, dan loopback — origin
 * peramban selalu berupa nama domain.
 */
export function normalizeS2sDomain(input: string): string | null {
  const trimmed = input.trim().replace(/^https?:\/\//i, '');
  if (!trimmed) return null;
  let host: string;
  try {
    host = new URL('https://' + trimmed).hostname.toLowerCase();
  } catch {
    return null;
  }
  // Wajib nama domain ber-titik; tolak IP & loopback (bukan origin peramban sah).
  if (!host.includes('.') || /^[\d.]+$/.test(host) || host === 'localhost') return null;
  return host;
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

    const { s2sAllowedDomains } = await platformSettingsService.get();
    if (!originAllowed(req, s2sAllowedDomains)) {
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
