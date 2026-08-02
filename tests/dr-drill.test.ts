import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { irisBlok } from './_iris';

/**
 * LATIHAN PEMULIHAN — dan kenapa tesnya soal apa yang TIDAK boleh terjadi.
 *
 * `dr:verify` membandingkan BENTUK produksi dengan patokan di repo; ia tak
 * pernah menyentuh isinya. `dr:drill` menjawab pertanyaan berikutnya: kalau
 * produksi hilang sekarang, apakah DATANYA benar-benar bisa dibaca kembali
 * dari titik waktu kemarin. Bedanya bukan akademis — bentuk yang utuh di atas
 * basis data KOSONG terlihat persis sama sehatnya di setiap pemeriksaan
 * otomatis yang ada sebelum ini.
 *
 * Skrip yang membuat dan MENGHAPUS basis data punya satu bentuk kegagalan
 * yang jauh lebih mahal daripada semua yang lain, dan tak satu pun tes bisa
 * membatalkannya setelah terjadi. Karena itu yang dijaga di sini bukan
 * "latihannya berhasil" melainkan "ia tak mungkin salah sasaran".
 */

const SRC = readFileSync('scripts/dr-drill.ts', 'utf8');

test('hanya menghapus branch yang IA SENDIRI buat', () => {
  /* Tak ada satu pun jalur yang menerima nama atau id branch dari luar. Satu
     salah ketik pada nama branch sudah cukup untuk menghapus branch produksi,
     dan penghapusan itu tak punya langkah "apakah kamu yakin". */
  assert.ok(/const branchId = dibuat\.branch\.id;/.test(SRC),
    'id branch tidak diambil dari respons pembuatannya');
  const hapus = SRC.match(/branches\/\$\{[^}]+\}`, \{ method: 'DELETE' \}/g) ?? [];
  assert.equal(hapus.length, 1, 'ada lebih dari satu jalur penghapusan');
  assert.ok(hapus[0].includes('${branchId}'), 'penghapusan memakai pengenal selain branchId');
  assert.ok(!/process\.argv[\s\S]{0,200}branch/i.test(SRC),
    'nama/id branch bisa datang dari argumen baris perintah');
});

test('berhenti bila URI-nya ternyata menunjuk PRODUKSI', () => {
  /* Lapisan kedua. Kalau sampai sama, ada yang salah paham secara mendasar
     dan tak ada yang boleh dilanjutkan — termasuk pemeriksaan yang "cuma
     membaca", karena langkah terakhirnya menghapus. */
  assert.ok(/uri\.split\('@'\)\[1\] === prod\.split\('@'\)\[1\]/.test(SRC),
    'URI branch tak dibandingkan dengan produksi');
  const i = SRC.indexOf("dihentikan sebelum menyentuh apa pun");
  const j = SRC.indexOf('postgres(uri');
  assert.ok(i > 0 && j > 0 && i < j, 'sambungan dibuka sebelum perbandingan dilakukan');
});

test('branch SELALU dibuang — berhasil maupun gagal', () => {
  /* Branch yang tertinggal terus menagih biaya penyimpanan dan, lebih buruk,
     jadi salinan data pelanggan yang hidup di luar jalur yang dijaga siapa
     pun. Menaruh penghapusan di jalur sukses berarti justru run yang GAGAL —
     yang paling mungkin terjadi saat pertama kali dicoba — yang meninggalkan
     salinan itu. */
  const iFinally = SRC.lastIndexOf('} finally {');
  const iHapus = SRC.indexOf("method: 'DELETE'");
  assert.ok(iFinally > 0 && iHapus > iFinally, 'penghapusan branch tidak di dalam finally');
});

test('kegagalan MENGHAPUS diteriakkan, bukan ditelan', () => {
  /* Satu-satunya keadaan yang lebih buruk daripada branch tertinggal adalah
     branch tertinggal yang tak seorang pun tahu. */
  assert.ok(/HAPUS MANUAL DI NEON CONSOLE/.test(SRC),
    'gagal menghapus branch tak memberi tahu apa yang harus dilakukan');
});

test('memeriksa ISI, bukan hanya bentuk', () => {
  /* Inilah yang membedakannya dari dr:verify, dan alasan kartu a-runbook
     tetap terbuka sebagian sampai sekarang. */
  assert.ok(/HARUS_BERISI/.test(SRC), 'tak ada pemeriksaan isi sama sekali');
  for (const t of ['tenants', 'users', 'documents']) {
    assert.ok(new RegExp(`'${t}'`).test(SRC), `${t} tak ikut diperiksa isinya`);
  }
  assert.ok(/tabel yang seharusnya berisi ternyata KOSONG/.test(SRC),
    'tabel kosong tidak menggagalkan latihan');
});

test('isolasi tenant ikut diperiksa pada hasil pemulihan', () => {
  /* Pemulihan yang mengembalikan seluruh data tapi mematikan RLS lebih buruk
     daripada tak memulihkan: semua orang melihat data semua orang, dan tak
     ada satu pun galat yang muncul. */
  assert.ok(/not t\.rowsecurity/.test(SRC), 'RLS tak diperiksa di branch hasil pemulihan');
  assert.ok(/column_name = 'tenant_id'/.test(SRC),
    'pemeriksaan RLS tak dikaitkan dengan tabel ber-tenant_id');
});

test('tanpa kredensial ia BERHENTI, bukan menguji sesuatu yang lebih mudah', () => {
  /* Godaan terbesar skrip semacam ini adalah "kalau tak ada kunci, uji saja
     yang lokal" — dan laporan hijau yang dihasilkannya menjawab pertanyaan
     yang sama sekali berbeda dari yang ditanyakan. */
  const blok = irisBlok(SRC, 'async function main()');
  assert.ok(/if \(!KEY \|\| !PROJECT\)/.test(blok), 'ketiadaan kredensial tak diperiksa di awal');
  const iCek = blok.indexOf('if (!KEY || !PROJECT)');
  const iBuat = blok.indexOf('method: \'POST\'');
  assert.ok(iCek > 0 && (iBuat < 0 || iCek < iBuat), 'branch dibuat sebelum kredensial diperiksa');
});

test('runbook tidak lagi menyebutnya mustahil diotomasi', () => {
  /* Klaim "itu langkah manusia, bukan langkah yang bisa diotomasi dari repo
     ini" berbahaya justru karena terdengar masuk akal — ia menghentikan orang
     berikutnya sebelum ia sempat memeriksa. Neon punya REST API untuk
     ketiganya: membuat branch dari titik waktu, memberi connection string,
     menghapusnya. */
  const rb = readFileSync('docs/RUNBOOK.md', 'utf8');
  /* Frasanya BOLEH tetap ada — tapi hanya sebagai KUTIPAN sejarah di dalam
     blockquote, bukan sebagai klaim yang berlaku. Melarang katanya sama
     sekali akan memaksa penghapusan penjelasan kenapa ia keliru, dan
     pembaca berikutnya kehilangan pelajarannya. */
  const sebagaiKlaim = rb.split('\n')
    .filter((b) => !b.trimStart().startsWith('>'))
    .some((b) => b.includes('bukan langkah yang bisa diotomasi dari repo ini'));
  assert.equal(sebagaiKlaim, false, 'runbook masih MENYATAKAN latihan ini mustahil diotomasi');
  assert.ok(/dr:drill/.test(rb), 'runbook tak menyebut perintah latihannya');
});
