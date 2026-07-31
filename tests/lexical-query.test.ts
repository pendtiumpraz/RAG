import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env.DATABASE_URL ??= 'postgres://x:y@localhost:5432/z';
process.env.CREDENTIALS_ENCRYPTION_KEY ??= '0'.repeat(64);

/**
 * KAKI LEKSIKAL.
 *
 * Cacat yang dijaga di sini pernah MEMATIKAN seluruh kaki leksikal tanpa satu
 * pun galat: plainto_tsquery menggabungkan kata dengan AND, konfigurasi
 * `simple` tak membuang stopword, jadi kata tanya jadi syarat wajib dan
 * hampir setiap pertanyaan alami mencocoki NOL potongan. Hybrid search yang
 * dijual tiga kaki berjalan satu setengah — dan tak ada tes yang gagal, tak
 * ada log yang berbunyi, tak ada pengguna yang bisa menyebutkan apa yang
 * salah. Hanya jawaban yang lebih sering meleset.
 */

const load = () => import('../src/modules/chat/lexical-query');
const SVC = readFileSync('src/modules/chat/retrieval.service.ts', 'utf8');

test('kata tanya DIBUANG — inilah yang dulu membunuh seluruh kaki', async () => {
  const { lexicalTsquery } = await load();
  // Ketiga pertanyaan ini terukur mencocoki NOL potongan di korpus produksi
  // sebelum perbaikan, sementara istilah intinya saja mencocoki beberapa.
  assert.equal(lexicalTsquery('berapa NPWP perusahaan'), 'npwp | perusahaan');
  assert.equal(lexicalTsquery('siapa notaris yang membuat akta pendirian'),
    'notaris | membuat | akta | pendirian');
  assert.equal(lexicalTsquery('apa kode dan nama KBLI perusahaan'),
    'kode | nama | kbli | perusahaan');
});

test('digabung OR, bukan AND', async () => {
  const { lexicalTsquery } = await load();
  const q = lexicalTsquery('izin usaha industri')!;
  assert.ok(q.includes('|'), 'masih AND — potongan yang cocok sebagian akan gugur');
  assert.ok(!q.includes('&'), 'ada AND tersisa');
  // AND tak dipakai walau seluruh stopword sudah dibuang: "kode KBLI
  // perusahaan" akan menggugurkan potongan berbunyi "Kode KBLI: 58200" yang
  // tak menyebut kata "perusahaan" — padahal itu jawabannya.
});

test('pertanyaan yang isinya HANYA kata tanya menghasilkan null', async () => {
  const { lexicalTsquery } = await load();
  // null berarti kaki leksikal DILEWATI, bukan dikirimi kuery kosong.
  // Penggabungan lalu jatuh ke vektor murni — perilaku yang memang benar.
  assert.equal(lexicalTsquery('apa itu?'), null);
  assert.equal(lexicalTsquery('siapa yang'), null);
  assert.equal(lexicalTsquery('   '), null);
  assert.equal(lexicalTsquery('what is this'), null);
});

test('istilah pembeda TIDAK ikut terbuang', async () => {
  const { lexicalTsquery } = await load();
  // Daftar stopword yang terlalu panjang mulai membuang kata yang justru
  // menentukan. Angka tahun & kode dokumen pendek adalah pembeda terpenting
  // antar-berkas, dan kehilangannya jauh lebih mahal daripada menyimpan satu
  // kata umum yang toh nilainya rendah di ts_rank_cd.
  const q = lexicalTsquery('berapa nilai RAB 2020 untuk proyek pusat')!;
  for (const wajib of ['rab', '2020', 'proyek', 'pusat', 'nilai']) {
    assert.ok(q.includes(wajib), `istilah pembeda "${wajib}" ikut terbuang`);
  }
});

test('duplikat dibuang dan jumlah istilah dibatasi', async () => {
  const { lexicalTsquery } = await load();
  const q = lexicalTsquery('izin usaha izin lokasi izin operasional')!;
  assert.equal(q.split(' | ').filter((t) => t === 'izin').length, 1,
    'istilah berulang tak dibuang — tsquery jadi panjang tanpa menaikkan peringkat');

  const panjang = lexicalTsquery(Array.from({ length: 40 }, (_, i) => `istilah${i}`).join(' '))!;
  assert.ok(panjang.split(' | ').length <= 12, 'pertanyaan panjang melahirkan kuery raksasa');
});

test('keluaran hanya huruf, angka, dan pemisah — aman untuk to_tsquery', async () => {
  const { lexicalTsquery } = await load();
  // to_tsquery MELEMPAR pada sintaks yang salah, tak sekadar mengembalikan
  // kosong. Satu tanda kutip dari pertanyaan pengguna cukup untuk membuat
  // SELURUH pencarian gagal, bukan cuma kaki leksikalnya.
  const kotor = lexicalTsquery(`nomor 'kontrak' & (2020) | "penting" !? <-> :*`);
  assert.ok(kotor === null || /^[a-z0-9]+( \| [a-z0-9]+)*$/.test(kotor),
    `keluaran memuat karakter yang ditolak to_tsquery: ${kotor}`);
});

test('retrieval memakai to_tsquery, bukan plainto_tsquery', async () => {
  // Penjaga terhadap kemunduran diam-diam: mengembalikannya ke
  // plainto_tsquery tak akan menggagalkan satu tes pun selain ini, dan
  // gejalanya hanya "jawaban terasa kurang tepat".
  assert.ok(!/plainto_tsquery\('simple', \$\{query\}\)/.test(SVC),
    'kembali memakai plainto_tsquery atas pertanyaan mentah — kaki leksikal akan mati lagi');
  assert.ok(/to_tsquery\('simple', \$\{lexQuery/.test(SVC),
    'kaki leksikal tak lagi memakai kuery hasil lexicalTsquery');
  assert.ok(/lexicalTsquery\(query\)/.test(SVC), 'lexicalTsquery tak dipanggil');
});

test('kuery null MEMATIKAN kaki leksikal, bukan mencocoki semuanya', async () => {
  /* Kalau null jatuh jadi to_tsquery('') tanpa penjaga, `fts @@ tsq` bernilai
     false untuk semua baris — aman. Tapi bergantung pada perilaku itu rapuh;
     penjagaan eksplisit membuat maksudnya terbaca dan tak bisa bergeser. */
  assert.ok(/\$\{lexQuery \? sql`d\.fts @@ q\.tsq` : sql`false`\}/.test(SVC),
    'tak ada penjagaan eksplisit saat kuery leksikal kosong');
});
