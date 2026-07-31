import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

/**
 * HALAMAN STATUS & CAKUPAN MIDDLEWARE.
 *
 * Dua kelas kegagalan, dan keduanya diam.
 *
 * Halaman di grup (app) yang lupa didaftarkan di middleware tidak membocorkan
 * data — service tetap memanggil getCurrentUser — tapi gagalnya jadi 500
 * alih-alih pengalihan ke login, dan itu menyamarkan galat auth sebagai galat
 * server. Cacat ini sudah terjadi empat kali sebelum tes ini ada, dua di
 * antaranya pada halaman yang baru ditambahkan minggu ini.
 *
 * Halaman status yang tak menyatakan batasnya sendiri lebih buruk daripada
 * tak ada: saat seluruh layanan mati halaman itu ikut mati, dan pembacanya
 * menyimpulkan "berarti tidak apa-apa".
 */

const MW = readFileSync('src/middleware.ts', 'utf8');
const STATUS = readFileSync('src/app/status/page.tsx', 'utf8');
const HEALTH = readFileSync('src/app/api/health/route.ts', 'utf8');

/** Pola matcher, tanpa komentar. */
const POLA = [...MW.matchAll(/^\s*'([^']+)',/gm)].map((m) => m[1]);

test('SETIAP halaman di grup (app) terdaftar di middleware', () => {
  /* Ini penjagaan yang paling berharga di berkas ini: daftarnya ditulis
     tangan, dan halaman baru selalu lahir tanpa ada yang mengingatkan. */
  const halaman = readdirSync('src/app/(app)', { withFileTypes: true })
    .filter((d) => d.isDirectory()).map((d) => d.name);
  assert.ok(halaman.length > 10, 'daftar halaman kosong — bentuk direktori berubah');

  const hilang = halaman.filter((h) =>
    !POLA.some((p) => p === `/${h}` || p === `/${h}/:path*`));
  assert.deepEqual(hilang, [],
    `halaman (app) tanpa perlindungan middleware:\n  ${hilang.join('\n  ')}`);
});

test('webhook pembayaran TETAP publik', () => {
  /* Menutupnya dengan '/api/payments/:path*' memang menutup celah
     /api/payments/<id>/kuitansi — tapi ia juga menyeret
     /api/payments/callback/<provider>, yang otentikasinya verifikasi
     signature dan BUKAN sesi. Melindunginya berarti setiap pemberitahuan
     pembayaran dialihkan ke halaman login dan tak satu pun tagihan pernah
     ditandai lunas — kegagalan yang baru ketahuan dari keluhan pelanggan. */
  assert.ok(!POLA.includes('/api/payments/:path*'),
    'matcher menyeret webhook gateway ke belakang sesi');
  assert.ok(POLA.includes('/api/payments/:id'), 'detail pembayaran tak dilindungi');
  assert.ok(POLA.includes('/api/payments/:id/kuitansi'), 'rute kuitansi tak dilindungi');
  assert.ok(!POLA.some((p) => p.startsWith('/api/payments/callback')),
    'callback gateway didaftarkan — webhook akan gagal');
});

test('rute publik yang disengaja tidak ikut terlindungi', () => {
  /* Melindungi salah satu dari ini mematikan fitur yang memang dirancang
     tanpa sesi, dan gejalanya muncul di sisi pelanggan lebih dulu. */
  for (const publik of ['/api/health', '/api/v1', '/embed.js', '/status', '/c']) {
    assert.ok(!POLA.some((p) => p === publik || p.startsWith(`${publik}/`)),
      `rute publik ikut dilindungi: ${publik}`);
  }
});

/* ── halaman status ──────────────────────────────────────────────────── */

test('halaman status ada di LUAR grup (app)', () => {
  /* Saat gangguan, yang paling butuh melihatnya justru orang yang tak bisa
     masuk. Menaruhnya di dalam (app) berarti menyembunyikannya persis pada
     saat ia dibutuhkan. */
  assert.ok(STATUS.length > 0);
  const diApp = readdirSync('src/app/(app)', { withFileTypes: true })
    .filter((d) => d.isDirectory()).map((d) => d.name);
  assert.ok(!diApp.includes('status'), 'halaman status berada di belakang sesi');
});

test('halaman status MENYATAKAN batasnya sendiri', () => {
  /* Halaman status yang diam saat gangguan dibaca sebagai "berarti tidak apa-
     apa". Kalimat ini satu-satunya cara ia tetap jujur pada keadaan yang
     justru tak bisa ditampilkannya. */
  assert.ok(/dilayani oleh aplikasi yang sama/.test(STATUS),
    'halaman tak menyebut bahwa ia dipantau dirinya sendiri');
  assert.ok(/tak bisa dibuka\s*<\/b>?\s*|tak bisa dibuka/.test(STATUS),
    'halaman tak menjelaskan arti dirinya tak bisa dibuka');
  assert.ok(/monitor luar|UptimeRobot/.test(STATUS),
    'halaman tak menyarankan pemantauan yang berdiri sendiri');
});

test('halaman status tak menampilkan data tenant apa pun', () => {
  /* Halaman publik yang menyebut nama workspace, jumlah percakapan, atau
     kuota siapa pun membocorkan keadaan bisnis mereka kepada siapa saja yang
     membuka tautannya. */
  for (const bocor of [/withTenant/, /tenantId/, /\/api\/usage/, /\/api\/billing/, /\/api\/analytics/, /conversations/]) {
    assert.ok(!bocor.test(STATUS), `halaman status menyentuh data tenant: ${bocor}`);
  }
  // Satu-satunya sumbernya adalah endpoint kesehatan yang memang publik.
  const fetches = [...STATUS.matchAll(/fetch\('([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(fetches, ['/api/health'], `halaman status memanggil ${fetches.join(', ')}`);
});

test('503 tetap DIBACA, bukan diperlakukan sebagai gagal', () => {
  /* Balasan 503 membawa badan yang bisa dibaca, dan itu justru keadaan yang
     paling ingin dilihat orang. Melemparnya ke cabang "tak terjangkau" akan
     menghapus satu-satunya keterangan yang tersedia saat gangguan. */
  assert.ok(/r\.json\(\)\.catch\(\(\) => null\)/.test(STATUS), 'badan respons tak diurai');
  assert.ok(/r\.ok && data\?\.ok/.test(STATUS), 'status sehat tak menuntut keduanya');
  assert.ok(/jenis: 'terganggu', data/.test(STATUS), 'data 503 dibuang');
});

test('endpoint kesehatan tetap membalas 503 saat DB mati', () => {
  /* 200 dengan "ok: false" akan terbaca SEHAT oleh kebanyakan monitor —
     kegagalan yang membuat pemantauan tampak bekerja sambil tak pernah
     berbunyi. */
  assert.ok(/status: dbOk \? 200 : 503/.test(HEALTH), 'health tak lagi membalas 503');
  assert.ok(/'cache-control': 'no-store'/.test(HEALTH), 'health boleh disinggahkan');
  // Permukaan minim: tak menyebut versi, nama tabel, atau jumlah tenant.
  for (const bocor of [/version/i, /tenant/i, /count\(/]) {
    assert.ok(!bocor.test(HEALTH.replace(/\/\*[\s\S]*?\*\//g, '')),
      `health membocorkan detail: ${bocor}`);
  }
});
