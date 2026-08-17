import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env.DATABASE_URL ??= 'postgres://x:y@localhost:5432/z';
process.env.CREDENTIALS_ENCRYPTION_KEY ??= '0'.repeat(64);

/**
 * SUMBER `upload` — jalur yang TIDAK BOLEH jatuh ke galat "belum didukung".
 *
 * Bug live (laporan Bos Galih): setelah unggah manual, menekan SYNC pada
 * sumber itu melempar `Jenis sumber belum didukung sync: upload` — connect()
 * punya cabang untuk gdrive/gdrive_public/onedrive/sharepoint/url/s3/notion/
 * slack tapi TAK ADA untuk kind 'upload', hingga lewat ke throw penutup.
 *
 * connect() bukan fungsi ekspor dan menyentuh DB (withTenant), jadi unit test
 * tidak bisa mengeksekusinya langsung tanpa akun nyata — sama seperti pola
 * tes sync-progress.test.ts, kita mengunci bentuk SUMBERnya: cabang upload
 * harus ADA dan KEMBALIKAN bentuk Connector { files, fetch }, dan throw
 * penutup hanya jadi jaring pengaman untuk jenis yang benar-benar tak dikenal.
 */

const SYNC = readFileSync('src/modules/knowledge/sync.service.ts', 'utf8');
const ADAPTER = readFileSync('src/modules/storage/adapter.ts', 'utf8');

function cabangConnect(): string {
  const mulai = SYNC.indexOf('async function connect(');
  assert.ok(mulai >= 0, 'connect() tak ditemukan');
  const akhir = SYNC.indexOf('Jenis sumber belum didukung sync:', mulai);
  assert.ok(akhir >= 0, 'throw penutup connect() tak ditemukan');
  return SYNC.slice(mulai, akhir);
}

test('kind upload punya cabang sebelum throw penutup', () => {
  const cabang = cabangConnect();
  assert.ok(/if \(kind === 'upload'\)/.test(cabang),
    'connect() tak punya cabang `kind === (id)upload` — SYNC jatuh ke throw "belum didukung"');
  /* Cabang harus mengembalikan Connector (files + fetch), bukan sekadar
     membuat baris: fungsi kosong yang tak `return` tetap lolos typecheck
     TS2454 hanya jika tak mengisyaratkan, dan di sini justru return-lah yang
     menyelamatkan kind upload dari throw penutup. */
  const cabangUpload = cabang.slice(cabang.indexOf("kind === 'upload'"));
  assert.ok(/return \{/.test(cabangUpload), 'cabang upload tak mengembalikan bentuk Connector');
});

test('cabang upload menghasilkan files (konektor) dan fetch', () => {
  const cabang = cabangConnect();
  const cabangUpload = cabang.slice(cabang.indexOf("kind === 'upload'"));
  assert.ok(/files:\s*tersimpan\.map/.test(cabangUpload),
    'listing upload tak memetakan baris uploaded_files ke RemoteFile');
  assert.ok(/fetch\(f\)|fetch\(/.test(cabangUpload),
    'fetch cabang upload tak ada — re-sync tak akan membaca byte tersimpan');
  assert.ok(/ambilBerkasUpload/.test(cabangUpload),
    'fetch upload tak memakai pembaca bytes tersimpan (storageService.ambilBerkasUpload)');
});

test('sumber upload KOSONG tetap valid — bukan galat "belum didukung"', () => {
  const cabang = cabangConnect();
  const cabangUpload = cabang.slice(cabang.indexOf("kind === 'upload'"));
  /* Sumber yang tak punya berkas tersimpan harus menghasilkan konektor kosong
     (files: []) agar sync berjalan mulus tanpa penghapusan — bukan jatuh ke
     throw penutup maupun ke galat lain. */
  assert.ok(/tersimpan\.length === 0/.test(cabangUpload),
    'sumber upload kosong tak ditangani khusus — berisiko galat/penghapusan');
});

test('kontrak baca (ambil) ada di adapter agar re-sync bisa membaca bytes', () => {
  /* Re-sync membaca KEMBALI byte orisinal dari blob/BYOB; ini butuh kaki BACA
     per penyedia. Kontrak antar-adapter harus mengiklankan `ambil`. */
  assert.ok(/\bambil\?\(kred:\s*KredensialStorage,\s*key:\s*string\)/.test(ADAPTER),
    'StorageAdapter tak mengiklankan ambil() — re-sync tak punya kontrak baca');
});

test('Drive/SharePoint/Google cabang TIDAK tersentuh oleh penambahan upload', () => {
  /* Jenis sumber lain tetap memakai OAuth/konektor masing-masing: cabang
     upload berdiri SENDIRI di antara slack dan throw penutup, dan tak boleh
     memindahkan atau mengubah alur gdrive/gdrive_public/onedrive/sharepoint. */
  const cabang = cabangConnect();
  for (const kind of ['gdrive', 'gdrive_public']) {
    assert.ok(cabang.indexOf(`if (kind === '${kind}')`) >= 0,
      `cabang ${kind} hilang dari connect()`);
  }
  /* onedrive & sharepoint berbagi SATU cabang (microsoft Graph). */
  assert.ok(cabang.includes("kind === 'onedrive' || kind === 'sharepoint'"),
    'cabang microsoft (onedrive/sharepoint) hilang dari connect()');
  for (const kind of ['s3', 'url', 'notion', 'slack']) {
    assert.ok(cabang.indexOf(`if (kind === '${kind}')`) >= 0,
      `cabang ${kind} hilang dari connect()`);
  }
});
