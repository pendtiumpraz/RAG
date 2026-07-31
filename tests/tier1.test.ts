import { test } from 'node:test';
import assert from 'node:assert/strict';

/* Impor STATIS, bukan dinamis: kedua modul ini murni — tak menyentuh basis
   data, tak membaca env — jadi tak ada yang perlu di-stub lebih dulu. */
import {
  jarakKosinus, jarakDokumen, peringkatTarget, peringkatDatar, ringkas, kurvaAmbang,
  proyeksikan, ambangUntukRecall, rataVektor, centroidBagian,
} from '../src/modules/eval/tier1';
import { bangunKorpus, acakan, POTONGAN_PER_DOK } from '../src/modules/eval/korpus-sintetis';

/**
 * RECALL LAPISAN PERTAMA — alat ukurnya, bukan hasilnya.
 *
 * Alat ukur yang salah jauh lebih berbahaya daripada tak punya alat ukur:
 * angka recall 100% yang lahir dari bug akan menutup kartu ini secara
 * permanen dengan kesimpulan yang keliru. Yang dijaga di sini persis
 * bentuk-bentuk kegagalan yang MENAIKKAN angkanya secara palsu.
 */

const v = (...x: number[]) => Float32Array.from(x);

test('jarak kosinus sepadan dengan operator <=> pgvector', () => {
  assert.equal(jarakKosinus(v(1, 0), v(1, 0)), 0);
  assert.equal(jarakKosinus(v(1, 0), v(0, 1)), 1);
  assert.equal(jarakKosinus(v(1, 0), v(-1, 0)), 2);
  // Panjang vektor tak berpengaruh — kosinus, bukan Euclid.
  assert.ok(Math.abs(jarakKosinus(v(1, 0), v(5, 0))) < 1e-6);
  // Vektor nol tak boleh melahirkan NaN: NaN dalam perbandingan selalu false,
  // dan itu diam-diam membuat dokumen bervektor rusak selalu MENANG.
  assert.equal(jarakKosinus(v(0, 0), v(1, 0)), 1);
});

test('jarak dokumen memakai bagian TERDEKAT, bukan reratanya', () => {
  /* Ini temuan migrasi 0037. Kalau alat ukurnya memakai rerata, ia akan
     melaporkan bahwa lapisan pertama lebih buruk daripada yang sebenarnya
     dijalankan produksi — dan kesimpulannya menyesatkan ke arah sebaliknya. */
  /* Bagian-bagiannya sengaja saling meniadakan: rerata (1,0) dan (-1,0)
     adalah nol di sumbu itu, jadi dokumen yang memuat jawaban PERSIS akan
     terlihat sama sekali tak relevan bila diperingkat lewat rerata. Itulah
     dokumen tebal yang temanya kabur — kasus yang melahirkan migrasi 0037. */
  const d = { docRef: 'a', bagian: [v(1, 0), v(-1, 0), v(0, 1)] };
  assert.equal(jarakDokumen(v(1, 0), d), 0, 'bagian yang persis cocok tak dipakai');
  const rerata = v(0, 1 / 3);   // rerata ketiga bagian di atas
  assert.equal(jarakKosinus(v(1, 0), rerata), 1,
    'contoh ini kehilangan maknanya bila rerata sama dekatnya dengan min');
});

test('seri dihitung MEMBERATKAN dokumen sasaran', () => {
  /* Korpus template berisi banyak dokumen berjarak nyaris sama. Menghitung
     seri sebagai kemenangan sasaran akan melaporkan recall yang lebih baik
     daripada yang akan dilihat pengguna, karena Postgres tak menjamin
     urutan di antara nilai yang sama. */
  const docs = [
    { docRef: 'target', bagian: [v(1, 0)] },
    { docRef: 'kembar', bagian: [v(1, 0)] },
  ];
  assert.equal(peringkatTarget(v(1, 0), docs, 'target'), 2);
});

test('dokumen sasaran yang tak ada di korpus MELEMPAR, bukan diam', () => {
  /* Kalau ia diam dan mengembalikan peringkat 1, kesalahan penyusunan korpus
     akan tampak sebagai recall sempurna. */
  assert.throws(() => peringkatTarget(v(1, 0), [{ docRef: 'a', bagian: [v(1, 0)] }], 'b'),
    /tak ada di korpus/);
});

test('peringkat dihitung terhadap SELURUH korpus, bukan sampelnya', () => {
  const docs = [{ docRef: 'target', bagian: [v(1, 0)] }];
  for (let i = 0; i < 50; i++) docs.push({ docRef: `d${i}`, bagian: [v(0.99, 0.01 * (i + 1))] });
  const p = peringkatTarget(v(1, 0), docs, 'target');
  assert.equal(p, 1, 'sasaran yang persis cocok harus di urutan pertama');
  // Dan sasaran yang buruk harus benar-benar jatuh jauh, bukan dibatasi.
  const jauh = peringkatTarget(v(0.99, 0.02), docs, 'target');
  assert.ok(jauh > 1 && jauh <= docs.length, `peringkat di luar rentang: ${jauh}`);
});

test('ringkasan melaporkan yang TERBURUK, bukan hanya reratanya', () => {
  /* Rerata peringkat 3 bisa menutupi satu pertanyaan di urutan 900 — dan
     pertanyaan itulah yang akan dilaporkan pengguna sebagai "jawabannya
     mengarang". */
  const r = ringkas([1, 1, 1, 1, 900], 40);
  assert.equal(r.recall, 0.8);
  assert.equal(r.peringkatTerburuk, 900);
  assert.equal(r.p95, 900);
  assert.throws(() => ringkas([], 40), /Tak ada peringkat/);
});

test('kurva ambang konsisten dan tak menurun', () => {
  const p = [1, 3, 12, 45, 300];
  const k = kurvaAmbang(p, [1, 5, 10, 20, 40, 80, 400]);
  for (let i = 1; i < k.length; i++) {
    assert.ok(k[i].recall >= k[i - 1].recall, 'recall turun saat ambang dinaikkan — mustahil');
  }
  assert.equal(k[k.length - 1].recall, 1);
});

test('proyeksi menumbuhkan PENGGANGGU, bukan menyalin recall', () => {
  /* Proyeksi yang cuma mengembalikan recall terukur akan selalu berkata
     "aman di sejuta dokumen" — persis kesimpulan yang kartu ini ada untuk
     mencegah. */
  const p = [1, 2, 3, 5, 30];
  const kecil = proyeksikan(p, 100, 100, 40);
  const besar = proyeksikan(p, 100, 100_000, 40);
  assert.ok(besar < kecil, 'proyeksi tak memburuk saat korpus dibesarkan');
  // Peringkat 1 tetap peringkat 1 berapa pun korpusnya — tak ada pengganggu
  // yang perlu dilewati.
  assert.equal(proyeksikan([1, 1, 1], 100, 10_000_000, 40), 1);
  assert.throws(() => proyeksikan(p, 1, 1000, 40), /minimal 2/);
});

test('ambangUntukRecall membedakan "tak tercapai" dari "nol"', () => {
  /* null dan 0 harus berbeda: yang satu berarti ambangnya perlu dinaikkan,
     yang lain berarti tak ada ambang yang menolong. */
  assert.equal(ambangUntukRecall([1, 2, 3, 4], 0.95, 100), 4);
  assert.equal(ambangUntukRecall([1, 2, 3, 5000], 0.95, 100), null);
  assert.notEqual(ambangUntukRecall([1, 2, 3, 5000], 0.95, 100), 0);
});

/* ── korpus sintetis ─────────────────────────────────────────────────── */

test('korpus DETERMINISTIK dan bertambah sebagai awalan', () => {
  /* Kalau menambah dokumen menggeser isi dokumen sebelumnya, kurva
     recall-terhadap-ukuran membandingkan dua korpus berbeda dan selisihnya
     tak berarti apa pun. */
  const a = bangunKorpus(50);
  const b = bangunKorpus(200);
  assert.deepEqual(a.map((d) => d.docRef), b.slice(0, 50).map((d) => d.docRef));
  assert.equal(a[7].potongan[2].teks, b[7].potongan[2].teks);
  assert.deepEqual(bangunKorpus(30), bangunKorpus(30));
});

test('tiap pertanyaan punya SATU dokumen yang menjawabnya', () => {
  /* Recall tak bisa dihitung tanpa kunci jawaban yang tunggal. Kalau penanda
     unik sebuah bagian juga muncul di dokumen lain, "dokumen yang benar"
     kehilangan arti dan angkanya jadi omong kosong. */
  const k = bangunKorpus(400);
  const berfakta = k.flatMap((d) => d.potongan.filter((b) => b.tanya).map((b) => ({ d, b })));
  const penanda = berfakta.map(({ d, b }) => {
    const m = b.tanya!.match(/(ARB|SOP|HR|LK)-\d+/);
    return m ? { kode: m[0], docRef: d.docRef } : null;
  }).filter(Boolean) as Array<{ kode: string; docRef: string }>;
  assert.equal(penanda.length, k.length * 4, 'ada pertanyaan tanpa penanda unik');
  const pemilik = new Map<string, string>();
  for (const { kode, docRef } of penanda) {
    const lama = pemilik.get(kode);
    assert.ok(lama === undefined || lama === docRef, `kode ${kode} dipakai dua dokumen`);
    pemilik.set(kode, docRef);
  }
  // Dan penanda itu memang ADA di teksnya — pertanyaan yang menyebut kode
  // yang tak tertulis di bagiannya tak bisa dijawab siapa pun.
  for (const { d, b } of berfakta) {
    const kode = b.tanya!.match(/(ARB|SOP|HR|LK)-\d+/)![0];
    assert.ok(b.teks.includes(kode), `potongan ${d.docRef}#${b.nomor} tak memuat ${kode}`);
  }
});

test('korpus memuat KEEMPAT rumpun dalam jumlah seimbang', () => {
  const k = bangunKorpus(400);
  const hitung = new Map<string, number>();
  for (const d of k) hitung.set(d.rumpun, (hitung.get(d.rumpun) ?? 0) + 1);
  assert.equal(hitung.size, 4);
  for (const [, n] of hitung) assert.equal(n, 100);
});

test('dokumen sekeluarga memang MIRIP — kalau tidak, ujiannya terlalu mudah', () => {
  /* Kesulitan lapisan pertama lahir dari dokumen bertetangga rapat. Korpus
     yang tiap dokumennya berbeda topik akan meluluskan mekanisme apa pun,
     termasuk yang rusak. */
  const k = bangunKorpus(40);
  const kontrak = k.filter((d) => d.rumpun === 'kontrak');
  const kata = (s: string) => new Set(s.toLowerCase().match(/[a-z]+/g) ?? []);
  const a = kata(kontrak[0].potongan[5].teks), b = kata(kontrak[1].potongan[5].teks);
  const irisan = [...a].filter((w) => b.has(w)).length;
  const gabungan = new Set([...a, ...b]).size;
  assert.ok(irisan / gabungan > 0.5,
    `dokumen sekeluarga hanya berbagi ${(irisan / gabungan * 100).toFixed(0)}% kata — korpusnya terlalu mudah`);
});

test('acakan deterministik dan berada di [0,1)', () => {
  const r1 = acakan(42), r2 = acakan(42);
  for (let i = 0; i < 200; i++) {
    const x = r1();
    assert.equal(x, r2());
    assert.ok(x >= 0 && x < 1, `di luar rentang: ${x}`);
  }
});

test('kontrol datar: potongan benar di luar korpus MELEMPAR', () => {
  /* Indeks yang meleset diam-diam akan mengukur potongan lain sebagai
     "benar", dan kontrolnya berhenti mengontrol apa pun. */
  assert.throws(() => peringkatDatar(v(1, 0), [v(1, 0)], 5), /di luar korpus/);
  assert.throws(() => peringkatDatar(v(1, 0), [v(1, 0)], -1), /di luar korpus/);
});

test('kontrol datar memakai aturan seri yang SAMA dengan tier-1', () => {
  /* Kalau kedua ukuran memakai aturan seri berbeda, selisih di antara
     keduanya — yang justru dipakai menyimpulkan "ini salah lapisan pertama"
     — akan memuat perbedaan yang tak ada hubungannya dengan lapisan pertama. */
  const potongan = [v(1, 0), v(1, 0)];
  assert.equal(peringkatDatar(v(1, 0), potongan, 0), 2, 'seri harus memberatkan potongan benar');
  const docs = [{ docRef: 'target', bagian: [v(1, 0)] }, { docRef: 'k', bagian: [v(1, 0)] }];
  assert.equal(peringkatTarget(v(1, 0), docs, 'target'), 2);
});

/* ── perata-rataan centroid: langkah yang menentukan ──────────────────── */

test('dokumen punya BANYAK potongan per bagian — kalau tidak, ukurannya tautologi', () => {
  /* Cacat yang ini pernah nyata dan lolos sekali.
     Dokumen berisi empat potongan memberi SATU potongan per bagian, sehingga
     centroid bagian sama dengan vektor potongannya. Perata-rataan — satu-
     satunya langkah yang benar-benar bisa merusak lapisan pertama — lalu tak
     pernah terjadi, dan hasilnya jadi kebenaran aritmetika, bukan pengukuran:
     potongan yang masuk N teratas datar mustahil punya lebih dari N-1 dokumen
     pesaing, jadi lapisan pertama SELALU dilaporkan tanpa cacat. */
  assert.ok(POTONGAN_PER_DOK > 50,
    `dokumen hanya ${POTONGAN_PER_DOK} potongan — tak ada bagian yang benar-benar dirata-ratakan`);
  const d = bangunKorpus(4)[0];
  assert.equal(d.potongan.length, POTONGAN_PER_DOK);
  const berfakta = d.potongan.filter((b) => b.tanya);
  assert.equal(berfakta.length, 4, 'jumlah potongan berfakta berubah');
  assert.ok(d.potongan.filter((b) => !b.tanya).length > 40,
    'terlalu sedikit potongan pengisi — sinyal jawaban tak akan terencerkan');
  // Nomor potongan harus berurutan 0..n-1: `metadata.chunk / 50` di SQL
  // mengandalkan itu untuk membentuk bagian.
  d.potongan.forEach((b, i) => assert.equal(b.nomor, i));
});

test('potongan berfakta TERSEBAR ke lebih dari satu bagian', () => {
  /* Kalau keempatnya jatuh di bagian yang sama, satu bagian penuh berisi
     jawaban dan bagian lain kosong — bentuk yang tak pernah muncul di
     dokumen sungguhan, dan yang membuat min() antar bagian tak diuji. */
  const d = bangunKorpus(4)[0];
  const bagianFakta = new Set(d.potongan.filter((b) => b.tanya).map((b) => Math.floor(b.nomor / 50)));
  assert.ok(bagianFakta.size >= 2, 'seluruh potongan berfakta jatuh di satu bagian');
});

test('rata-rata vektor menolak masukan yang tak seragam, bukan mengarang hasil', () => {
  assert.deepEqual(Array.from(rataVektor([v(1, 0), v(0, 1)])), [0.5, 0.5]);
  assert.throws(() => rataVektor([]), /Tak ada vektor/);
  assert.throws(() => rataVektor([v(1, 0), v(1, 0, 0)]), /tak seragam/);
});

test('centroidBagian mengelompokkan per N, dan sisa terakhir tetap dihitung', () => {
  /* Sisa yang dibuang berarti potongan terakhir tiap dokumen tak pernah
     terjangkau lapisan pertama — dan di dokumen 60 potongan itu sepuluh
     potongan terakhir yang hilang diam-diam. */
  const potongan = Array.from({ length: 7 }, (_, i) => v(i, 0));
  const c = centroidBagian(potongan, 3);
  assert.equal(c.length, 3, 'sisa potongan terakhir tidak membentuk bagian');
  assert.equal(c[0][0], 1);            // rata-rata 0,1,2
  assert.equal(c[2][0], 6);            // sisa: hanya potongan ke-6
  assert.throws(() => centroidBagian(potongan, 0), /minimal 1/);
});

test('perata-rataan MEMANG mengencerkan sinyal — kalau tidak, tak ada yang diukur', () => {
  /* Kontrol atas kontrolnya: bila centroid 50 potongan tetap sedekat
     potongan aslinya, maka lapisan pertama memang tak mungkin rugi dan
     seluruh pengukuran ini tak perlu ada. Uji ini memastikan pengencerannya
     nyata di aritmetikanya. */
  const jawab = v(1, 0);
  const pengisi = Array.from({ length: 49 }, () => v(0, 1));
  const centroid = rataVektor([jawab, ...pengisi]);
  const jRingkas = jarakKosinus(jawab, centroid);
  assert.ok(jRingkas > 0.9,
    `centroid masih berjarak ${jRingkas.toFixed(3)} dari potongan jawabannya — pengenceran tak terjadi`);
  assert.equal(jarakKosinus(jawab, jawab), 0);
});

test('TIER1_DOCS produksi sejalan dengan yang diukur', async () => {
  /* Konstanta ini pernah 40, dan pengukuran menunjukkan 40 menjatuhkan 8,2%
     jawaban yang seharusnya terambil. Kalau seseorang menurunkannya kembali
     tanpa mengukur ulang, kerugian itu kembali tanpa satu pun tes gagal —
     karena tak ada tes yang bisa "gagal" akibat jawaban yang hilang diam-diam.
     Uji ini menahan penurunan yang tak disertai ukuran baru. */
  const { readFileSync } = await import('node:fs');
  const src = readFileSync('src/modules/chat/retrieval.service.ts', 'utf8');
  const m = src.match(/const TIER1_DOCS = (\d+);/);
  assert.ok(m, 'TIER1_DOCS tak ditemukan — bentuk berkasnya berubah');
  assert.ok(Number(m![1]) >= 95,
    `TIER1_DOCS = ${m![1]}, di bawah 95 yang diukur perlu untuk recall 95% pada 400 dokumen`);
  // Dan alasannya harus ikut tertulis: angka tanpa sebab akan dipangkas
  // orang berikutnya yang mengiranya asal pilih.
  assert.ok(/eval:tier1/.test(src), 'TIER1_DOCS tak menyebut ukuran yang mendasarinya');
});
