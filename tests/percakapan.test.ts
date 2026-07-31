import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  MAKS_HURUF, MIN_HURUF, MIN_PERCAKAPAN, adalahKesenjangan, kelompokkan,
  layakDihitung, normalisasiPertanyaan, slugPertanyaan, susunCatatan,
  type BarisPertanyaan,
} from '../src/modules/memory/percakapan';

/**
 * MEMORY BELAJAR DARI PERCAKAPAN.
 *
 * Dua kelas kegagalan yang tak menimbulkan galat apa pun: biaya yang tumbuh
 * diam-diam sebanding lalu lintas, dan teks pengunjung yang bocor ke jawaban
 * pengunjung lain. Yang kedua baru ketahuan dari luar, oleh orang yang tak
 * seharusnya membacanya.
 */

const SVC = readFileSync('src/modules/memory/percakapan.service.ts', 'utf8');
const AGENT = readFileSync('src/modules/memory/memory-agent.service.ts', 'utf8');

const baris = (conversationId: string, content: string,
  terjawab = true, sumber: string[] = []): BarisPertanyaan =>
  ({ conversationId, content, terjawab, sumber });

/* ── penghematan biaya ───────────────────────────────────────────────── */

test('tak ada satu pun panggilan LLM di jalur ini', () => {
  /* Menjalankan model pada tiap percakapan membuat biayanya tumbuh sebanding
     lalu lintas — dan chatbot yang PALING ramai, yaitu pelanggan paling
     berharga, yang paling mahal. Mengenali pertanyaan berulang cukup dengan
     menghitung. */
  for (const dilarang of [/completeChat/, /streamChat/, /embed\(/, /getLlmModel/]) {
    assert.ok(!dilarang.test(SVC), `jalur percakapan memanggil model: ${dilarang}`);
  }
});

test('tahap percakapan menumpang run yang sudah ada, bukan job baru', () => {
  assert.ok(/percakapanMemory\.jalankan\(tenantId, chatbotId\)/.test(AGENT),
    'tahap percakapan tak dipasang di pipeline');
  assert.ok(!/registerJobHandler\('memory\.percakapan/.test(AGENT),
    'tahap ini membuat job sendiri — menambah jadwal yang harus dijaga tanpa alasan');
});

test('kegagalan tahap ini tak menjatuhkan pipeline', () => {
  /* Dokumen sudah terlanjur diringkas lewat panggilan LLM berbayar; membuang
     hasil itu karena satu tahap tambahan gagal jauh lebih mahal daripada
     kehilangan tahapnya. */
  const blok = AGENT.slice(AGENT.indexOf('L1b'), AGENT.indexOf('L5 · SELF-EVOLVING'));
  assert.ok(/try \{/.test(blok) && /catch \(err\)/.test(blok), 'tahap percakapan tak dipagari try');
});

/* ── penjagaan kebocoran ─────────────────────────────────────────────── */

test('catatan SELALU pending — tak pernah langsung dipakai menjawab', () => {
  /* Catatan berstatus `active` ikut terambil kaki Memory saat chatbot
     menjawab, sementara isi catatan ini berasal dari teks yang diketik
     pengunjung publik. Menulisnya active berarti pertanyaan satu pengunjung
     bisa muncul di jawaban untuk pengunjung lain. */
  assert.ok(/status: 'pending'/.test(SVC), 'catatan tak ditulis pending');
  assert.ok(!/status: 'active'/.test(SVC), 'ada jalur yang menulis catatan active');
  // Dan tak boleh bergantung pada pengaturan tinjauan tenant — pengaturan itu
  // MATI secara default, jadi menggantungkan padanya sama saja dengan active.
  assert.ok(!/memoryReview/.test(SVC), 'status bergantung pengaturan tinjauan tenant');
});

test('pertanyaan terlalu panjang DIBUANG — itu tempelan dokumen, bukan pertanyaan', () => {
  /* Teks panjang paling mungkin memuat data pribadi yang ditempel pengunjung,
     dan mengelompokkannya tak berguna karena tak akan pernah berulang. */
  assert.equal(layakDihitung('x'.repeat(MAKS_HURUF + 1)), false);
  assert.equal(layakDihitung('halo'), false, 'pertanyaan sangat pendek ikut terhitung');
  assert.equal(layakDihitung('berapa lama garansi produk ini'), true);
  assert.ok(MIN_HURUF > 0 && MAKS_HURUF > MIN_HURUF);
});

/* ── pengelompokan ───────────────────────────────────────────────────── */

test('bentuk yang sama dikelompokkan, yang berbeda maksud TIDAK', () => {
  assert.equal(normalisasiPertanyaan('Berapa lama garansinya?'), 'berapa lama garansinya');
  assert.equal(normalisasiPertanyaan('  BERAPA   lama, garansinya!! '), 'berapa lama garansinya');
  assert.notEqual(normalisasiPertanyaan('berapa lama garansinya'),
    normalisasiPertanyaan('berapa lama pengirimannya'));
});

test('dihitung per PERCAKAPAN, bukan per pesan', () => {
  /* Satu pengunjung yang menanyakan hal sama lima kali dalam satu sesi bukan
     sinyal — ia justru tanda jawabannya tak memuaskan. Menghitung per pesan
     akan mengangkat kejengkelan satu orang jadi "pertanyaan populer". */
  const spam = Array.from({ length: 9 }, () => baris('c1', 'berapa lama garansi produk'));
  assert.deepEqual(kelompokkan(spam), [], 'satu percakapan diangkat jadi pertanyaan berulang');

  const nyata = ['c1', 'c2', 'c3'].map((c) => baris(c, 'berapa lama garansi produk'));
  const hasil = kelompokkan(nyata);
  assert.equal(hasil.length, 1);
  assert.equal(hasil[0].percakapan, 3);
});

test('ambang MIN_PERCAKAPAN dihormati', () => {
  const kurang = Array.from({ length: MIN_PERCAKAPAN - 1 }, (_, i) =>
    baris(`c${i}`, 'apakah bisa dikirim ke luar kota'));
  assert.deepEqual(kelompokkan(kurang), []);
  const cukup = Array.from({ length: MIN_PERCAKAPAN }, (_, i) =>
    baris(`c${i}`, 'apakah bisa dikirim ke luar kota'));
  assert.equal(kelompokkan(cukup).length, 1);
});

test('yang paling sering ditanya berada di urutan pertama', () => {
  const rows = [
    ...['a1', 'a2', 'a3'].map((c) => baris(c, 'berapa lama garansi produk')),
    ...['b1', 'b2', 'b3', 'b4', 'b5'].map((c) => baris(c, 'apakah bisa dikirim ke luar kota')),
  ];
  const k = kelompokkan(rows);
  assert.equal(k[0].contoh, 'apakah bisa dikirim ke luar kota');
  assert.ok(k[0].percakapan > k[1].percakapan);
});

test('kesenjangan dikenali dari BAGIAN yang terjawab, bukan dari ada-tidaknya', () => {
  /* Satu jawaban bersitasi di antara sepuluh percakapan bukan berarti
     pertanyaannya terjawab — itu justru pola kesenjangan yang paling
     menyesatkan kalau diukur dengan "pernah terjawab". */
  const sebagian = [
    baris('c1', 'apakah ada cabang di surabaya', true, ['Daftar Cabang']),
    ...['c2', 'c3', 'c4'].map((c) => baris(c, 'apakah ada cabang di surabaya', false)),
  ];
  const k = kelompokkan(sebagian)[0];
  assert.equal(k.percakapan, 4);
  assert.equal(k.terjawab, 1);
  assert.equal(adalahKesenjangan(k), true);

  const terjawab = ['c1', 'c2', 'c3'].map((c) =>
    baris(c, 'apakah ada cabang di surabaya', true, ['Daftar Cabang']));
  assert.equal(adalahKesenjangan(kelompokkan(terjawab)[0]), false);
});

/* ── isi catatan ─────────────────────────────────────────────────────── */

test('catatan kesenjangan TIDAK mengarang jawaban', () => {
  /* Catatan yang mengarang jawaban atas pertanyaan yang justru TIDAK
     terjawab korpus adalah kebalikan persis dari guna seluruh sistem ini —
     dan ia akan tampak paling meyakinkan justru di tempat yang paling salah. */
  const k = kelompokkan([...['c1', 'c2', 'c3'].map((c) =>
    baris(c, 'apakah ada cabang di surabaya', false))])[0];
  const c = susunCatatan(k);
  assert.ok(/KESENJANGAN/.test(c.contentMd), 'catatan tak menandai dirinya kesenjangan');
  assert.ok(/tidak dikarang/.test(c.contentMd));
  assert.ok(/kesenjangan: ya/.test(c.contentMd), 'frontmatter tak menandai kesenjangan');
});

test('catatan terjawab menunjuk dokumen sumbernya sebagai wikilink', () => {
  const k = kelompokkan(['c1', 'c2', 'c3'].map((c) =>
    baris(c, 'berapa lama garansi produk', true, ['Kebijakan Garansi'])))[0];
  const c = susunCatatan(k);
  assert.ok(c.contentMd.includes('[[Kebijakan Garansi]]'), 'dokumen sumber tak ditautkan');
  assert.ok(/kesenjangan: tidak/.test(c.contentMd));
});

test('judul catatan dipotong, slug stabil dan tak pernah kosong', () => {
  const panjang = 'apakah produk ini bisa dikirim ke seluruh wilayah indonesia termasuk daerah terpencil';
  const k = kelompokkan(['c1', 'c2', 'c3'].map((c) => baris(c, panjang)))[0];
  const c = susunCatatan(k);
  assert.ok(c.title.length <= 70, `judul terlalu panjang: ${c.title.length}`);
  assert.ok(c.title.endsWith('…'), 'judul dipotong tanpa penanda');
  assert.ok(c.slug.startsWith('tanya-'), 'slug tak berawalan tanya-');
  assert.ok(c.slug.length <= 70);
  // Slug harus sama bila dijalankan lagi — kalau tidak, tiap run melahirkan
  // catatan baru alih-alih memperbarui yang lama.
  assert.equal(susunCatatan(k).slug, c.slug);
  assert.equal(slugPertanyaan(''), 'tanpa-judul');
});

/* ── kueri ───────────────────────────────────────────────────────────── */

test('terjawab diukur dari jawaban BERIKUTNYA, bukan dari seluruh percakapan', () => {
  /* Memakai "ada sitasi di percakapan ini" akan menandai pertanyaan yang tak
     terjawab sebagai terjawab hanya karena pertanyaan LAIN di sesi yang sama
     berhasil — dan kesenjangan justru paling sering muncul di sesi yang
     sebagian besarnya berhasil. */
  assert.ok(/left join lateral/.test(SVC), 'jawaban tak diambil per pertanyaan');
  assert.ok(/m\.created_at > u\.created_at/.test(SVC), 'jawaban tak dibatasi setelah pertanyaannya');
  assert.ok(/order by m\.created_at asc/.test(SVC), 'jawaban yang diambil bukan yang pertama');
  assert.ok(/limit 1/.test(SVC));
});

test('akses data lewat withTenant, dan hasilnya dibatasi', () => {
  assert.ok(/withTenant\(tenantId/.test(SVC), 'kueri di luar konteks tenant');
  assert.ok(!/\bdb\.select|\bdb\.execute/.test(SVC), 'ada akses DB langsung');
  // Antrean tinjauan yang panjang tak akan pernah ditinjau siapa pun.
  assert.ok(/MAKS_CATATAN/.test(SVC), 'jumlah catatan per run tak dibatasi');
  assert.ok(/const HARI = \d+/.test(SVC), 'jendela waktu tak dibatasi');
});
