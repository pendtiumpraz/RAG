import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { UMUR_BASI_HARI, umurHari } from '../src/app/(app)/dataroom/BuktiFitur';

/**
 * BUKTI YANG TAK BOLEH BASI DIAM-DIAM (kartu a-tur-terjadwal).
 *
 * `bukti.generated.ts` adalah potret satu saat, dan ia tetap tampil
 * meyakinkan berbulan-bulan setelah fitur yang dipotretnya berubah atau rusak.
 * Tak ada satu pun tanda di layar yang membedakan bukti kemarin dari bukti
 * bulan lalu.
 *
 * Itu bukan kekhawatiran teoretis: halaman Assessment di repo yang sama sempat
 * menyebut sepuluh celah yang sudah lama tertutup, dan tak ada yang tahu
 * sampai seseorang memeriksanya baris demi baris pada 3 Agu 2026.
 *
 * TIDAK ADA TES YANG MENGGAGALKAN BUILD KARENA KALENDER. Uji yang pecah pukul
 * dua pagi tanpa ada yang menyentuh apa pun akan memblokir pekerjaan yang tak
 * berhubungan, dan yang pertama diperbaiki orang adalah ujinya. Yang dijaga di
 * sini adalah MEKANISMENYA: umurnya terlihat di layar, dan turnya berjalan
 * sendiri.
 */

const UI = readFileSync('src/app/(app)/dataroom/BuktiFitur.tsx', 'utf8');
const ALUR = readFileSync('.github/workflows/tur.yml', 'utf8');
const LIB = readFileSync('scripts/tur-lib.mts', 'utf8');

/* ── hitungan umur ────────────────────────────────────────────────────── */

test('umur dihitung dalam hari penuh, dan tanggal rusak tak jadi angka', () => {
  const kini = new Date('2026-08-03T12:00:00Z');
  assert.equal(umurHari('2026-08-03T01:00:00Z', kini), 0);
  assert.equal(umurHari('2026-07-20T12:00:00Z', kini), 14);
  assert.equal(umurHari('bukan-tanggal', kini), null,
    'tanggal rusak jadi angka — pita umur akan menampilkan NaN hari');
});

test('ambang basi dua minggu — bukan lebih pendek, bukan lebih panjang', () => {
  /* Lebih pendek berbunyi terus-menerus pada minggu yang tak ada perubahan
     apa pun, dan peringatan yang selalu menyala berhenti dibaca. Lebih panjang
     berarti satu rilis penuh bisa lewat sebelum ada yang curiga. */
  assert.equal(UMUR_BASI_HARI, 14);
});

/* ── terlihat di layar ────────────────────────────────────────────────── */

test('pita umur SELALU tampil, bukan hanya saat basi', () => {
  /* Pita yang cuma muncul saat ada masalah mengajari pembacanya bahwa
     ketiadaan pita berarti "belum diperiksa", bukan "masih segar". */
  assert.ok(/<UmurBukti pada=\{BUKTI\.pada\} \/>/.test(UI), 'pita umur tak dirender');
  const blok = UI.slice(UI.indexOf('function UmurBukti('));
  assert.ok(/Bukti berumur \$\{umur\} hari/.test(blok), 'umurnya tak disebut dalam angka');
  assert.ok(!/if \(!basi\) return null/.test(blok), 'pita disembunyikan saat bukti masih segar');
});

test('umur dihitung SETELAH render pertama, bukan saat render', () => {
  /* Halaman ini dirender di server juga, dan "berapa hari lalu" yang dihitung
     di sana terkunci pada waktu build — persis jenis kebasian yang hendak
     dicegah komponen ini, dilakukan oleh komponen ini sendiri. */
  const blok = UI.slice(UI.indexOf('function UmurBukti('));
  assert.ok(/useEffect\(\(\) => \{ setUmur\(umurHari\(pada\)\); \}, \[pada\]\)/.test(blok),
    'umur dihitung saat render — akan membeku pada waktu build');
});

test('keadaan basi memberi tahu APA yang harus dilakukan', () => {
  const blok = UI.slice(UI.indexOf('function UmurBukti('));
  assert.ok(/npm run tur/.test(blok), 'pita basi tak menyebut cara memperbaruinya');
  assert.ok(/tidak terwakili di sini/.test(blok),
    'pita basi tak menyebut AKIBATNYA — hanya bahwa ia tua');
});

/* ── berjalan sendiri ─────────────────────────────────────────────────── */

test('alur terjadwal ada, dan benar-benar terjadwal', () => {
  assert.ok(/^on:/m.test(ALUR));
  assert.ok(/schedule:/.test(ALUR), 'alur tur tak punya jadwal — ia hanya bisa dijalankan manual');
  assert.ok(/cron: '0 21 \* \* \*'/.test(ALUR));
  assert.ok(/workflow_dispatch/.test(ALUR), 'tak bisa dipicu tangan saat dibutuhkan');
});

test('BERHENTI KERAS saat rahasianya belum dipasang', () => {
  /* Ini yang membedakan pekerjaan terjadwal yang berguna dari yang
     menenangkan: alur yang MELEWATI langkahnya saat rahasia kosong akan hijau
     tiap malam tanpa memotret apa pun — dan papan Actions yang seluruhnya
     hijau adalah alasan terkuat untuk berhenti memeriksanya. */
  assert.ok(/::error::Rahasia belum dipasang/.test(ALUR), 'rahasia yang hilang tak diteriakkan');
  assert.ok(/exit 1/.test(ALUR), 'alur tetap hijau walau tak memotret apa pun');
  assert.ok(!/continue-on-error: true/.test(ALUR), 'kegagalan tur ditelan');
  assert.ok(!/if: \$\{\{ secrets\./.test(ALUR),
    'langkahnya dilewati diam-diam saat rahasia kosong');
});

test('nama variabel basis SAMA antara alur dan skripnya', () => {
  /* Bentuk kegagalan yang nyaris terjadi saat menulis kartu ini: alur menyetel
     TUR_BASIS sementara skripnya membaca BASIS. Turnya tetap jalan — ke alamat
     BAWAAN — jadi ia akan memotret lingkungan yang salah tanpa satu pun galat,
     dan buktinya terlihat sah. */
  const dipakaiAlur = [...ALUR.matchAll(/^\s+([A-Z_]+): \$\{\{ secrets\./gm)].map((m) => m[1]);
  assert.ok(dipakaiAlur.includes('TUR_BASIS'), 'alur tak menyetel alamat yang ditur');
  assert.ok(/process\.env\.TUR_BASIS/.test(LIB),
    'skrip tur tak membaca TUR_BASIS — alur menyetel variabel yang tak dibaca siapa pun');
  for (const v of ['NALAR_EMAIL', 'NALAR_SANDI']) {
    assert.ok(dipakaiAlur.includes(v), `alur tak meneruskan ${v}`);
    assert.ok(readFileSync('scripts/tur-fitur.mts', 'utf8').includes(`process.env.${v}`),
      `${v} tak dibaca skrip tur`);
  }
});

test('hasil yang MERAH ikut di-commit, tidak dibuang', () => {
  /* Tur yang menemukan fitur rusak menghasilkan bukti berstatus GAGAL, dan itu
     justru isi paling berharga di halaman itu. Membuang hasilnya karena
     "merah" akan mengubah dataroom jadi brosur. */
  assert.ok(/bukti\.generated\.ts/.test(ALUR), 'hasil tur tak di-commit sama sekali');
  assert.ok(/public\/bukti/.test(ALUR), 'tangkapan layarnya tak ikut di-commit');
  assert.ok(!/if: success\(\)/.test(ALUR), 'commit hasil hanya saat turnya mulus');
});
