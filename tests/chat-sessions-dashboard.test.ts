import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env.DATABASE_URL ??= 'postgres://x:y@localhost:5432/z';
process.env.CREDENTIALS_ENCRYPTION_KEY ??= '0'.repeat(64);

/**
 * REL SESI DI KONSOL CHAT DASBOR.
 *
 * Sebelumnya percakapan lama hanya bisa DIBACA di halaman Conversations, dan
 * dibaca saja — tak bisa dilanjutkan. Pemilik chatbot yang sedang menguji
 * jawaban justru paling sering ingin kembali ke sesi kemarin lalu bertanya
 * susulan; menyuruhnya membuka tab lain, membaca, mengingat, dan mengetik
 * ulang dari nol adalah alur yang membuat orang berhenti menguji.
 */

const P = readFileSync('src/app/(app)/chat/page.tsx', 'utf8');
const CSS = readFileSync('src/app/(app)/chat/chat.css', 'utf8');

test('daftar sesi memakai endpoint yang SAMA dengan halaman Conversations', () => {
  /* Endpoint baru untuk daftar yang sama akan menyimpang begitu salah satunya
     diubah — dan yang menyimpang diam-diam adalah yang jarang dibuka. */
  assert.ok(/\/api\/conversations\?chatbotId=/.test(P),
    'rel sesi memakai sumber sendiri, bukan endpoint Conversations');
  // Transkrip juga: satu endpoint, bukan salinan kedua.
  assert.ok(/\/api\/conversations\/\$\{id\}/.test(P), 'transkrip tak diambil dari endpoint yang ada');
});

test('membuka sesi lama MEMULIHKAN blok tersimpan, bukan teks polos saja', () => {
  /* Jawaban disimpan sebagai blok terstruktur (tabel, kartu, daftar).
     Memulihkannya sebagai teks polos akan membuat percakapan lama terlihat
     lebih miskin dari saat ia pertama kali dijawab — dan pemiliknya akan
     mengira produknya memburuk. */
  const fn = P.slice(P.indexOf('async function bukaSesi'), P.indexOf('const lastSources'));
  assert.ok(/m\.blocks\?\.length \? \{ blocks:/.test(fn), 'blok tersimpan tak dipakai');
  assert.ok(/: \{ text: m\.content \}/.test(fn),
    'tak ada cadangan teks polos untuk pesan lama yang lahir sebelum blok ada');
  assert.ok(/sources: m\.citations/.test(fn), 'sitasi hilang saat sesi lama dibuka');
});

test('sesi yang sedang berjalan ditandai dari convId, bukan keanggotaan daftar', () => {
  /* Sesi baru belum ada di daftar sampai giliran pertamanya tersimpan. Kalau
     penandanya dihitung dari daftar, sesi yang BARU SAJA dibuka tampak tak
     terpilih — dan orang menekannya lagi. */
  assert.ok(/s\.id === convId \? ' on' : ''/.test(P), 'sesi aktif tak ditandai dari convId');
});

test('rel disegarkan saat sesi BARU lahir, bukan tiap giliran', () => {
  // Menyegarkan tiap giliran berarti satu kueri agregat per pesan, dan yang
  // berubah cuma cap waktunya.
  const blok = P.slice(P.indexOf("if (ev === 'meta')"), P.indexOf("if (ev === 'meta')") + 500);
  assert.ok(/if \(baru !== convId\)/.test(blok),
    'rel disegarkan tiap giliran — kueri agregat per pesan tanpa perubahan berarti');
  assert.ok(/sesi\.refetch\(\)/.test(blok));
});

test('membuka sesi lain DITOLAK saat jawaban sedang mengalir', () => {
  /* Berpindah di tengah stream akan menimpa pesan yang sedang tumbuh, dan
     jawaban yang hilang di tengah terbaca sebagai produk yang rusak. */
  const fn = P.slice(P.indexOf('async function bukaSesi'), P.indexOf('const lastSources'));
  assert.ok(/if \(id === convId \|\| busy\) return;/.test(fn),
    'sesi bisa diganti saat giliran masih berjalan');
  assert.ok(/disabled=\{busy\}/.test(P), 'tombol sesi tetap aktif saat streaming');
});

test('rel menyempit lebih dulu daripada panel sitasi', () => {
  /* Urutan menyembunyikan ditentukan oleh apa yang paling sering dibutuhkan
     SAAT ITU JUGA: daftar sesi dibuka sesekali untuk berpindah, sitasi dibaca
     pada tiap jawaban. */
  const iRail = CSS.indexOf('.sesi-rail{ display:none; }');
  assert.ok(iRail > 0, 'rel sesi tak pernah disembunyikan di layar sempit');
  const mRail = /max-width:(\d+)px\)\{ \.chat-shell\{ grid-template-columns:1fr 330px; \}/.exec(CSS);
  const mCite = /max-width:(\d+)px\)\{ \.chat-shell\{ grid-template-columns:1fr; \}/.exec(CSS);
  assert.ok(mRail && mCite, 'titik henti layout tak ditemukan');
  assert.ok(Number(mRail![1]) > Number(mCite![1]),
    'panel sitasi menghilang sebelum rel sesi — urutannya terbalik');
});

test('pratinjau sesi dua baris, dan sesi tanpa pertanyaan tetap terbaca', () => {
  // Pertanyaan pembuka sering baru membedakan dua sesi di kata kelima, dan
  // satu baris memotongnya tepat sebelum itu.
  assert.ok(/-webkit-line-clamp:2/.test(CSS), 'pratinjau sesi dipotong satu baris');
  assert.ok(/\(tanpa pertanyaan\)/.test(P),
    'sesi yang belum punya pesan pengguna tampil sebagai baris kosong');
});
