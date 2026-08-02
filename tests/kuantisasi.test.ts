import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { irisBlok } from './_iris';
import {
  FAKTOR_SARING, SARING_MAKS, layakBiner, porsiSaring,
} from '../src/modules/chat/kuantisasi';

/**
 * KUANTISASI BINER — lapisan PENYARING, tak pernah penentu.
 *
 * Presisi 1 bit membuang seluruh besaran dan menyisakan tanda tiap dimensi.
 * Potongan yang meleset karenanya berubah jadi karangan begitu chatbot tak
 * berada di mode kepatuhan ketat — jadi jarak Hamming hanya boleh
 * mempersempit kandidat, dan jarak eksak yang menentukan urutan akhir.
 *
 * DIUKUR PADA VEKTOR NYATA (`npm run bench:biner`, 2 Agu 2026, korpus
 * produksi 256 potongan × 384 dimensi): jarak top-6 jalur dua tahap IDENTIK
 * dengan pemindaian penuh pada 100% kueri.
 *
 * Angka itu baru benar setelah pengukurnya diperbaiki DUA KALI, dan keduanya
 * layak dicatat karena keduanya bentuk kesalahan yang mudah terulang:
 *   1. Patokannya memakai indeks HNSW — yang APROKSIMASI. Membandingkan hasil
 *      eksak dengan tebakan lalu menyebut yang eksak salah.
 *   2. Perbandingannya memakai ID. Korpus itu penuh embedding kembar (enam
 *      dokumen teratas sama-sama berjarak 0,0000), jadi yang terukur adalah
 *      urutan seri yang sewenang-wenang, bukan recall. Laporannya sempat
 *      berbunyi "meleset 12%" untuk sesuatu yang tak melesetkan apa pun.
 */

/* ── ukuran cadangan ──────────────────────────────────────────────────── */

test('kandidat yang disaring SELALU lebih banyak dari yang dipakai', () => {
  /* Menyaring lebih sedikit daripada yang dipakai berarti tahap eksak tak
     punya cukup bahan untuk diurutkan — hasilnya lebih buruk daripada tak
     menyaring sama sekali. */
  for (const pool of [1, 6, 60, 200]) {
    assert.ok(porsiSaring(pool) >= pool, `pool ${pool} menyaring lebih sedikit dari yang dipakai`);
  }
});

test('cadangannya lapang, bukan pas-pasan', () => {
  /* Kuantisasi membuang besaran: dua vektor yang arahnya mirip tapi
     panjangnya jauh berbeda bisa berjarak Hamming sama persis. Cadangan
     tipis berarti dokumen yang benar tersingkir di tahap biner dan jarak
     eksak tak pernah sempat melihatnya — kegagalan senyap, karena hasilnya
     tetap tampak masuk akal. */
  assert.ok(FAKTOR_SARING >= 4, 'faktor cadangan terlalu tipis untuk presisi 1 bit');
  assert.equal(porsiSaring(60), 480);
});

test('ada batas atas — korpus raksasa tak menarik seluruh isinya', () => {
  assert.equal(porsiSaring(1_000_000), SARING_MAKS);
});

test('masukan tak masuk akal menghasilkan NOL, bukan angka aneh', () => {
  for (const buruk of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(porsiSaring(buruk), 0, `porsiSaring(${buruk}) tak nol`);
  }
});

/* ── kapan ia dipakai ─────────────────────────────────────────────────── */

test('MATI kecuali saklar superadmin DAN korpusnya memang besar', () => {
  /* Pada korpus kecil kuantisasi merugikan: satu lompatan indeks dan satu
     pengurutan tambahan, untuk menghindari pemindaian yang sejak awal murah.
     Dua syarat, dan keduanya perlu. */
  assert.equal(layakBiner(false, false), false);
  assert.equal(layakBiner(false, true), false, 'menyala tanpa saklar superadmin');
  assert.equal(layakBiner(true, false), false, 'menyala di korpus kecil');
  assert.equal(layakBiner(true, true), true);
});

/* ── penegakan di jalur retrieval ─────────────────────────────────────── */

const SVC = readFileSync('src/modules/chat/retrieval.service.ts', 'utf8');

test('jarak EKSAK yang menentukan urutan akhir, bukan Hamming', () => {
  /* Inti seluruh kartu ini. Kalau suatu hari ada yang tergoda memakai
     peringkat biner apa adanya karena "toh hampir sama", yang hilang bukan
     sedikit ketepatan melainkan jaminan bahwa jawaban bersandar pada dokumen
     yang benar-benar paling dekat. */
  assert.ok(/saring as \(/.test(SVC), 'tahap penyaring hilang');
  const iSaring = SVC.indexOf('order by ${binerDist}');
  const iEksak = SVC.indexOf('row_number() over (order by ${distSaring})');
  assert.ok(iSaring > 0 && iEksak > 0 && iSaring < iEksak,
    'urutan akhir tidak ditentukan jarak eksak sesudah penyaring');
});

test('ef_search ikut naik bersama batas penyaring', () => {
  /* HNSW tak pernah mengembalikan lebih dari ef_search kandidat, BERAPA PUN
     limit yang ditulis. Tanpa ini, `limit 480` diam-diam jadi 40 — dan justru
     di korpus besar, satu-satunya tempat lapisan ini dimaksudkan bekerja,
     kehilangan itu paling parah. */
  assert.ok(/set local hnsw\.ef_search/.test(SVC), 'ef_search tak dinaikkan');
  assert.ok(/Math\.max\(40, porsiSaring\(pool\)\)/.test(SVC),
    'ef_search tak dikaitkan dengan batas penyaringnya');
});

test('saklar mati = SQL persis seperti sebelum kartu ini', () => {
  /* Jalur yang sudah terbukti tak boleh ikut membayar percobaan yang belum.
     Bentuk lamanya harus tetap ada utuh sebagai cabang else. */
  assert.ok(/\$\{biner \? sql`/.test(SVC), 'dua tahap tidak berada di balik saklar');
  assert.ok(/: sql`\s*\n\s*vec as \(/.test(SVC), 'cabang satu tahap hilang');
});

test('gagal membaca saklar jatuh ke MATI, bukan ke jalur baru', () => {
  /* Jalur yang kebetulan sedang diuji bukan tempat mendarat yang aman saat
     ada yang tak beres. */
  const blok = irisBlok(SVC, 'async function saklarBiner()');
  assert.ok(/catch \{/.test(blok) && /return false;/.test(blok.slice(blok.indexOf('catch'))),
    'kegagalan membaca saklar tidak jatuh ke mati');
});

test('kolom saklarnya MATI secara bawaan', () => {
  const schema = readFileSync('src/modules/core/db/schema.ts', 'utf8');
  const blok = irisBlok(schema, "binaryQuantize: boolean('binary_quantize')");
  assert.ok(/\.default\(false\)/.test(blok), 'kuantisasi biner menyala tanpa diminta');
});

test('indeks binernya berpasangan dengan indeks halfvec', () => {
  /* Menambah dimensi baru menuntut DUA blok — halfvec dan biner. Yang
     tertinggal tak menghasilkan galat; ia cuma membuat kueri jatuh ke
     pemindaian penuh, diam-diam, pada dimensi yang justru baru ditambahkan. */
  const mig = readFileSync('migrations/0047_kuantisasi_biner.sql', 'utf8');
  for (const d of [384, 768, 1024, 1536]) {
    assert.ok(new RegExp(String(d)).test(mig), `dimensi ${d} tak punya indeks biner`);
  }
  assert.ok(/bit_hamming_ops/.test(mig), 'indeksnya bukan indeks Hamming');
  assert.ok(/IF NOT EXISTS/.test(mig), 'migrasi tak idempoten');
});

/* ── saklarnya benar-benar ada di layar ───────────────────────────────── */

test('saklar kuantisasi punya panel superadmin, bukan cuma kolom', () => {
  /* Kolom basis data tanpa layar yang mengubahnya adalah fitur yang hanya
     bisa dinyalakan lewat psql — dan panduan on-premise yang menjanjikan
     "Settings → kuantisasi biner" akan berbohong kepada yang memasangnya.
     Ini bukan hipotetis: dokumennya sempat ditulis lebih dulu daripada
     panelnya. */
  const page = readFileSync('src/app/(app)/settings/page.tsx', 'utf8');
  assert.ok(/function PanelRetrieval\(\)/.test(page), 'panel retrieval tak ada');
  assert.ok(/'\/api\/admin\/retrieval'/.test(page), 'panel tak tersambung ke rutenya');
  assert.ok(/role === 'superadmin' && <PanelRetrieval \/>/.test(page),
    'panel tak dibatasi superadmin — ini keputusan pemasangan, bukan per-tenant');
});

test('rutenya UPSERT, bukan update — baris platform bisa belum ada', () => {
  /* Update yang tak mengenai baris mana pun BERHASIL DENGAN DIAM. Saklarnya
     lalu tampak tersimpan sambil tak pernah tersimpan, dan tak ada satu pun
     galat yang menjelaskannya. */
  const route = readFileSync('src/app/api/admin/retrieval/route.ts', 'utf8');
  assert.ok(/onConflictDoUpdate/.test(route), 'bukan upsert');
  assert.ok(/superadminRoute/.test(route), 'rute tak dijaga peran superadmin');
});
