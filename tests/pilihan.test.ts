import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { bacaPilihan, centang, ringkasPilihan } from '../src/modules/core/pilihan';

/**
 * PILIHAN DI KARTU BACKLOG.
 *
 * Yang dijaga di sini bukan "centangnya berpindah" — itu jalur bahagia, dan
 * kerusakannya langsung terlihat di layar. Yang dijaga: catatan panjang di
 * kolom `why` TIDAK ikut rusak, dan dua jawaban yang saling bertentangan
 * tidak bisa tercentang bersamaan. Keduanya rusak diam-diam, dan keduanya
 * baru ketahuan berhari-hari kemudian saat kartunya dibaca lagi.
 */

const KARTU = [
  'Batas per-lambda berlipat sebanyak instance yang hidup.',
  '',
  'PILIHAN (pilih satu):',
  '- ( ) Tunggu Redis',
  '- (x) Ember token di Postgres',
  '',
  'PILIHAN (boleh lebih dari satu):',
  '- [x] Microsoft Entra',
  '- [ ] Google Workspace',
  '',
  'Catatan panjang yang mahal ditulis dan tak boleh hilang.',
].join('\n');

/* ── membaca ─────────────────────────────────────────────────────────── */

test('opsi terbaca beserta bentuk dan bloknya', () => {
  const p = bacaPilihan(KARTU);
  assert.equal(p.length, 4);
  assert.deepEqual(p.map((x) => x.teks),
    ['Tunggu Redis', 'Ember token di Postgres', 'Microsoft Entra', 'Google Workspace']);
  assert.deepEqual(p.map((x) => x.dipilih), [false, true, true, false]);
  assert.deepEqual(p.map((x) => x.tunggal), [true, true, false, false]);
  // Blok berbeda — kalau sama, mencentang SSO akan melepas jawaban ratelimit.
  assert.notEqual(p[0].blok, p[2].blok);
  assert.equal(p[0].blok, p[1].blok);
});

test('prosa biasa TIDAK disangka opsi', () => {
  /* Kolom ini berisi karangan panjang penuh tanda hubung. Pengurai yang
     cerewet akan mengubah kalimat biasa jadi kendali yang bisa diklik. */
  const prosa = [
    'Sebabnya tiga:',
    '- pertama, tak perlu migrasi',
    '- kedua, keputusan dan alasannya satu tempat',
    'Bukan daftar tugas.',
  ].join('\n');
  assert.deepEqual(bacaPilihan(prosa), []);
  assert.deepEqual(bacaPilihan(''), []);
  assert.deepEqual(bacaPilihan(null), []);
});

test('baris KOSONG tidak memutus blok, tapi PROSA memutusnya', () => {
  /* Daftar opsi sering diberi jarak; kalau baris kosong memutus, tiap
     kelompok berjarak jadi blok sendiri dan sifat saling-meniadakannya
     hilang. Sebaliknya kalau prosa TIDAK memutus, dua keputusan berbeda
     yang kebetulan berdekatan akan saling melepas centang. */
  const a = bacaPilihan('PILIHAN (pilih satu):\n- ( ) A\n\n- ( ) B');
  assert.equal(a[0].blok, a[1].blok, 'baris kosong memutus blok');

  const b = bacaPilihan('PILIHAN:\n- ( ) A\nKalimat lain.\n- ( ) B');
  assert.notEqual(b[0].blok, b[1].blok, 'prosa tidak memutus blok');
});

/* ── mencentang ──────────────────────────────────────────────────────── */

test('hanya BARIS ITU yang ditulis ulang — catatan lain utuh', () => {
  /* Bentuk kegagalan paling mahal di berkas ini. Penyusun ulang yang
     sedikit meleset akan merusak catatan panjang yang tak bisa
     dikembalikan, dan rusaknya baru terlihat saat kartunya dibaca lagi. */
  const baru = centang(KARTU, 0, true);
  const a = KARTU.split('\n'); const b = baru.split('\n');
  assert.equal(a.length, b.length, 'jumlah baris berubah');
  const berubah = a.map((x, i) => (x === b[i] ? null : i)).filter((x) => x !== null);
  // Baris 3 dicentang, baris 4 dilepas (saudara tunggal) — tak ada yang lain.
  assert.deepEqual(berubah, [3, 4]);
  assert.equal(b[0], a[0]);
  assert.equal(b.at(-1), a.at(-1), 'catatan penutup ikut termakan');
});

test('opsi TUNGGAL saling meniadakan — dalam blok yang sama saja', () => {
  const p = bacaPilihan(centang(KARTU, 0, true));
  assert.deepEqual(p.map((x) => x.dipilih), [true, false, true, false]);
  // SSO di blok lain TIDAK ikut terlepas.
  assert.equal(p[2].dipilih, true, 'blok lain ikut terlepas — jawaban lain hilang');
});

test('opsi GANDA tidak saling meniadakan', () => {
  const p = bacaPilihan(centang(KARTU, 3, true));
  assert.deepEqual(p.map((x) => x.dipilih), [false, true, true, true]);
});

test('melepas centang tidak menyalakan saudaranya', () => {
  /* "Batal memilih" adalah keadaan yang sah — orang berhak mencabut
     keputusan tanpa dipaksa memilih yang lain. */
  const p = bacaPilihan(centang(KARTU, 1, false));
  assert.deepEqual(p.map((x) => x.dipilih), [false, false, true, false]);
});

test('indeks yang tak ada MELEMPAR, bukan diam', () => {
  /* Indeks meleset berarti UI dan basis data melihat kartu yang berbeda —
     kartunya sudah berubah sejak halaman dimuat. Mencentang "opsi ke-3" pada
     teks yang sudah bergeser akan memutuskan hal yang sama sekali lain. */
  assert.throws(() => centang(KARTU, 9, true), RangeError);
  assert.throws(() => centang('tanpa opsi apa pun', 0, true), RangeError);
});

test('bentuk tulisannya lestari — X besar, spasi ganjil, indentasi', () => {
  /* Kartu ditulis manusia dan agen; ragam penulisan yang wajar tak boleh
     membuat centangnya tak terbaca. */
  const aneh = 'PILIHAN:\n  -   [X]   Sudah dipilih\n- (  ) bukan opsi';
  const p = bacaPilihan(aneh);
  assert.equal(p.length, 1, 'bentuk longgar tak terbaca / kurung ganda terbaca');
  assert.equal(p[0].dipilih, true, 'X besar tak dikenali');
  assert.equal(p[0].teks, 'Sudah dipilih');
  assert.ok(centang(aneh, 0, false).includes('-   [ ]   Sudah dipilih')
    || centang(aneh, 0, false).includes('- [ ] Sudah dipilih'));
});

/* ── ringkasan ───────────────────────────────────────────────────────── */

test('ringkasan menghitung per BLOK, bukan per opsi', () => {
  /* Per opsi, kartu dengan enam pilihan SSO akan tampak "1/6 terjawab"
     padahal satu centang sudah cukup — dan papan yang salah menghitung
     membuat kartu yang sudah diputuskan tetap terlihat menggantung. */
  assert.deepEqual(ringkasPilihan(KARTU), { total: 2, terjawab: 2, menunggu: false });
  const kosong = KARTU.replace('- (x)', '- ( )').replace('- [x]', '- [ ]');
  assert.deepEqual(ringkasPilihan(kosong), { total: 2, terjawab: 0, menunggu: true });
  assert.deepEqual(ringkasPilihan('tanpa opsi'), { total: 0, terjawab: 0, menunggu: false });
});

/* ── jalur tulisnya ──────────────────────────────────────────────────── */

test('penulisan dibungkus TRANSAKSI baca-lalu-tulis', () => {
  /* `why` dibaca dulu, diubah, lalu ditulis balik. Dua centang berbarengan
     tanpa transaksi membuat yang kedua menimpa teks versi lama dan membuang
     centang pertama tanpa jejak apa pun. */
  const svc = readFileSync('src/modules/core/backlog.service.ts', 'utf8');
  const blok = svc.slice(svc.indexOf('async setPilihan'), svc.indexOf('async create('));
  assert.ok(/db\.transaction\(/.test(blok), 'baca-lalu-tulis tanpa transaksi');
  assert.ok(/audit\(/.test(blok), 'keputusan produk tak meninggalkan jejak audit');
  assert.ok(!/status:/.test(blok),
    'mencentang ikut memindahkan kartu — "sudah kuputuskan" bukan "kerjakan sekarang"');
});

test('rute pilihan TERPISAH dari rute antrean & prioritas', () => {
  /* Kalau menumpang PATCH (antrean) atau PUT (prioritas), satu seretan kartu
     yang salah bisa diam-diam menulis ulang jawaban yang dipikirkan lama. */
  const route = readFileSync('src/app/api/admin/backlog/pilihan/route.ts', 'utf8');
  assert.ok(/superadminRoute/.test(route), 'papan platform tanpa penjaga superadmin');
  assert.ok(/status: 409/.test(route), 'indeks bergeser tak dijawab 409 — orang mengira salah klik');
  const utama = readFileSync('src/app/api/admin/backlog/route.ts', 'utf8');
  assert.ok(!/pilihan|indeks/.test(utama), 'jalur pilihan bocor ke rute antrean/prioritas');
});
