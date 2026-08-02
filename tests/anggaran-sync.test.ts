import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { ANGGARAN_MS, PORSI_INGEST, TENGGAT_DETIK, masihMuat } from '../src/modules/knowledge/anggaran-sync';

/**
 * ANGGARAN WAKTU SATU PUTARAN SYNC.
 *
 * Kejadian nyata 1 Agu 2026: 150 berkas / ±21 GB, batas berkas per jalan juga
 * 150 — batas itu TAK PERNAH tersentuh; yang tersentuh tenggat 60 detik, dan
 * lambda mati di berkas ke-17. Statusnya lalu menggantung di 'syncing'
 * selamanya karena tak ada yang sempat menutupnya.
 *
 * Yang dijaga di sini: putaran berhenti SENDIRI di antara berkas, bukan
 * dibunuh di tengahnya. Bedanya bukan kerapian — berhenti sendiri berarti
 * sisa yang dilaporkan ADALAH angka yang benar dan statusnya tertutup rapi.
 */

const dasar = { mulaiMs: 0, sudahDiproses: 4 };

test('berkas PERTAMA selalu dicoba, walau anggaran sudah lewat', () => {
  /* Putaran yang tak memproses satu berkas pun tak pernah maju — dan sync
     yang tak pernah maju lebih buruk daripada sync yang sesekali dibunuh: ia
     berputar selamanya tanpa hasil, dan tombol "Lanjutkan" jadi bohong. */
  assert.equal(masihMuat({ mulaiMs: 0, sekarangMs: 999_999, sudahDiproses: 0 }), true);
});

test('berhenti begitu anggaran terpakai habis', () => {
  assert.equal(masihMuat({ ...dasar, sekarangMs: ANGGARAN_MS }), false);
  assert.equal(masihMuat({ ...dasar, sekarangMs: ANGGARAN_MS + 1 }), false);
});

test('rata-rata BERGERAK: korpus berat berhenti lebih awal', () => {
  /* Ini inti rancangannya. Empat berkas dalam 40 detik berarti ±10 detik per
     berkas; memulai yang kelima akan melewati anggaran, jadi ia tidak
     dimulai. Empat berkas dalam 4 detik berarti ±1 detik; masih banyak ruang.
     Tak ada satu pun angka yang harus disetel manusia. */
  const berat = masihMuat({ mulaiMs: 0, sekarangMs: 40_000, sudahDiproses: 4 });
  const ringan = masihMuat({ mulaiMs: 0, sekarangMs: 4_000, sudahDiproses: 4 });
  assert.equal(berat, false, 'PDF berat tetap dimulai di ujung anggaran — putaran akan dibunuh');
  assert.equal(ringan, true, 'berkas ringan dihentikan terlalu dini — sync jadi lambat tanpa sebab');
});

test('anggaran menyisakan ruang untuk merapikan', () => {
  /* Sisanya untuk menulis ringkasan, membangun lapisan pertama, memancarkan
     peristiwa. Menghabiskan seluruh tenggat di lingkaran berarti dibunuh saat
     merapikan — dan yang hilang justru ringkasan yang memberi tahu orang
     berapa yang tersisa. */
  assert.ok(PORSI_INGEST < 1, 'seluruh tenggat dipakai lingkaran — tak ada ruang menutup');
  assert.ok(PORSI_INGEST >= 0.5, 'porsi terlalu kecil — sync maju sangat sedikit tiap putaran');
  assert.equal(ANGGARAN_MS, Math.round(TENGGAT_DETIK * PORSI_INGEST * 1000));
  assert.ok(ANGGARAN_MS < TENGGAT_DETIK * 1000);
});

test('tenggat di sini SAMA dengan maxDuration rutenya', () => {
  const route = readFileSync('src/app/api/sources/[id]/sync/route.ts', 'utf8');
  const m = /export const maxDuration = (\d+);/.exec(route);
  assert.ok(m, 'maxDuration tak ditemukan');
  assert.equal(Number(m![1]), TENGGAT_DETIK,
    'anggaran dihitung dari tenggat yang berbeda dengan tenggat sebenarnya');
});

/* ── pemasangannya di sync ───────────────────────────────────────────── */

const SVC = readFileSync('src/modules/knowledge/sync.service.ts', 'utf8');

test('diperiksa SEBELUM berkas berikutnya diambil', () => {
  /* Memeriksanya sesudah berarti berkas terakhir selalu dimulai di ujung
     anggaran — dan satu PDF besar di detik ke-44 tetap membuat putaran itu
     dibunuh, yaitu persis kegagalan yang hendak dicegah. */
  const blok = SVC.slice(SVC.indexOf('for (const f of batch) {'), SVC.indexOf('const { content, mime }'));
  const iCek = blok.indexOf('masihMuat(');
  const iTry = blok.indexOf('try {');
  assert.ok(iCek > 0 && iCek < iTry, 'anggaran diperiksa setelah pemrosesan dimulai');
});

test('anggaran dihitung dari AWAL PUTARAN, bukan awal lingkaran', () => {
  /* Pendaftaran berkas (listing) memakan tenggat yang sama. Mengabaikannya
     membuat anggaran berbohong pada sumber yang daftarnya panjang: ia
     mengira punya 45 detik padahal 20 detik sudah terpakai. */
  /* Diiris ke badan runSync DULU. `pratinjauSumber()` memakai `connect()`
     yang sama dan letaknya lebih dulu di berkas, jadi mencari penandanya di
     seluruh berkas menemukan pendaftaran MILIK PRATINJAU — yang memang tak
     punya anggaran waktu, karena ia tak mengunduh apa pun. Tesnya lalu
     menuduh runSync atas urutan yang benar. */
  const jalan = SVC.slice(SVC.indexOf('export async function runSync('));
  const iMulai = jalan.indexOf('const mulaiMs = Date.now();');
  const iListing = jalan.indexOf('const conn = await connect(');
  assert.ok(iMulai > 0 && iMulai < iListing, 'penanda waktu dipasang setelah listing');
});

test('sisa yang dilaporkan MENJUMLAHKAN kedua sebab berhenti', () => {
  /* Berhenti karena batas berkas dan berhenti karena waktu adalah dua hal
     berbeda, dan melaporkan salah satunya saja membuat orang mengira sync
     sudah tuntas padahal belum. */
  assert.ok(/pending: pending \+ berhentiWaktu/.test(SVC), 'sisa tak menjumlahkan keduanya');
  assert.ok(/berhentiKarenaWaktu/.test(SVC), 'sebab berhentinya tak dibedakan di laporan');
});

/* ── yang dilihat pengguna ───────────────────────────────────────────── */

const PAGE = readFileSync('src/app/(app)/knowledge/page.tsx', 'utf8');

test('tombol Lanjutkan menyebut SISANYA, bukan cuma "Lanjutkan"', () => {
  /* Sebelum ini tak ada apa pun di layar yang memberi tahu bahwa menekan Sync
     lagi MEMANG melanjutkan, bukan mengulang dari nol — dan orang
     menyimpulkan sync-nya rusak padahal ia cuma belum selesai. */
  assert.ok(/Lanjutkan — \{sisa\} berkas tersisa/.test(PAGE), 'sisa tak tertulis di tombol');
  assert.ok(/if \(!sisa\) return null;/.test(PAGE), 'tombol muncul walau tak ada sisa');
});

test('mode otomatis MENYEBUT batasnya, tidak menjanjikan latar belakang', () => {
  /* Lanjut otomatis di latar belakang menuntut cron atau antrean yang selamat
     dari matinya lambda. Menjanjikannya tanpa membangunnya berarti sync
     berhenti diam-diam begitu tab ditutup — dan pemiliknya baru tahu
     berhari-hari kemudian. */
  assert.ok(/HANYA SELAMA HALAMAN INI TERBUKA/.test(PAGE),
    'mode otomatis tak menyebut bahwa ia berhenti saat tab ditutup');
});

test('otomatis TIDAK memicu saat masih ada yang berjalan', () => {
  /* Daftar disegarkan tiap 2,5 detik. Tanpa syarat ini, tiap penyegaran
     memicu putaran baru di atas yang masih berjalan — dan dua sync serentak
     pada sumber yang sama membakar kuota dua kali untuk pekerjaan yang sama. */
  const blok = PAGE.slice(PAGE.indexOf('function LanjutkanSync'));
  assert.ok(/if \(!auto \|\| !sisa \|\| berjalan \|\| jalan\) return;/.test(blok),
    'pemicu otomatis tak memeriksa apakah sync masih berjalan');
});

test('mode bawaan adalah B — otomatis harus dinyalakan sendiri', () => {
  const blok = PAGE.slice(PAGE.indexOf('function LanjutkanSync'));
  assert.ok(/useState\(false\)/.test(blok), 'mode otomatis menyala secara bawaan');
  assert.ok(/localStorage\.getItem\(KUNCI_AUTO\) === '1'/.test(blok),
    'pilihan mode tak diingat antar kunjungan');
});
