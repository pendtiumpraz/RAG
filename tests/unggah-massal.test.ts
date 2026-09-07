import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env.DATABASE_URL ??= 'postgres://x:y@localhost:5432/z';
process.env.CREDENTIALS_ENCRYPTION_KEY ??= '0'.repeat(64);

/**
 * UNGGAH MASSAL SATU FOLDER.
 *
 * Kebutuhan nyata (Bos Galih): satu folder berisi 69 dokumen dalam 5 subfolder,
 * total 2,62 MB. Ukurannya TIDAK pernah jadi penghalang — yang menghalangi
 * adalah batas 20 berkas per permintaan dan input berkas yang tak bisa memilih
 * folder. Keduanya batas TRANSPOR, bukan batas berapa banyak dokumen yang boleh
 * dimasukkan orang, jadi yang benar adalah memecah di klien.
 *
 * Yang paling mudah salah dan paling mahal akibatnya: IDENTITAS dokumen. Bila
 * `externalId` tetap sekadar nama berkas, dua berkas sejudul di subfolder
 * berbeda saling menimpa TANPA satu pun galat — unggahan satu folder utuh bisa
 * diam-diam menghapus pekerjaan orang. Karena itu jalur relatif ikut dikirim,
 * dan pembersihannya diuji sungguhan di bawah, bukan sekadar dilihat bentuknya.
 */

const load = () => import('../src/modules/knowledge/jalur-unggahan');
const RUTE = readFileSync('src/app/api/knowledge-bases/[id]/upload/route.ts', 'utf8');
const UI = readFileSync('src/app/(app)/knowledge/page.tsx', 'utf8');

test('jalur subfolder dipertahankan apa adanya', async () => {
  const { bersihkanJalur } = await load();
  assert.equal(bersihkanJalur('02-bahasan/ringkasan.docx', 'ringkasan.docx'), '02-bahasan/ringkasan.docx');
  assert.equal(bersihkanJalur('a/b/c/d.docx', 'd.docx'), 'a/b/c/d.docx');
});

test('jalur naik-direktori dibuang, bukan ditolak', async () => {
  const { bersihkanJalur } = await load();
  /* Ditolak = unggahan gagal seluruhnya karena satu nilai aneh dari klien.
     Dibuang = berkasnya tetap masuk dengan identitas yang aman. */
  assert.equal(bersihkanJalur('../../etc/passwd', 'passwd'), 'etc/passwd');
  assert.equal(bersihkanJalur('/mutlak/berkas.docx', 'berkas.docx'), 'mutlak/berkas.docx');
  assert.equal(bersihkanJalur('./a/./b.docx', 'b.docx'), 'a/b.docx');
});

test('pemisah Windows dinormalkan', async () => {
  const { bersihkanJalur } = await load();
  assert.equal(bersihkanJalur('01-naskah\\uu.docx', 'uu.docx'), '01-naskah/uu.docx');
});

test('jalur kosong jatuh ke nama berkas, tak pernah jadi kosong', async () => {
  const { bersihkanJalur } = await load();
  /* Dokumen tanpa identitas jauh lebih berbahaya daripada dokumen dengan
     identitas seadanya: externalId kosong membuat semua berkas jadi satu. */
  for (const buruk of ['', '   ', '../..', '///', null, undefined]) {
    assert.equal(bersihkanJalur(buruk as string | null, 'jatuh.docx'), 'jatuh.docx');
  }
});

test('rute memakai JALUR sebagai identitas dokumen, bukan nama berkas', () => {
  /* Identitasnya `idDokumen`, dan idDokumen SELALU diturunkan dari `rel`
     (jalur) — dengan sidik jari isi ditambahkan hanya pada mode simpan.
     Yang dikunci di sini: dasarnya tetap jalur, tak pernah kembali jadi
     nama berkas telanjang. */
  assert.match(RUTE, /const rel = jalurAman\(i, f\.name\);/, 'jalur relatif tak lagi dihitung per berkas');
  assert.match(RUTE, /const idDokumen = sidik \? `\$\{rel\}#\$\{sidik\}` : rel;/,
    'identitas dokumen tak lagi berbasis jalur — subfolder akan saling menimpa');
  assert.match(RUTE, /path: rel,/, 'path tak dikirim ke ingest — kolom folder tak akan terisi');
  assert.match(RUTE, /nama: rel,/, 'berkas asli disimpan tanpa jalur — dua berkas sejudul menimpa di blob');
});

test('klien memecah batch dan mengirim daftar jalur', () => {
  assert.match(UI, /const BATCH_BERKAS = 20;/, 'batas berkas per permintaan hilang');
  assert.match(UI, /const BATCH_BYTE = 3\.5 \* 1024 \* 1024;/, 'anggaran byte per permintaan hilang');
  assert.match(UI, /fd\.append\('paths', JSON\.stringify\(jalur\)\)/, 'daftar jalur tak ikut dikirim');
  assert.match(UI, /webkitdirectory/, 'input tak bisa memilih folder');
});

test('batch yang gagal menghentikan sisanya dan menyebut yang sudah masuk', () => {
  /* Penyebab tersering (kuota habis, sesi kedaluwarsa) pasti menjatuhkan batch
     berikutnya juga; meneruskan hanya memperbanyak galat yang sama. Tapi
     berhenti tanpa menyebut angka membuat orang tak tahu melanjutkan dari mana. */
  assert.match(UI, /berhenti di batch \$\{i \+ 1\}\/\$\{batch\.length\}/,
    'kegagalan batch tak menyebut posisi berhentinya');
  assert.match(UI, /\$\{masuk\} berkas sudah masuk/, 'kegagalan batch tak menyebut yang sudah berhasil');
});

test('nama sama + isi BERBEDA bisa jadi dua dokumen (mode simpan)', () => {
  /* Permintaan langsung Bos Galih: "2 file berbeda dengan nama sama harusnya
     jadi 2 dokumen". Yang membuatnya mungkin tanpa merusak pembaruan adalah
     sidik jari ISI ikut ke identitas — bukan cap waktu, yang akan membuat
     SETIAP unggahan ulang jadi dokumen baru dan menimbun versi usang. */
  assert.match(RUTE, /const modeKembar = form\.get\('kembar'\) === 'simpan'/,
    'mode nama-kembar tak dibaca dari permintaan');
  assert.match(RUTE, /createHash\('sha256'\)\.update\(buf\)/,
    'sidik jari dihitung dari teks, bukan byte berkas — dua berkas berbeda bisa dianggap sama');
  assert.match(RUTE, /const idDokumen = sidik \? `\$\{rel\}#\$\{sidik\}` : rel;/,
    'identitas dokumen tak menyertakan sidik jari pada mode simpan');
  assert.match(RUTE, /externalId: idDokumen,/, 'ingest masih memakai jalur telanjang');
});

test('bawaannya GANTI, bukan simpan-keduanya', () => {
  /* Kasus tersering adalah memperbaiki dokumen. Kalau bawaannya menyimpan
     keduanya, retrieval bisa menjawab dari versi yang sudah dicabut — dengan
     sitasi yang meyakinkan, dan tanpa satu pun galat yang terlihat. */
  assert.match(RUTE, /=== 'simpan' \? 'simpan' : 'ganti'/,
    'mode selain simpan harus jatuh ke ganti');
  assert.match(UI, /useState<'ganti' \| 'simpan'>\('ganti'\)/, 'bawaan UI bukan ganti');
  assert.match(UI, /fd\.append\('kembar', kembar\)/, 'mode tak ikut dikirim per batch');
});

test('judul diberi penanda agar dua dokumen sejudul bisa dibedakan', () => {
  assert.match(RUTE, /title: sidik \? `\$\{f\.name\} · \$\{sidik\}` : f\.name,/,
    'dua dokumen sejudul akan tampil sebagai dua baris yang tak bisa dibedakan siapa pun');
});

test('pembuangan versi lama memakai identitas yang sama dengan yang ditulis', () => {
  /* Kalau removeExternal memakai jalur telanjang sementara ingest menulis
     jalur+sidik, mode simpan justru menghapus dokumen lain yang sejudul —
     kebalikan persis dari yang diminta. */
  assert.match(RUTE, /removeExternal\(user\.tenantId, source\.id, \[idDokumen\]\)/,
    'identitas yang dibuang berbeda dari identitas yang ditulis');
});
