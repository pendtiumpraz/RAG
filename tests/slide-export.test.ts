import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env.DATABASE_URL ??= 'postgres://x:y@localhost:5432/z';
process.env.CREDENTIALS_ENCRYPTION_KEY ??= '0'.repeat(64);

const EXP = readFileSync('src/app/(app)/dataroom/slide-export.ts', 'utf8');
const CSS = readFileSync('src/app/(app)/dataroom/dataroom.css', 'utf8');
const PAGE = readFileSync('src/app/(app)/dataroom/page.tsx', 'utf8');

test('gaya ekspor memuat SEMUA kelas adegan yang dipakai', () => {
  /* SVG yang dirender lewat <img> terisolasi dari CSS halaman: kelas yang
     tak ikut disalin masuk akan hilang gayanya di berkas hasil — teksnya
     jadi hitam Times New Roman tanpa warna. Gagalnya tak terlihat sampai
     seseorang membuka berkasnya, jadi daftar kelasnya dijaga di sini. */
  const kelas = [...CSS.matchAll(/^\.(sc-[a-z]+)\{/gm)].map((m) => m[1]);
  assert.ok(kelas.length >= 5, 'tak menemukan kelas adegan di dataroom.css');
  for (const k of new Set(kelas)) {
    assert.ok(EXP.includes(`.${k}{`), `kelas .${k} tak ikut disalin ke SVG hasil ekspor`);
  }
});

test('animasi DIBEKUKAN pada keadaan akhir', () => {
  // Kelas an-in memulai dengan opacity 0. Tanpa dibekukan, separuh gambar
  // terekspor kosong — dan kosongnya rapi, jadi tak terlihat sebagai galat.
  for (const k of ['an-in', 'an-draw', 'an-bar']) {
    assert.ok(EXP.includes(k), `${k} tak dibekukan saat ekspor`);
  }
  assert.match(EXP, /opacity:1 !important/);
  assert.match(EXP, /stroke-dashoffset:0 !important/);
  // Paket data yang bergerak menyusuri jalur tak punya makna pada gambar
  // diam — ia justru muncul sebagai kotak kecil yang menggantung entah di mana.
  assert.match(EXP, /\.an-pkt\{ display:none \}/);
});

test('SVG hasil ekspor berlatar putih & mandiri', () => {
  // Tanpa latar, SVG jadi transparan dan teks navy-nya tak terbaca saat
  // ditempel ke dokumen berlatar gelap.
  assert.match(EXP, /fill', '#ffffff'/);
  assert.match(EXP, /setAttribute\('xmlns'/, 'SVG tanpa xmlns tak bisa dibuka di luar peramban');
  assert.match(EXP, /<\?xml version="1\.0"/);
});

test('ZIP ditulis tanpa pustaka, store-only, dan tanggalnya tetap', () => {
  // WebP sudah terkompresi; kompresi ulang tak berguna, dan menambah
  // dependensi untuk satu tombol bukan pertukaran yang masuk akal.
  assert.match(EXP, /0x04034b50/, 'tanda header lokal ZIP hilang');
  assert.match(EXP, /0x02014b50/, 'tanda central directory hilang');
  assert.match(EXP, /0x06054b50/, 'tanda end-of-central-directory hilang');
  assert.match(EXP, /setUint16\(8, 0, true\);\s*\/\/ metode 0 = stored/);
  // Tanggal tetap: ZIP dengan isi sama harus menghasilkan berkas sama, supaya
  // bisa dibandingkan dan tak berubah hanya karena diunduh ulang.
  assert.match(EXP, /0x5021/);
  // Dan benar-benar tanpa pustaka.
  assert.ok(!/from 'jszip'|require\('jszip'\)/.test(EXP), 'memakai pustaka ZIP eksternal');
});

test('ekspor mengambil dari versi CETAK, bukan panggung', () => {
  // Panggung hanya memuat SATU slide; mengambil dari sana berarti pengguna
  // harus berpindah slide satu per satu dan mengekspor berkali-kali.
  assert.match(PAGE, /\.dr-print-all \.sl-anim svg/,
    'ekspor mengambil dari panggung — hanya slide yang sedang tampil yang ikut');
});

test('tombol ekspor hanya muncul pada dek yang punya slide ilustrasi', () => {
  // Menawarkan ekspor gambar pada dek tanpa gambar hanya menghasilkan ZIP
  // kosong dan kebingungan.
  assert.match(PAGE, /deck\.slides\.some\(\(s\) => s\.kind === 'anim'\)/);
});

test('nama berkas berurutan & aman', async () => {
  const { slideFileName } = await import('../src/app/(app)/dataroom/slide-export');
  // Urutan slide harus terbaca dari nama berkasnya — tanpa itu, ZIP berisi
  // belasan gambar tak bisa disusun ulang jadi presentasi.
  assert.equal(slideFileName(0, 'Tiga cara mencari, satu jawaban'), '01-tiga-cara-mencari-satu-jawaban');
  assert.equal(slideFileName(9, 'Biaya & Token / per 1.000'), '10-biaya-token-per-1-000');
  assert.match(slideFileName(0, '!!!'), /^01-slide$/);
  assert.ok(slideFileName(0, 'x'.repeat(200)).length <= 52);
});
