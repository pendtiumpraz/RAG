import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { AMBANG_LAMBAT_MS, BATAS_SAMBUNG_BAWAAN, batasSambung } from '../src/modules/core/db/koneksi';

/**
 * BATAS WAKTU MENYAMBUNG KE BASIS DATA.
 *
 * Yang dijaga di sini satu hal, dan ia berlawanan dengan naluri: batas TIDAK
 * boleh terlalu pendek. Terukur di produksi, panggilan pertama dari lambda
 * dingin memakan 57 detik lalu BERHASIL. Batas 5 detik akan mengubahnya jadi
 * galat — pengguna menunggu 5 detik lalu melihat halaman rusak, alih-alih
 * menunggu lama lalu melihat halamannya terbuka. Yang satu menjengkelkan,
 * yang lain rusak.
 */

test('bawaan di bawah bawaan postgres.js (30), tapi jauh di atas sambung sehat', () => {
  assert.ok(BATAS_SAMBUNG_BAWAAN < 30, 'tak menurunkan atap apa pun dari bawaan pustaka');
  assert.ok(BATAS_SAMBUNG_BAWAAN >= 10,
    'terlalu agresif — "lambat tapi berhasil" akan berubah jadi "gagal"');
});

test('NOL dan negatif dijepit, bukan diteruskan', () => {
  /* Nol berarti "tanpa batas" di postgres.js — kebalikan persis dari maksud
     siapa pun yang mengetik DB_CONNECT_TIMEOUT=0, dan justru mengembalikan
     gantungan tak berujung yang hendak dicegah. */
  assert.equal(batasSambung({ DB_CONNECT_TIMEOUT: '0' }), BATAS_SAMBUNG_BAWAAN);
  assert.equal(batasSambung({ DB_CONNECT_TIMEOUT: '-5' }), BATAS_SAMBUNG_BAWAAN);
  assert.equal(batasSambung({ DB_CONNECT_TIMEOUT: 'entah' }), BATAS_SAMBUNG_BAWAAN);
  assert.equal(batasSambung({}), BATAS_SAMBUNG_BAWAAN);
});

test('nilai wajar dihormati, yang kelewatan diberi atap', () => {
  assert.equal(batasSambung({ DB_CONNECT_TIMEOUT: '8' }), 8);
  assert.equal(batasSambung({ DB_CONNECT_TIMEOUT: '20.9' }), 20);
  assert.equal(batasSambung({ DB_CONNECT_TIMEOUT: '9999' }), 120,
    'batas raksasa sama saja dengan menggantung');
});

test('klien BENAR-BENAR memakainya, bukan cuma menghitungnya', () => {
  const src = readFileSync('src/modules/core/db/index.ts', 'utf8');
  assert.ok(/connect_timeout: batasSambungDetik/.test(src),
    'batas dihitung tapi tak diteruskan ke postgres.js');
});

test('penyambungan lambat MENINGGALKAN JEJAK', () => {
  /* Bagian paling berguna dari perubahan ini. Hari ini tak ada satu pun jejak
     yang menjelaskan 57 detik itu — yang ada cuma pengguna yang menunggu.
     Satu baris log mengubah keluhan "kadang lambat" jadi angka yang bisa
     ditindaklanjuti. */
  const src = readFileSync('src/modules/core/db/index.ts', 'utf8');
  assert.ok(/db\.sambung_lambat/.test(src), 'tak ada log untuk sambung yang lambat');
  assert.ok(/db\.sambung_gagal/.test(src), 'kegagalan menyambung tak dicatat');
  assert.ok(/durasiMs/.test(src), 'log tak menyertakan lamanya — keluhan tetap tanpa angka');
  assert.ok(AMBANG_LAMBAT_MS >= 1000 && AMBANG_LAMBAT_MS <= 10_000,
    'ambang terlalu sensitif/terlalu tumpul untuk berguna');

  const health = readFileSync('src/app/api/health/route.ts', 'utf8');
  assert.ok(/ukurSambungPertama\(\)/.test(health),
    'pengukur tak pernah dipanggil dari endpoint yang paling sering menemui lambda dingin');
});

test('pengukuran tidak menggagalkan permintaan', () => {
  /* Ia alat pengamat. Alat pengamat yang bisa menjatuhkan yang diamatinya
     adalah kerusakan baru, bukan perbaikan. */
  const src = readFileSync('src/modules/core/db/index.ts', 'utf8');
  const blok = src.slice(src.indexOf('export async function ukurSambungPertama'));
  assert.ok(/catch \(e\)/.test(blok), 'galat pengukuran bisa naik ke pemanggil');
  const health = readFileSync('src/app/api/health/route.ts', 'utf8');
  assert.ok(/void ukurSambungPertama\(\)/.test(health),
    'pengukuran ditunggu — ia menambah waktu pada permintaan yang justru sedang lambat');
});
