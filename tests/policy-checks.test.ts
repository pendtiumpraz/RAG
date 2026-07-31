import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env.DATABASE_URL ??= 'postgres://x:y@localhost:5432/z';
process.env.CREDENTIALS_ENCRYPTION_KEY ??= '0'.repeat(64);

/**
 * PEMERIKSA KEPATUHAN JAWABAN.
 *
 * Kalau pendeteksinya salah, eval-nya berbohong dua arah sekaligus: penolakan
 * yang benar dilaporkan sebagai karangan (dan orang mengejar bug yang tak
 * ada), atau karangan lolos sebagai penolakan (dan produk mengirim jawaban
 * palsu ke pelanggan). Arah kedua yang jauh lebih mahal.
 */

const load = () => import('../src/modules/eval/policy-checks');

/* JAWABAN SUNGGUHAN dari DeepSeek V4 Flash, 31 Jul 2026, korpus produksi.
   Bukan contoh karangan sendiri: versi pertama pendeteksi ini LULUS seluruh
   contoh buatan tangan lalu meleset pada kalimat pertama di bawah, karena
   frasanya berbunyi "tidak tersedia DI DALAM dokumen" — dua kata sisipan.
   Contoh yang ditulis sendiri cenderung mengikuti bentuk yang ada di kepala
   penulisnya, dan justru bentuk itulah yang tak pernah gagal. */
const NYATA_MENOLAK = [
  'Informasi mengenai gaji rata-rata karyawan tidak tersedia di dalam dokumen yang diberikan [1][2][3][5][6]. Dokumen hanya memuat data pendirian perusahaan, izin usaha, NIB, dan susunan pemegang saham/pengurus.',
  'Jumlah karyawan perusahaan tidak disebutkan dalam dokumen yang tersedia [1][3][4][5].',
  'Data pendapatan (revenue) perusahaan tidak tersedia dalam dokumen yang diberikan [1]-[6]. Dokumen yang ada hanya memuat profil lembaga, izin usaha, NIB, dan izin lokasi, tanpa informasi keuangan apa pun.',
];

const NYATA_MENJAWAB = [
  'Direktur Utama organisasi ini adalah Muhammad Rizal Karunia Haris [3].',
  'Alamat kantor perusahaan PT SAINSKERTA SOLUSI NUSANTARA adalah Gedung Graha Mampang Lantai 3 Suite 305, Jalan Mampang Prapatan Raya Kav 100, Kelurahan Duren Tiga, Kecamatan Pancoran, Kota Adm. Jakarta Selatan.',
  'Berdasarkan NIB 9120206721876, perusahaan memegang beberapa kode KBLI. Izin usahanya menyebutkan Kode KBLI 70209 untuk Aktivitas Konsultasi Manajemen Lainnya [4].',
];

test('penolakan NYATA dari model dikenali sebagai penolakan', async () => {
  const { deteksiPenolakan } = await load();
  for (const j of NYATA_MENOLAK) {
    assert.ok(deteksiPenolakan(j),
      `penolakan sungguhan dilaporkan sebagai KARANGAN: "${j.slice(0, 70)}…"`);
  }
});

test('jawaban NYATA yang mengklaim sesuatu TIDAK dikira menolak', async () => {
  const { deteksiPenolakan } = await load();
  for (const j of NYATA_MENJAWAB) {
    assert.ok(!deteksiPenolakan(j),
      `jawaban berisi dikira penolakan — karangan akan lolos: "${j.slice(0, 70)}…"`);
  }
});

test('penolakan butuh DUA sinyal: mengingkari ketersediaan DAN menyebut sumber', async () => {
  const { deteksiPenolakan } = await load();
  // "tidak tahu" saja belum tentu penolakan berbasis dokumen — bisa jadi
  // model sekadar bingung, dan itu perilaku lain yang tak boleh dicampur.
  assert.ok(!deteksiPenolakan('Saya tidak tahu.'));
  assert.ok(!deteksiPenolakan('Nomornya tidak bulat.'));
  // Menyebut dokumen tanpa mengingkari apa pun juga bukan penolakan.
  assert.ok(!deteksiPenolakan('Dokumen ini memuat data pendirian perusahaan.'));
  // Keduanya ada → penolakan.
  assert.ok(deteksiPenolakan('Hal itu tidak disebutkan dalam dokumen.'));
  assert.ok(deteksiPenolakan('That is not mentioned in the provided documents.'));
});

test('jawaban kosong dihitung MENOLAK, bukan mengarang', async () => {
  const { deteksiPenolakan } = await load();
  // Tak ada yang diklaim → tak ada yang bisa dikarang. Jawaban buruk, tapi
  // bukan halusinasi, dan kartu ini mengukur halusinasi.
  assert.ok(deteksiPenolakan(''));
  assert.ok(deteksiPenolakan('   \n  '));
});

test('bahasa: nama diri dan istilah teknis tak mengacaukan penilaian', async () => {
  const { deteksiBahasa } = await load();
  // Kata ISI sering sama di kedua bahasa; kata FUNGSI hampir tak pernah
  // menyeberang. Itulah kenapa penilaiannya bersandar pada kata fungsi.
  assert.equal(
    deteksiBahasa('Direktur Utama organisasi ini adalah Muhammad Rizal, dan beliau juga tercatat pada akta pendirian yang dibuat oleh notaris.'),
    'id');
  assert.equal(
    deteksiBahasa('The managing director of PT SAINSKERTA SOLUSI NUSANTARA is listed in the deed, and the document also states the address.'),
    'en');
});

test('bahasa: bukti tipis dijawab null, bukan ditebak', async () => {
  const { deteksiBahasa } = await load();
  // Meleset ke sisi PESIMIS dengan sengaja — di pelari eval, null dihitung
  // TIDAK COCOK. Eval yang meleset ke sisi optimis akan meloloskan
  // pelanggaran, dan itu arah kesalahan yang berbahaya.
  assert.equal(deteksiBahasa('9120206721876'), null);
  assert.equal(deteksiBahasa('Kode KBLI 58200'), null);
  // Menang tipis bukan bukti: campuran istilah Inggris di kalimat Indonesia
  // lazim, jadi dituntut selisih minimal dua kata fungsi.
  assert.equal(deteksiBahasa('the yang and dan of dari'), null);
});

test('mengarang dan menolak-padahal-ada adalah pelanggaran BERBEDA', async () => {
  const { nilaiJawaban, periksaJawaban } = await load();

  // Pertanyaan tanpa jawaban, model menjawab panjang lebar → KARANGAN.
  const karang = nilaiJawaban(
    periksaJawaban('Gaji rata-rata karyawan adalah Rp 12.000.000 per bulan.', 6),
    { harusMenolak: true });
  assert.ok(karang.some((v) => v.jenis === 'mengarang'));

  // Pertanyaan berjawab, model menolak → menjengkelkan, TAPI JUJUR.
  // Menyamakan keduanya menghapus perbedaan yang paling menentukan:
  // yang satu menyesatkan pengguna, yang satu tidak.
  const tolak = nilaiJawaban(
    periksaJawaban('Hal itu tidak disebutkan dalam dokumen.', 3),
    { harusMenolak: false });
  assert.ok(tolak.some((v) => v.jenis === 'menolak-padahal-ada'));
  assert.ok(!tolak.some((v) => v.jenis === 'mengarang'));
});

test('sitasi TIDAK dituntut pada penolakan', async () => {
  const { nilaiJawaban, periksaJawaban } = await load();
  // Menuntutnya akan menghukum perilaku yang justru benar: menolak memang
  // tak merujuk dokumen mana pun.
  const v = nilaiJawaban(
    periksaJawaban('Tidak ada informasi itu di dokumen.', 0),
    { harusMenolak: true });
  assert.ok(!v.some((x) => x.jenis === 'tanpa-sitasi'));

  // Tapi jawaban yang MENGKLAIM sesuatu tanpa rujukan tetap dilanggar —
  // tanpa itu, klaim "bersumber" tak bisa diperiksa siapa pun.
  const w = nilaiJawaban(
    periksaJawaban('Direktur utamanya adalah Muhammad Rizal.', 0),
    { harusMenolak: false });
  assert.ok(w.some((x) => x.jenis === 'tanpa-sitasi'));
});

test('himpunan kebijakan memuat cukup pertanyaan tanpa jawaban DAN dwibahasa', async () => {
  const { validasi } = await import('../src/modules/eval/golden');
  const h = validasi(JSON.parse(readFileSync('eval/golden/kebijakan-jawaban.json', 'utf8')));
  const kosong = h.pertanyaan.filter((p) => p.docRefs.length === 0);
  const en = h.pertanyaan.filter((p) => p.bahasa === 'en');
  // Kartu ini memang tentang MENOLAK dan BAHASA; himpunan yang kurang salah
  // satunya tak bisa mengukur hal yang jadi alasannya ada.
  assert.ok(kosong.length >= 4, `hanya ${kosong.length} pertanyaan tanpa jawaban — terlalu goyah`);
  assert.ok(en.length >= 3, `hanya ${en.length} pertanyaan Inggris — kebijakan bahasa tak teruji`);
  assert.ok(kosong.some((p) => p.bahasa === 'en'),
    'tak ada pertanyaan tanpa jawaban berbahasa Inggris — menolak pun harus dalam bahasa penanya');
});

test('penolakan berbahasa Inggris dikenali pada BENTUK KATA apa pun', async () => {
  /* Jawaban model sungguhan, 31 Jul 2026: "The documents do not STATE the
     total number of employees" — pola lama menuntut "stated" (bentuk
     lampau) dan meleset, jadi penolakan yang benar dilaporkan sebagai
     KARANGAN dan gerbangnya berbunyi palsu. Contoh uji buatan tangan
     kebetulan seluruhnya memakai bentuk lampau, jadi cacatnya tak pernah
     muncul sampai dijalankan terhadap model. */
  const { deteksiPenolakan } = await load();
  for (const j of [
    'The documents do not state the total number of employees at the company. [1][5]',
    'The provided documents do not specify the revenue for last quarter.',
    'The context does not list any branch offices outside Jakarta.',
    'The documents do not indicate the average salary.',
    'That information is not available in the provided sources.',
  ]) {
    assert.ok(deteksiPenolakan(j), `penolakan Inggris dilaporkan sebagai KARANGAN: "${j.slice(0, 62)}…"`);
  }
});
