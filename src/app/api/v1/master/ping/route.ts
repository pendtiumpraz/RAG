import { NextResponse } from 'next/server';
import { masterRoute } from '../../_master';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/master/ping — verifikasi NALAR_MASTER_KEY, TANPA efek samping.
 *
 * ── KENAPA ADA ──────────────────────────────────────────────────────────────
 *
 * Maira punya tombol "Test Connection" untuk master key. Ia memanggil
 * `GET /api/v1/me` — dan itu SELALU gagal 401, bahkan saat master key-nya
 * benar, karena `/me` dijaga `apiRoute` yang me-resolve KUNCI API TENANT dari
 * database. Master key bukan kunci tenant; ia string env yang dicek
 * `masterRoute`. Jadi tesnya menguji hal yang salah, dan jawabannya selalu
 * "gagal" tanpa peduli konfigurasinya.
 *
 * Satu-satunya endpoint bertoken master sebelum ini adalah POST: membuat tenant
 * dan membuat kunci. Keduanya punya efek samping — memakainya sebagai tes
 * berarti setiap kali orang menekan "Test Connection", satu tenant Nalar lahir.
 *
 * Karena itu endpoint ini: GET, bertoken master, tidak menyentuh apa pun.
 *
 * ── APA YANG DIBUKTIKANNYA ──────────────────────────────────────────────────
 *
 * 200 = master key yang dikirim pemanggil COCOK dengan `NALAR_MASTER_KEY` di
 * server ini, dan panjangnya lolos ambang. Itu saja — ia tidak menjanjikan
 * kuota, tidak menjanjikan tenant mana pun ada.
 *
 * TIDAK ADA nilai rahasia di balasannya. Sengaja: yang butuh tahu kuncinya
 * sudah memilikinya, dan yang tidak memilikinya tidak akan pernah sampai ke
 * sini.
 */
export const GET = masterRoute(async () =>
  NextResponse.json({
    ok: true,
    service: 'nalar',
    // Dipakai pemanggil untuk membedakan "jawaban segar" dari jawaban yang
    // ter-cache di perantara — tes koneksi yang membaca cache tidak menguji apa
    // pun.
    at: new Date().toISOString(),
  }));
