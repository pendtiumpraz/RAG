import { NextRequest, NextResponse } from 'next/server';
import { apikeyService, type ApiCaller, type Scope } from '@/modules/integrations/apikey.service';
import { ensureIntegrations } from '@/app/api/_wire';
import { ValidationError } from '@/modules/chatbot/chatbot.service';

/**
 * Pembungkus rute API PUBLIK v1 — autentikasi lewat API key, bukan sesi.
 *
 * Rute di bawah `/api/v1/*` SENGAJA tidak didaftarkan di `src/middleware.ts`:
 * pemanggilnya adalah mesin, dan mengalihkan mereka ke halaman login jelas
 * tak berguna. Penjagaannya ada di sini.
 *
 * Kunci dikirim seperti kebiasaan umum, keduanya diterima supaya klien tak
 * perlu menebak:
 *   Authorization: Bearer nk_live_…
 *   X-Api-Key: nk_live_…
 */
export function apiRoute<C>(
  scope: Scope,
  handler: (req: NextRequest, ctx: C, caller: ApiCaller) => Promise<NextResponse>,
) {
  return async (req: NextRequest, ctx: C): Promise<NextResponse> => {
    /* Dipasang di titik masuk, bukan saat impor: urutan pemuatan modul tak
       boleh menentukan apakah integrasi hidup. Memanggil ensureIntegrations()
       — BUKAN wireWebhooks() langsung — supaya integrasi berikutnya yang
       ditambahkan di sana ikut hidup di jalur v1 tanpa ada yang perlu ingat
       menambahkannya dua kali. Jalur ini sempat memasang webhook saja, dan
       saluran peringatan tak akan pernah terkirim dari permintaan API. */
    ensureIntegrations();

    const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    const raw = bearer || req.headers.get('x-api-key') || '';
    const caller = await apikeyService.resolve(raw);

    if (!caller) {
      return json401('Kunci API tidak sah, dicabut, atau kedaluwarsa.');
    }
    // `write` mencakup `read`; selebihnya harus disebut eksplisit. Tanpa
    // pelonggaran ini setiap kunci tulis juga wajib mencantumkan baca, dan
    // itu jebakan konfigurasi yang tak menambah keamanan apa pun.
    const allowed = caller.scopes.includes(scope)
      || (scope === 'read' && caller.scopes.includes('write'));
    if (!allowed) {
      return NextResponse.json(
        { error: `Kunci ini tidak punya izin "${scope}".` },
        { status: 403 },
      );
    }

    try {
      return await handler(req, ctx, caller);
    } catch (e) {
      if (e instanceof ValidationError) {
        return NextResponse.json({ error: e.message }, { status: 422 });
      }
      // Galat tak terduga TIDAK dibocorkan isinya ke pemanggil luar.
      console.error('[api/v1]', e);
      return NextResponse.json({ error: 'Galat internal.' }, { status: 500 });
    }
  };
}

function json401(message: string): NextResponse {
  return NextResponse.json({ error: message }, {
    status: 401,
    // Menyebut skema-nya membuat klien HTTP standar tahu apa yang kurang.
    headers: { 'WWW-Authenticate': 'Bearer realm="Nalar API"' },
  });
}
