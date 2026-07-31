import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

process.env.DATABASE_URL ??= 'postgres://x:y@localhost:5432/z';
process.env.CREDENTIALS_ENCRYPTION_KEY ??= '0'.repeat(64);

/**
 * HARNESS EVAL — perhitungan metrik & kelayakan himpunan baku.
 *
 * Yang diuji di sini adalah satu-satunya bagian yang BISA dibuktikan benar
 * tanpa basis data. Kalau perhitungannya salah, seluruh eval berbohong ke
 * arah yang paling berbahaya: ia membuat orang yakin pada perubahan yang
 * sebenarnya memburuk. Angka eval yang salah hitung lebih buruk daripada
 * tak punya angka sama sekali.
 */

const load = () => import('../src/modules/eval/metrics');
const loadGolden = () => import('../src/modules/eval/golden');

test('recall@k menghitung bagian jawaban benar yang terambil', async () => {
  const { recallAtK } = await load();
  assert.equal(recallAtK(['a', 'b', 'c'], ['a', 'b'], 3), 1);
  assert.equal(recallAtK(['a', 'x', 'y'], ['a', 'b'], 3), 0.5);
  assert.equal(recallAtK(['x', 'y', 'z'], ['a'], 3), 0);
  // Di luar K tidak dihitung — itulah gunanya K.
  assert.equal(recallAtK(['x', 'y', 'a'], ['a'], 2), 0);
  // Tak ada yang harus ditemukan → sempurna, bukan nol. Pertanyaan jenis
  // "tak ada jawabannya" akan selalu dinilai 0 kalau ini salah.
  assert.equal(recallAtK(['x'], [], 3), 1);
});

test('presisi memakai panjang NYATA, bukan k', async () => {
  const { precisionAtK } = await load();
  // 3 hasil, semuanya benar, k=10 → 1,0. Membaginya dengan 10 berarti
  // menghukum sistem karena JUJUR mengembalikan sedikit.
  assert.equal(precisionAtK(['a', 'b', 'c'], ['a', 'b', 'c'], 10), 1);
  assert.equal(precisionAtK(['a', 'x'], ['a'], 10), 0.5);
  assert.equal(precisionAtK([], ['a'], 10), 0);
});

test('MRR hanya melihat jawaban benar PERTAMA', async () => {
  const { reciprocalRank } = await load();
  assert.equal(reciprocalRank(['a', 'b'], ['a']), 1);
  assert.equal(reciprocalRank(['x', 'a'], ['a']), 0.5);
  assert.equal(reciprocalRank(['x', 'y', 'a'], ['a']), 1 / 3);
  assert.equal(reciprocalRank(['x'], ['a']), 0);
});

test('nDCG membedakan urutan yang recall abaikan', async () => {
  const { ndcgAtK, recallAtK } = await load();
  const atas = ['a', 'x', 'y', 'z'];
  const bawah = ['x', 'y', 'z', 'a'];
  // recall@4 sama untuk keduanya — dan itulah kenapa nDCG perlu ada:
  // pada anggaran konteks 6 potongan, jawaban di posisi 8 sama saja dengan
  // tak ditemukan, dan hanya nDCG yang menangkap bedanya.
  assert.equal(recallAtK(atas, ['a'], 4), recallAtK(bawah, ['a'], 4));
  assert.ok(ndcgAtK(atas, ['a'], 4) > ndcgAtK(bawah, ['a'], 4));
  assert.equal(ndcgAtK(['a'], ['a'], 4), 1);
  assert.equal(ndcgAtK([], [], 4), 1);
});

test('rata-rata MAKRO — pertanyaan berjawab-lebar tak menenggelamkan yang lain', async () => {
  const { agregat, skorSatu } = await load();
  const sempurna = skorSatu(['a'], ['a'], 5);
  const gagal = skorSatu(['x'], ['b', 'c', 'd', 'e'], 5);
  const a = agregat([sempurna, gagal]);
  assert.equal(a.n, 2);
  // Makro: (1 + 0) / 2. Mikro akan memberi 1/5 karena penyebutnya jumlah
  // seluruh jawaban benar — dan satu pertanyaan berjawab-lebar akan
  // mendominasi sembilan pertanyaan berjawab-tunggal.
  assert.equal(a.recall, 0.5);
  assert.equal(a.gagalTotal, 1);
});

test('regresi: penurunan di bawah toleransi TIDAK berbunyi', async () => {
  const { bandingkan, TOLERANSI, agregat, skorSatu } = await load();
  const dasar = agregat([skorSatu(['a', 'b'], ['a', 'b'], 5)]);
  const kini = { ...dasar, recall: dasar.recall - TOLERANSI / 2 };
  const beda = bandingkan(dasar, kini);
  // HNSW bersifat hampiran dan potongan berskor sama bisa bertukar urutan.
  // Gerbang berambang nol akan berbunyi pada derau, lalu dimatikan orang —
  // dan gerbang yang dimatikan tak menjaga apa pun.
  assert.equal(beda.filter((b) => b.turun).length, 0);
});

test('regresi: bertambahnya gagal-total berbunyi TANPA toleransi', async () => {
  const { bandingkan, agregat, skorSatu } = await load();
  const dasar = agregat([skorSatu(['a'], ['a'], 5), skorSatu(['b'], ['b'], 5)]);
  const kini = { ...dasar, gagalTotal: dasar.gagalTotal + 1 };
  const beda = bandingkan(dasar, kini);
  const g = beda.find((b) => b.metrik === 'gagalTotal')!;
  // Rata-rata bisa tetap bagus sementara satu pertanyaan berubah dari
  // terjawab jadi tak terjawab sama sekali — bentuk kerusakan yang paling
  // dirasakan pengguna, dan yang paling mudah disembunyikan rata-rata.
  assert.ok(g.turun, 'satu pertanyaan yang jatuh total tidak dilaporkan sebagai regresi');
});

test('himpunan baku menolak yang terlalu kecil atau tanpa pertanyaan kosong', async () => {
  const { validasi, GoldenError, MIN_PERTANYAAN } = await loadGolden();
  const buat = (n: number, kosong: number) => ({
    nama: 'uji',
    pertanyaan: Array.from({ length: n }, (_, i) => ({
      id: `q${i}`, q: `pertanyaan ${i}`,
      docRefs: i < kosong ? [] : ['d1'],
    })),
  });

  assert.throws(() => validasi(buat(3, 1)), GoldenError, 'himpunan cebol diterima');
  // Seluruhnya terjawab → sistem yang MENGARANG jawaban untuk apa pun akan
  // mendapat nilai sempurna. Itu kegagalan paling mahal bagi produk ini.
  assert.throws(() => validasi(buat(MIN_PERTANYAAN + 4, 0)), GoldenError,
    'himpunan tanpa pertanyaan "tak ada jawabannya" diterima');
  assert.ok(validasi(buat(MIN_PERTANYAAN + 4, 3)));
});

test('himpunan baku menolak id ganda dan docRef duplikat', async () => {
  const { validasi, GoldenError } = await loadGolden();
  const dasar = Array.from({ length: 10 }, (_, i) => ({
    id: `q${i}`, q: 'x', docRefs: i < 3 ? [] : ['d1'],
  }));

  assert.throws(() => validasi({ nama: 'u', pertanyaan: [...dasar, { ...dasar[5] }] }), GoldenError,
    'id ganda diterima — dua pertanyaan berbagi kunci jadi mustahil dibandingkan antar jalan');
  const dup = dasar.map((p, i) => i === 5 ? { ...p, docRefs: ['d1', 'd1'] } : p);
  // Duplikat menggelembungkan penyebut recall dan membuat nilai 1 mustahil
  // dicapai — bug yang tampak persis seperti sistem yang buruk.
  assert.throws(() => validasi({ nama: 'u', pertanyaan: dup }), GoldenError);
});

test('himpunan baku yang dikirim ikut repo LULUS validasinya sendiri', () => {
  // Tanpa ini, contoh yang dikirim bisa rusak diam-diam dan orang pertama
  // yang menjalankan npm run eval akan mengira harness-nya yang salah.
  const dir = 'eval/golden';
  const berkas = readdirSync(dir).filter((f) => f.endsWith('.json'));
  assert.ok(berkas.length > 0, 'tak ada himpunan baku yang dikirim');
  return import('../src/modules/eval/golden').then(({ validasi }) => {
    for (const f of berkas) {
      const h = validasi(JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')));
      assert.ok(h.pertanyaan.length > 0, `${f} kosong`);
    }
  });
});

test('doc_ref ganda dari satu dokumen dihitung SEKALI', async () => {
  const { docRefUnik } = await import('../src/modules/eval/runner');
  // Beberapa potongan dari dokumen yang sama lazim muncul berdampingan.
  // Menghitungnya sebagai beberapa hasil menghukum presisi karena sistem
  // melakukan hal yang BENAR, dan menaikkan recall tanpa satu pun dokumen
  // tambahan ditemukan.
  assert.deepEqual(docRefUnik(['a', 'a', 'b', 'a', 'c']), ['a', 'b', 'c']);
  assert.deepEqual(docRefUnik([undefined, 'a', undefined]), ['a']);
});
