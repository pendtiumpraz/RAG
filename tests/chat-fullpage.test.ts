import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env.DATABASE_URL ??= 'postgres://x:y@localhost:5432/z';
process.env.CREDENTIALS_ENCRYPTION_KEY ??= '0'.repeat(64);

/**
 * CHAT HALAMAN PENUH + MODE EMBED INLINE.
 *
 * Permukaan PUBLIK tanpa sesi login. Yang dijaga di sini adalah hal-hal yang
 * kalau salah tidak menimbulkan galat apa pun — hanya kebocoran, atau fitur
 * yang mati diam-diam pada sebagian pemasangan.
 */

const SESI = readFileSync('src/app/api/chat/[chatbotId]/sessions/route.ts', 'utf8');
const HAL = readFileSync('src/app/c/[publicKey]/page.tsx', 'utf8');
const EMBED = readFileSync('public/embed.js', 'utf8');
const MW = readFileSync('src/middleware.ts', 'utf8');
const CFG = readFileSync('next.config.mjs', 'utf8');

test('daftar sesi disaring visitorId DI DALAM kueri, bukan sesudahnya', () => {
  /* visitorId adalah SATU-SATUNYA hal yang memisahkan riwayat antar
     pengunjung di permukaan tanpa login. Menyaringnya di aplikasi — setelah
     baris terlanjur terambil — berarti satu `return` yang terlewat cukup
     untuk membocorkan transkrip orang lain. */
  const kueri = SESI.slice(SESI.indexOf('select c.id'), SESI.indexOf('limit ${MAX_SESSIONS}'));
  assert.ok(/c\.visitor_id\s*=\s*\$\{visitorId\}/.test(kueri),
    'visitorId tak ikut kondisi kueri');
  assert.ok(/c\.chatbot_id\s*=\s*\$\{bot\.id\}/.test(kueri),
    'satu publicKey bisa membaca percakapan chatbot lain di tenant yang sama');
  assert.ok(/c\.deleted_at is null/.test(kueri), 'percakapan terhapus ikut terbaca');
});

test('visitorId kosong dijawab daftar kosong, bukan seluruh percakapan', () => {
  // Kegagalan paling mahal di endpoint semacam ini: parameter hilang lalu
  // penyaringnya ikut hilang, dan endpoint membalas SEMUA baris.
  const jaga = SESI.slice(SESI.indexOf('const visitorId'), SESI.indexOf('const rows'));
  assert.ok(/if \(!visitorId\) return kosong\(\)/.test(jaga),
    'visitorId yang tak dikirim tidak dihentikan sebelum kueri');
});

test('origin tetap dijaga daftar izin chatbot', () => {
  assert.ok(/corsFor\(req\.headers\.get\('origin'\)/.test(SESI), 'origin tak diperiksa');
  assert.ok(/if \(!cors\) return new Response\('Origin not allowed', \{ status: 403 \}\)/.test(SESI),
    'origin yang tak diizinkan tetap dilayani');
});

test('halaman /c tidak berada di balik middleware sesi', () => {
  /* Kalau ia masuk matcher, pengunjung dialihkan ke halaman login — dan
     seluruh gunanya (tautan publik yang tinggal dibuka) hilang. Gagalnya
     tak terlihat di tes mana pun kecuali yang ini. */
  const matcher = MW.slice(MW.indexOf('matcher: ['), MW.indexOf(']', MW.indexOf('matcher: [')));
  assert.ok(!/'\/c\//.test(matcher) && !/'\/c'/.test(matcher),
    'rute chat publik /c masuk matcher middleware — pengunjung akan dialihkan ke login');
});

test('kunci pengunjung SAMA dengan embed.js', () => {
  /* Kalau berbeda, gelembung dan halaman penuh jadi dua dunia: pengunjung
     yang mengobrol lewat gelembung lalu membuka tautan halaman penuh
     menemukan riwayatnya kosong, padahal ada. */
  assert.ok(/'nalar_visitor'/.test(EMBED), 'embed.js mengubah kunci pengunjung');
  assert.ok(/VISITOR_KEY = 'nalar_visitor'/.test(HAL),
    'halaman penuh memakai kunci pengunjung yang berbeda dari embed.js');
});

test('mode inline memuat halaman penuh, tidak menggambar ulang antarmukanya', () => {
  // Menyalin seluruh antarmuka ke JavaScript biasa berarti dua tempat yang
  // harus diperbaiki tiap kali ada perubahan — dan yang satu pasti tertinggal.
  const blok = EMBED.slice(EMBED.indexOf("data-mode"), EMBED.indexOf('function render'));
  assert.ok(/createElement\('iframe'\)/.test(blok), 'mode inline tak memakai iframe');
  assert.ok(/host \+ '\/c\/' \+ encodeURIComponent\(key\)/.test(blok),
    'iframe tak menunjuk halaman chat penuh');
  /* Diperiksa dari NILAI atributnya, bukan dari blok kodenya: komentar di
     sekitarnya menyebut "allow-popups" justru untuk menjelaskan kenapa ia
     tidak diberikan, dan penjaring yang membaca seluruh blok akan tertipu
     oleh penjelasan itu sendiri. */
  const sandbox = /setAttribute\('sandbox', '([^']+)'\)/.exec(blok)?.[1] ?? '';
  assert.ok(sandbox.includes('allow-same-origin'),
    'sandbox tanpa allow-same-origin → localStorage tak terbaca, tiap muat ulang jadi pengunjung baru');
  assert.ok(sandbox.includes('allow-scripts'), 'sandbox tanpa allow-scripts → halaman chat mati total');
  assert.ok(!sandbox.includes('allow-popups'),
    'iframe boleh membuka jendela — chatbot tak punya alasan melakukannya');
  assert.ok(!sandbox.includes('allow-top-navigation'),
    'iframe bisa memindahkan halaman pelanggan ke alamat lain');
});

test('mode inline keluar sebelum mesin gelembung dibangun', () => {
  // Bukan kerapian: pada mode inline seluruh CSS, state sesi, dan pendengar
  // peristiwa milik gelembung tak boleh pernah dibuat di halaman pelanggan.
  const iInline = EMBED.indexOf("=== 'inline'");
  const iRender = EMBED.indexOf('function render');
  assert.ok(iInline > 0 && iInline < iRender, 'cabang inline tak berada sebelum render gelembung');
  const cabang = EMBED.slice(iInline, iRender);
  assert.ok(/\n    return;\n  \}/.test(cabang), 'cabang inline tak berhenti — gelembung ikut terpasang');
});

test('hanya /c yang boleh dibingkai; sisanya tidak', () => {
  /* Selama produk ini tak memakai iframe, tak adanya proteksi framing tak
     kentara. Begitu iframe jadi pola resmi, membiarkan dasbor bisa dibingkai
     adalah kelalaian — kliknya bisa dicuri (clickjacking). */
  assert.ok(/source: '\/c\/:path\*'/.test(CFG), 'halaman /c tak dinyatakan boleh dibingkai');
  assert.ok(/frame-ancestors \*/.test(CFG), 'mode inline akan diblokir peramban');
  assert.ok(/X-Frame-Options/.test(CFG) && /frame-ancestors 'none'/.test(CFG),
    'sisa aplikasi masih bisa dibingkai siapa pun');
  assert.ok(/source: '\/\(\(\?\!c\/\)\.\*\)'/.test(CFG),
    'aturan larangan framing tidak mengecualikan /c — mode inline akan mati');
});
