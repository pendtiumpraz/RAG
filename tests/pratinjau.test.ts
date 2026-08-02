import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { irisBlok } from './_iris';
import {
  KARAKTER_PER_POTONGAN, perkiraanPotongan, rasioTeks,
  ringkasPerFolder, saringFolderTerpilih,
} from '../src/modules/knowledge/pratinjau';

/**
 * PRATINJAU SUMBER — apa yang akan diserap, SEBELUM satu byte pun diunduh.
 *
 * Saran paling berdampak untuk korpus 700 GB bukan soal mesin: jangan indeks
 * semuanya. 20 GB terpilih mengalahkan 700 GB tanpa pilih — bukan karena
 * mesinnya lebih baik, melainkan karena pengganggunya jauh lebih sedikit, dan
 * pengganggu itulah yang menenggelamkan jawaban benar di lapisan pertama.
 *
 * `dedupe.ts` sudah ada tapi bekerja SESUDAH berkasnya ditarik. Pada 700 GB,
 * "sudah diunduh lalu dibuang" berarti biayanya sudah dibayar penuh.
 */

const terbaca = (nama: string) => /\.(pdf|docx|txt|md)$/i.test(nama);

/* ── perkiraan ────────────────────────────────────────────────────────── */

test('berkas terbaca SELALU minimal satu potongan', () => {
  /* Membulatkan ke nol membuat folder berisi ribuan berkas kecil tampak
     gratis — padahal justru itu bentuk korpus yang paling boros baris, karena
     tiap berkas tetap satu baris di basis data dan tetap memakan kuota. */
  assert.equal(perkiraanPotongan('a.txt', 1), 1);
  assert.equal(perkiraanPotongan('a.txt', 0), 1);
  assert.equal(perkiraanPotongan('a.txt', undefined), 1);
});

test('rasio teks BERBEDA per format — PDF bukan teks polos', () => {
  /* Menyamakan semuanya membuat perkiraan meleset dua kali lipat ke arah
     yang salah: satu folder PDF 10 GB akan tampak seolah menghasilkan
     belasan juta potongan, dan pemiliknya menyimpulkan produknya tak mungkin
     dipakai. */
  assert.ok(rasioTeks('a.txt') > rasioTeks('a.pdf') * 10, 'teks polos tak dibedakan dari PDF');
  assert.equal(rasioTeks('a.PDF'), rasioTeks('a.pdf'), 'ekstensi huruf besar dianggap format lain');
  assert.ok(rasioTeks('tanpa-ekstensi') > 0, 'berkas tanpa ekstensi jadi nol potongan');
});

test('perkiraan memakai karakter BARU per potongan, bukan panjang potongan', () => {
  /* Potongan 800 karakter bertumpang tindih 120, jadi tiap potongan hanya
     menambah 680 karakter baru. Memakai 800 meremehkan jumlah potongan ±18% —
     dan meremehkan adalah arah kesalahan yang paling merugikan di sini, karena
     orang mencentang folder yang ternyata menghabiskan kuotanya. */
  assert.equal(KARAKTER_PER_POTONGAN, 680);
  const byte = 100_000;
  const harap = Math.ceil((byte * rasioTeks('a.txt')) / KARAKTER_PER_POTONGAN);
  assert.equal(perkiraanPotongan('a.txt', byte), harap);
});

/* ── ringkasan per folder ─────────────────────────────────────────────── */

const berkas = [
  { name: 'sop.pdf', size: 400_000, path: 'kebijakan/2026/sop.pdf' },
  { name: 'notula.docx', size: 90_000, path: 'kebijakan/2026/notula.docx' },
  { name: 'lama.pdf', size: 200_000, path: 'kebijakan-lama/lama.pdf' },
  { name: 'logo.png', size: 5_000_000, path: 'aset/logo.png' },
  { name: 'akar.txt', size: 3_000 },
];

test('dikelompokkan per folder; yang tanpa jalur jatuh ke AKAR', () => {
  /* Notion & Slack tak punya hierarki sama sekali. Seluruh berkasnya di akar
     adalah jawaban yang benar — bukan kekurangan yang perlu ditambal dengan
     folder karangan. */
  const p = ringkasPerFolder(berkas, terbaca);
  const jalur = p.folder.map((f) => f.jalur);
  assert.ok(jalur.includes('kebijakan/2026'));
  assert.ok(jalur.includes(''), 'berkas tanpa jalur tak masuk akar');
  assert.equal(p.total.berkas, 5);
});

test('format tak terbaca DIHITUNG TERPISAH, bukan disembunyikan', () => {
  /* Folder berisi 5.000 gambar tampak besar di kolom byte sementara
     potongannya nol. Tanpa kolom ini orang menyimpulkan pratinjaunya rusak,
     bukan bahwa berkasnya memang tak terbaca. */
  const p = ringkasPerFolder(berkas, terbaca);
  const aset = p.folder.find((f) => f.jalur === 'aset')!;
  assert.equal(aset.takTerbaca, 1);
  assert.equal(aset.perkiraanPotongan, 0, 'berkas tak terbaca ikut dihitung potongannya');
  assert.ok(aset.byte > 0, 'ukurannya hilang — folder besar tampak kosong');
  assert.equal(p.total.takTerbaca, 1);
});

test('diurutkan dari yang PALING BERAT', () => {
  /* Itulah yang orang cari saat memutuskan apa yang tak perlu diserap. */
  const p = ringkasPerFolder(berkas, terbaca);
  for (let i = 1; i < p.folder.length; i += 1) {
    assert.ok(p.folder[i - 1].perkiraanPotongan >= p.folder[i].perkiraanPotongan);
  }
});

test('penanda TERPOTONG diteruskan apa adanya', () => {
  /* Pendaftaran yang kena batas berarti yang ditampilkan BUKAN seluruh isinya
     — dan mencentang berdasar daftar yang tak lengkap menghasilkan keputusan
     yang salah tentang data yang tak pernah dilihat. */
  assert.equal(ringkasPerFolder(berkas, terbaca, true).terpotong, true);
  assert.equal(ringkasPerFolder(berkas, terbaca).terpotong, false);
});

/* ── penyaring folder terpilih ────────────────────────────────────────── */

test('daftar KOSONG berarti SEMUA, bukan tak satu pun', () => {
  /* Arti sebaliknya akan membuat setiap sumber yang sudah ada berhenti
     menyerap apa pun pada detik fitur ini dipasang — tanpa galat, tanpa
     jejak, dan tanpa siapa pun tahu sebabnya sampai ada yang bertanya kenapa
     knowledge base-nya menyusut. */
  assert.equal(saringFolderTerpilih(berkas, []).length, berkas.length);
  assert.equal(saringFolderTerpilih(berkas, null).length, berkas.length);
  assert.equal(saringFolderTerpilih(berkas, undefined).length, berkas.length);
});

test('prefiks BERPEMISAH — "kebijakan" tak menyeret "kebijakan-lama"', () => {
  const hasil = saringFolderTerpilih(berkas, ['kebijakan']);
  assert.deepEqual(hasil.map((f) => f.name), ['sop.pdf', 'notula.docx']);
});

test('jalur dengan garis miring berlebih tetap cocok', () => {
  /* Jalur yang disimpan dengan garis miring di ujung akan gagal cocok dengan
     jalur yang dihitung dari berkas, dan penyaringnya lalu membuang SEMUANYA
     — tanpa galat. */
  assert.equal(saringFolderTerpilih(berkas, ['/kebijakan/2026/']).length, 2);
});

/* ── penjagaan yang paling menentukan ─────────────────────────────────── */

const SYNC = readFileSync('src/modules/knowledge/sync.service.ts', 'utf8');

test('pilihan yang MENGHABISKAN daftar menghentikan sync, bukan menghapus KB', () => {
  /* Bentuk kegagalan paling mahal di seluruh kartu ini, dan ia tak
     bergejala sampai terlambat: kalau jalur tersimpan tak cocok dengan jalur
     terhitung — satu garis miring cukup — penyaringnya mengembalikan NOL
     berkas, dan planDelta melihat SELURUH isi knowledge base "lenyap dari
     upstream" lalu menghapusnya. */
  const blok = irisBlok(SYNC, 'export async function runSync(');
  assert.ok(/conn\.files\.length > 0 && berkasTerpilih\.length === 0/.test(blok),
    'tak ada penjagaan untuk pilihan folder yang tak cocok apa pun');
  const iJaga = blok.indexOf('berkasTerpilih.length === 0');
  const iPlan = blok.indexOf('planDelta(');
  assert.ok(iJaga > 0 && iPlan > 0 && iJaga < iPlan,
    'penjagaan berjalan SETELAH planDelta — penghapusannya sudah terlanjur direncanakan');
  assert.ok(/sync\.folder_kosong/.test(blok), 'keadaan ini tak diteriakkan ke mana pun');
});

test('penyaringan terjadi SEBELUM unduh', () => {
  /* Seluruh gunanya. Menyaring sesudah unduh berarti biayanya sudah dibayar
     penuh — bandwidth, waktu, dan pada jalur embedding API juga uang. */
  const blok = irisBlok(SYNC, 'export async function runSync(');
  const iSaring = blok.indexOf('saringFolderTerpilih(');
  const iUnduh = blok.indexOf('conn.fetch(');
  assert.ok(iSaring > 0 && iUnduh > 0 && iSaring < iUnduh, 'folder disaring setelah berkas diunduh');
});

test('pratinjau memakai connect() yang SAMA dengan sync', () => {
  /* Jalur pendaftaran kedua akan berbeda perilakunya dalam hal yang tak
     seorang pun sadari sampai hasilnya beda — dan pada fitur yang gunanya
     MEMPERCAYAI angkanya sebelum membayar, itu menghapus seluruh gunanya. */
  const blok = irisBlok(SYNC, 'export async function pratinjauSumber(');
  assert.ok(/await connect\(/.test(blok), 'pratinjau memakai jalur pendaftaran sendiri');
  assert.ok(/ringkasPerFolder\(conn\.files, isExtractable, conn\.truncated\)/.test(blok),
    'pratinjau tak memakai penentu keterbacaan yang sama dengan sync');
});

test('pratinjau TIDAK mengunduh apa pun', () => {
  const blok = irisBlok(SYNC, 'export async function pratinjauSumber(');
  assert.ok(!/\.fetch\(/.test(blok), 'pratinjau mengunduh berkas — seluruh gunanya hilang');
});

/* ── yang dilihat pemiliknya ──────────────────────────────────────────── */

const PAGE = readFileSync('src/app/(app)/knowledge/page.tsx', 'utf8');

test('Pratinjau ada DI SAMPING Sync, bukan tersembunyi', () => {
  /* Kemampuan yang harus dicari dulu tak akan dipakai orang yang paling
     membutuhkannya — yaitu orang yang belum tahu korpusnya terlalu besar. */
  assert.ok(/function PratinjauDrawer\(/.test(PAGE), 'laci pratinjau tak ada');
  assert.ok(/setPratinjauId\(s\.id\)/.test(PAGE), 'tombol pratinjau tak ada di baris sumber');
  const iPratinjau = PAGE.indexOf('setPratinjauId(s.id)');
  const iSync = PAGE.indexOf('onClick={() => resync(s.id)}');
  assert.ok(iPratinjau > 0 && iPratinjau < iSync,
    'Pratinjau muncul SETELAH Sync — urutannya di layar harus mengikuti urutan yang seharusnya dikerjakan');
});

test('perkiraannya DISEBUT kasar, tidak disodorkan sebagai fakta', () => {
  /* Angka yang tampak pasti akan dipakai sebagai dasar keputusan yang lebih
     berat daripada yang bisa ditanggungnya — dan yang menanggung akibatnya
     bukan yang menuliskannya. */
  assert.ok(/KASAR/.test(PAGE), 'perkiraan potongan tak ditandai sebagai perkiraan');
});

test('akibat TIDAK mencentang ditulis di layar', () => {
  /* Folder yang tak dipilih dikeluarkan dari knowledge base pada sync
     berikutnya. Itu penghapusan — dan penghapusan yang tak diumumkan lebih
     dulu adalah kejutan, bukan fitur. */
  assert.ok(/DIKELUARKAN<\/b> DARI KNOWLEDGE BASE/.test(PAGE),
    'akibat tidak mencentang tak dijelaskan');
  assert.ok(/DIHAPUS LUNAK/.test(PAGE), 'tak disebutkan bahwa penghapusannya bisa dipulihkan');
});

test('daftar terpotong DITERIAKKAN di layar', () => {
  assert.ok(/BUKAN<\/b> SELURUH ISINYA/.test(PAGE),
    'pendaftaran yang kena batas tak diberitahukan — orang mencentang berdasar daftar tak lengkap');
});
