import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { PESAN_KUOTA, PESAN_LAJU, pesanBatas } from '../src/modules/chat/pesan-batas';

/**
 * BATAS PADA ENDPOINT CHAT PUBLIK — dua batas, satu status HTTP.
 *
 * Kegagalan di sini tak melempar apa pun dan tak terlihat di dasbor: yang
 * salah hanya kalimat yang dibaca ORANG LUAR, di situs orang lain, dan
 * pemiliknya tak pernah melihatnya sendiri.
 */

const RUTE = readFileSync('src/app/api/chat/[chatbotId]/route.ts', 'utf8');
const EMBED = readFileSync('public/embed.js', 'utf8');
const USAGE = readFileSync('src/modules/usage/usage.service.ts', 'utf8');

test('pesan kuota TIDAK menjanjikan pulih sebentar lagi', () => {
  /* Kuota bulanan tak pulih sampai tanggal 1. Kalimat "coba lagi sebentar"
     membuat pengunjung mencoba lagi sepanjang sisa bulan — dan tiap
     percobaan itu tetap memakai sumber daya kita. */
  assert.ok(!/sebentar/i.test(PESAN_KUOTA), `pesan kuota menjanjikan pulih sebentar: ${PESAN_KUOTA}`);
  // Sedangkan rate limit MEMANG pulih sebentar — di sana kalimat itu benar.
  assert.ok(/sebentar/i.test(PESAN_LAJU), 'pesan rate limit kehilangan petunjuk waktunya');
  assert.notEqual(PESAN_KUOTA, PESAN_LAJU, 'kedua batas kembali memakai kalimat yang sama');
  assert.equal(pesanBatas('kuota'), PESAN_KUOTA);
  assert.equal(pesanBatas('laju'), PESAN_LAJU);
});

test('pesan publik tak membocorkan keadaan bisnis pemilik', () => {
  /* Sebelum kartu ini, endpoint publik membalas "Kuota pesan bulan ini habis
     (5.000 pesan). Upgrade plan untuk lanjut." kepada pengunjung ANONIM mana
     pun — membocorkan kuota persis pemilik situs, dan karenanya tingkat
     paketnya, sekaligus menyuruh pengunjung meng-upgrade langganan orang
     lain. */
  assert.ok(!/\d/.test(PESAN_KUOTA), `pesan publik memuat angka: ${PESAN_KUOTA}`);
  for (const bocor of [/upgrade/i, /plan|paket/i, /kuota/i, /langgan/i]) {
    assert.ok(!bocor.test(PESAN_KUOTA), `pesan publik menyebut keadaan langganan: ${PESAN_KUOTA}`);
  }
  // Tetap memberi pengunjung satu hal yang bisa dilakukan.
  assert.ok(/hubungi pemilik/i.test(PESAN_KUOTA), 'pesan publik tak memberi jalan keluar apa pun');
});

test('rute publik memakai pesan bersama, bukan QuotaExceededError', () => {
  assert.ok(/PESAN_KUOTA/.test(RUTE) && /PESAN_LAJU/.test(RUTE),
    'rute tak memakai pesan batas bersama');
  assert.ok(!/QuotaExceededError/.test(RUTE),
    'rute publik masih memakai pesan berangka milik pemilik');
  // Pesan berangka itu tetap ADA — untuk pemiliknya, bukan untuk pengunjung.
  assert.ok(/class QuotaExceededError/.test(USAGE),
    'pesan berangka untuk pemilik ikut terhapus — halaman Usage kehilangan penjelasannya');
});

test('kedua batas membawa kode mesin, dan statusnya TIDAK diubah', () => {
  /* Mengubah 429 jadi 402 akan mengubah kontrak yang dibaca widget yang sudah
     TERPASANG di situs pelanggan — dan widget itulah satu-satunya bagian
     sistem ini yang tak bisa kita perbarui sendiri. Yang ditambahkan harus
     bersifat aditif: pembaca lama tetap melihat 429 dan pesan yang benar. */
  assert.ok(/kode: 'kuota'/.test(RUTE), 'balasan kuota tak membawa kode mesin');
  assert.ok(/kode: 'laju'/.test(RUTE), 'balasan rate limit tak membawa kode mesin');
  assert.ok(!/status: 402/.test(RUTE), 'status diubah — kontrak widget terpasang ikut berubah');
  const jumlah429 = (RUTE.match(/status: 429/g) ?? []).length;
  assert.equal(jumlah429, 2, `harusnya tepat dua balasan 429, ditemukan ${jumlah429}`);
});

test('Retry-After hanya dikirim pada batas yang MEMANG pulih', () => {
  /* Header itu adalah janji yang dibaca mesin. Mengirimnya untuk kuota
     bulanan menyuruh klien mencoba ulang sepanjang sisa bulan. */
  const blokKuota = RUTE.slice(RUTE.indexOf("kode: 'kuota'"), RUTE.indexOf("kode: 'kuota'") + 220);
  assert.ok(!/Retry-After/.test(blokKuota),
    'balasan kuota mengirim Retry-After — klien akan mencoba ulang terus');
  const blokLaju = RUTE.slice(RUTE.indexOf("kode: 'laju'"), RUTE.indexOf("kode: 'laju'") + 220);
  assert.ok(/Retry-After/.test(blokLaju), 'balasan rate limit kehilangan Retry-After');
});

test('widget menampilkan pesan DARI SERVER, tak menyalinnya', () => {
  /* Widget terpasang di situs pelanggan dan tak bisa kita perbarui. Kalimat
     yang disalin ke dalamnya akan membeku di sana selamanya, bahkan setelah
     kalimat di server diperbaiki. */
  assert.ok(/res\.json\(\)\.then/.test(EMBED), 'widget tak membaca badan respons 429');
  assert.ok(/j && j\.error/.test(EMBED), 'widget tak memakai pesan dari server');
  assert.ok(!/Coba lagi sebentar\.'/.test(EMBED),
    'widget masih menyalin kalimat "coba lagi sebentar" untuk semua 429');
  // Tetap ada cadangan bila badan responsnya tak terbaca — layar kosong
  // lebih buruk daripada kalimat umum.
  assert.ok(/\.catch\(function \(\) \{/.test(EMBED), 'tak ada cadangan saat badan galat tak terbaca');
});

test('halaman chat publik mengurai JSON galat, bukan menampilkannya mentah', () => {
  const hal = readFileSync('src/app/c/[publicKey]/page.tsx', 'utf8');
  assert.ok(/res\.json\(\)\.catch\(\(\) => null\)/.test(hal),
    'halaman /c melempar teks mentah — pengunjung melihat JSON apa adanya');
  assert.ok(/j\?\.error \|\|/.test(hal), 'halaman /c tak memakai pesan dari server');
});
