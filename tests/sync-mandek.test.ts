import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  AMBANG_MANDEK_DETIK, BATAS_FUNGSI_DETIK, KELONGGARAN_DETIK, PESAN_MANDEK, mandek,
} from '../src/modules/knowledge/sync-mandek';

/**
 * SINKRONISASI MANDEK.
 *
 * Kejadian nyata di produksi (1 Agu 2026): sumber Drive 150 berkas, fungsi
 * dibatasi 60 detik, lambda dibunuh setelah 17 berkas masuk — dan tak ada yang
 * mengembalikan status barisnya. Ia tinggal 'syncing' SELAMANYA: tombol Sync
 * mati, halaman terus menyegarkan diri menunggu kabar yang tak akan datang,
 * dan pemiliknya menunggu 18 menit sebelum menyadari ada yang salah.
 *
 * Bentuk kegagalan itu yang dijaga di sini — bukan "sync berhasil", melainkan
 * "sync gagal SAMBIL TERLIHAT BERJALAN".
 */

test('yang masih baru TIDAK dianggap mandek', () => {
  /* Salah menilai ke arah "terlalu cepat" jauh lebih mahal: ia menghentikan
     pekerjaan yang masih hidup, lalu orang mengulanginya dari awal karena
     mengira ia memang gagal. */
  const now = new Date('2026-08-01T08:00:00Z');
  const baru = new Date(now.getTime() - 10_000);
  assert.equal(mandek('syncing', baru, now), false);
  const tepatDiBatas = new Date(now.getTime() - AMBANG_MANDEK_DETIK * 1000);
  assert.equal(mandek('syncing', tepatDiBatas, now), false, 'tepat di ambang sudah dianggap mati');
});

test('yang melewati ambang dianggap mandek', () => {
  const now = new Date('2026-08-01T08:00:00Z');
  const lama = new Date(now.getTime() - (AMBANG_MANDEK_DETIK + 1) * 1000);
  assert.equal(mandek('syncing', lama, now), true);
});

test('status selain syncing tak pernah mandek', () => {
  const now = new Date('2026-08-01T08:00:00Z');
  const lama = new Date(now.getTime() - 86_400_000);
  for (const s of ['synced', 'error', 'pending', '']) {
    assert.equal(mandek(s, lama, now), false, `status ${s} ikut dilepas`);
  }
});

test('cap waktu yang HILANG atau rusak tidak dianggap mati', () => {
  /* Baris tanpa cap waktu berarti kita tak tahu apa-apa tentangnya, dan
     menebak "sudah mati" pada sesuatu yang tak diketahui adalah cara paling
     mudah menghentikan pekerjaan yang benar. */
  const now = new Date('2026-08-01T08:00:00Z');
  assert.equal(mandek('syncing', null, now), false);
  assert.equal(mandek('syncing', undefined, now), false);
  assert.equal(mandek('syncing', 'bukan tanggal', now), false);
});

test('ambang = batas fungsi + kelonggaran, dan kelonggarannya BESAR', () => {
  /* Kelonggaran kecil mengubah alat pembebas jadi alat pembunuh: ia akan
     melepas sinkronisasi yang sebenarnya masih berjalan. */
  assert.equal(AMBANG_MANDEK_DETIK, BATAS_FUNGSI_DETIK + KELONGGARAN_DETIK);
  assert.ok(KELONGGARAN_DETIK >= BATAS_FUNGSI_DETIK,
    'kelonggaran lebih kecil dari batas fungsi — pekerjaan hidup bisa ikut dilepas');
});

test('batas fungsi di sini SAMA dengan maxDuration rutenya', () => {
  /* Angka yang tercecer di dua tempat akan berbeda suatu hari, dan yang lebih
     kecil akan melepas sinkronisasi yang masih berjalan. */
  const route = readFileSync('src/app/api/sources/[id]/sync/route.ts', 'utf8');
  const m = /export const maxDuration = (\d+);/.exec(route);
  assert.ok(m, 'maxDuration tak ditemukan di rute sync');
  assert.equal(Number(m![1]), BATAS_FUNGSI_DETIK,
    `maxDuration rute = ${m![1]}, konstanta di sini = ${BATAS_FUNGSI_DETIK}`);
});

test('pesannya menyebut bahwa berkas yang sudah masuk TIDAK hilang', () => {
  /* Tanpa itu, orang menyimpulkan sinkronisasinya harus diulang dari nol —
     dan mengulang 150 berkas dari awal berarti membakar embedding untuk 17
     berkas yang sudah ada. */
  assert.match(PESAN_MANDEK, /tidak hilang/i);
  assert.match(PESAN_MANDEK, /delta/i);
  assert.ok(PESAN_MANDEK.length > 80, 'terlalu singkat untuk menjelaskan apa pun');
});

test('pelepasan dilakukan di jalur yang MEMANG sering dipanggil', () => {
  /* Halaman Knowledge menyegarkan daftar sumber tiap 2,5 detik selama ada yang
     berjalan. Menaruh pelepasan di sana berarti yang paling butuh dibebaskan
     adalah yang paling sering memanggilnya — tanpa penjadwal, tanpa cron, dan
     tanpa satu pun bagian baru yang bisa mati diam-diam. */
  const route = readFileSync('src/app/api/sources/route.ts', 'utf8');
  assert.ok(/AMBANG_MANDEK_DETIK/.test(route), 'daftar sumber tak melepas yang mandek');
  const iUpdate = route.indexOf('tx.update(dataSources)');
  const iSelect = route.indexOf('tx.select().from(dataSources)');
  assert.ok(iUpdate > 0 && iUpdate < iSelect,
    'pelepasan berjalan SESUDAH baris dibaca — jawabannya masih memuat status lama');
  assert.ok(/eq\(dataSources\.status, 'syncing'\)/.test(route),
    'pelepasan tak dibatasi ke baris yang syncing — status lain ikut ditimpa');
});
