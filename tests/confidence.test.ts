import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env.DATABASE_URL ??= 'postgres://x:y@localhost:5432/z';
process.env.CREDENTIALS_ENCRYPTION_KEY ??= '0'.repeat(64);

/**
 * KEYAKINAN JAWABAN.
 *
 * Kegagalan yang dijaga di sini bukan crash melainkan KEPERCAYAAN YANG SALAH
 * TEMPAT: angka yang terlihat presisi sambil menampilkan derau, dan chip
 * sitasi yang tampil di bawah kalimat "tidak ada di dokumen".
 */

const load = () => import('../src/modules/chat/confidence');
const CONF = readFileSync('src/modules/chat/confidence.ts', 'utf8');
const CS = readFileSync('src/modules/chat/chat.service.ts', 'utf8');
const UI = readFileSync('src/app/c/[publicKey]/page.tsx', 'utf8');

test('TIDAK ada angka keyakinan berbasis skor', async () => {
  /* Rancangan paling wajar untuk fitur ini — skor kemiripan teratas sebagai
     persen keyakinan — DIUKUR dan ditolak: pada korpus produksi skornya
     0,420–0,581 untuk pertanyaan berjawab melawan 0,382–0,546 untuk yang
     jawabannya tak ada. Bertindih penuh. Angka apa pun yang diturunkan
     darinya akan memberi "83% yakin" pada pertanyaan yang jawabannya sama
     sekali tak ada — persis kepercayaan salah tempat yang fitur ini ada
     untuk mencegahnya. */
  const m = await load();
  assert.ok(!('skorKeKeyakinan' in m) && !('confidenceFromScore' in m),
    'ada fungsi yang menurunkan keyakinan dari skor — itu sudah diukur TIDAK memisahkan');
  // Angka pengukurannya ikut ditulis supaya keputusannya bisa diperiksa ulang.
  assert.ok(/0,420–0,581/.test(CONF) && /0,382–0,546/.test(CONF),
    'hasil pengukuran yang menolak pendekatan skor tak tercatat di modulnya');
});

test('tiga KEADAAN, bukan skala', async () => {
  const { nilaiKeyakinan } = await load();
  // Skala menuntut kalibrasi yang datanya menunjukkan tidak ada; tiga
  // keadaan hanya menuntut hal yang benar-benar bisa dibedakan.
  assert.equal(nilaiKeyakinan('Direktur utamanya adalah M. Rizal [1].', 6).status, 'bersumber');
  assert.equal(nilaiKeyakinan('Hal itu tidak disebutkan dalam dokumen.', 6).status, 'tak-ditemukan');
  assert.equal(nilaiKeyakinan('Direktur utamanya adalah M. Rizal.', 0).status, 'tanpa-rujukan');
});

test('sitasi TIDAK mendukung sebuah penolakan', async () => {
  /* Kegagalan yang benar-benar terjadi dan terukur: setiap potongan yang
     terambil jadi sitasi, TERMASUK saat jawabannya menolak. Jadi kalimat
     "tidak ada di dokumen" dikirim beserta ENAM chip sitasi, dan di layar
     itu terbaca sebagai "jawaban ini bersumber dari enam dokumen". */
  const { nilaiKeyakinan } = await load();
  const tolak = nilaiKeyakinan('Informasi itu tidak tersedia di dalam dokumen yang diberikan.', 6);
  assert.equal(tolak.sitasiMendukung, false,
    'penolakan masih menampilkan sitasi seperti bukti');
  const jawab = nilaiKeyakinan('NPWP perusahaan adalah 91.616.020.3-061.000 [1].', 6);
  assert.equal(jawab.sitasiMendukung, true, 'jawaban bersumber kehilangan sitasinya');
});

test('pendeteksi penolakan tinggal di PRODUK, eval mengimpornya', () => {
  /* Arah ketergantungan menentukan: produk MEMILIKI perilakunya, eval
     MENGUKUR. Kalau salinannya hidup di modul eval, keduanya menyimpang
     diam-diam — dan eval yang mengukur pendeteksi yang BERBEDA dari yang
     dipakai produksi adalah eval yang paling berbahaya justru saat hijau. */
  const PC = readFileSync('src/modules/eval/policy-checks.ts', 'utf8');
  assert.ok(/from '@\/modules\/chat\/confidence'/.test(PC),
    'eval tak mengimpor pendeteksi dari produk — ada dua salinan yang bisa menyimpang');
  assert.ok(!/const INGKAR_ADA\s*=/.test(PC), 'modul eval masih memuat salinan pendeteksinya sendiri');
  assert.ok(/export function deteksiPenolakan/.test(CONF), 'produk tak memiliki pendeteksinya');
});

test('keadaan jawaban sampai ke UI, bukan berhenti di server', () => {
  assert.ok(/nilaiKeyakinan\(full, context\.length\)/.test(CS), 'keyakinan tak dihitung di chatTurn');
  assert.ok(/onKeyakinan\?\.\(keyakinan\)/.test(CS), 'keyakinan tak dikirim ke pemanggil');
  assert.ok(/keyakinan: keyakinan\.status/.test(CS), 'keadaan jawaban tak ikut dicatat di audit');
  const RUTE = readFileSync('src/app/api/chat/[chatbotId]/route.ts', 'utf8');
  assert.ok(/send\('keyakinan', k\)/.test(RUTE), 'keyakinan tak dikirim lewat SSE');
});

test('RIWAYAT ikut dikoreksi, bukan hanya jawaban yang sedang mengalir', () => {
  /* Tanpa ini, penolakan di riwayat tetap tampil beserta enam chip sitasi —
     persis kesalahan yang baru diperbaiki di jalur hidup, dibiarkan hidup
     di tempat yang justru paling sering dibaca ulang. Dihitung ULANG dari
     teksnya karena pendeteksinya murni: riwayat lama yang tersimpan sebelum
     fitur ini ada ikut terkoreksi tanpa migrasi apa pun. */
  assert.ok(/nilaiKeyakinan\(m\.text/.test(UI), 'riwayat tak dinilai ulang');
  assert.ok(/sitasiMendukung \? \{\} : \{ cites: undefined \}/.test(UI),
    'sitasi pada penolakan tetap tampil di riwayat');
});

test('penolakan diberi label yang menyebut KEADAANNYA', async () => {
  const { LABEL_STATUS } = await load();
  assert.equal(LABEL_STATUS['tak-ditemukan'], 'Tidak ditemukan di dokumen');
  // Label harus menyebut keadaan, bukan angka — angka itulah yang ditolak.
  for (const v of Object.values(LABEL_STATUS)) {
    assert.ok(!/%|\d/.test(v), `label "${v}" memuat angka — keyakinan di sini bukan skala`);
  }
  assert.ok(/Tidak ditemukan di dokumen/.test(UI), 'UI tak menampilkan keadaan penolakan');
});
