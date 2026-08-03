import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { irisBlok } from './_iris';
import {
  KANDIDAT_MAKS, pasangUlangSkala, porsiKandidat, terapkanRerank,
  type KandidatRerank,
} from '../src/modules/chat/rerank';
import { MODEL_RERANK, cariRerank } from '../src/modules/chat/rerank-penyedia';

/**
 * RERANKER LINTAS-ENCODER.
 *
 * Yang dijaga di sini bukan "urutannya jadi lebih baik" — itu tak bisa
 * dibuktikan tanpa korpus pelanggan nyata, dan kartu a-reranker sudah mencatat
 * kenapa. Yang dijaga adalah apa yang TIDAK boleh terjadi ketika ia menyala,
 * karena lapisan ini menerima data dari LUAR (penyedia pihak ketiga) dan
 * menaruhnya langsung di jalur yang menentukan jawaban apa yang dilihat orang.
 */

const kandidat = (...id: string[]): KandidatRerank[] =>
  id.map((x, i) => ({ id: x, content: `isi ${x}`, rank: 1 - i * 0.01 }));

test('kandidat yang TIDAK dinilai penyedia tetap ikut — di belakang', () => {
  /* Penyedia mengembalikan top_n saja. Membuang sisanya berarti satu jawaban
     benar bisa lenyap hanya karena daftarnya dipotong di seberang sana —
     kegagalan senyap yang mustahil ditelusuri dari sini. */
  const hasil = terapkanRerank(kandidat('a', 'b', 'c', 'd'), [{ id: 'c', skor: 9 }]);
  assert.deepEqual(hasil.map((h) => h.id), ['c', 'a', 'b', 'd']);
});

test('id KARANGAN dari penyedia diabaikan', () => {
  /* Tanpa ini, respons yang cacat — atau jahat — bisa menyuntikkan id ke dalam
     hasil pencarian. Yang datang dari luar tak pernah dipercaya apa adanya. */
  const hasil = terapkanRerank(kandidat('a', 'b'), [
    { id: 'penyusup', skor: 99 }, { id: 'b', skor: 5 },
  ]);
  assert.deepEqual(hasil.map((h) => h.id), ['b', 'a']);
  assert.ok(!hasil.some((h) => h.id === 'penyusup'));
});

test('skor yang bukan angka tidak menggeser apa pun', () => {
  const hasil = terapkanRerank(kandidat('a', 'b'), [
    { id: 'b', skor: Number.NaN }, { id: 'a', skor: Number.POSITIVE_INFINITY },
  ]);
  assert.deepEqual(hasil.map((h) => h.id), ['a', 'b'], 'NaN/Infinity ikut mengurutkan');
});

test('penyedia yang tak berguna TIDAK merusak urutan lama', () => {
  /* Balasan kosong, atau seluruhnya id asing. Hasilnya harus persis daftar
     semula — bukan daftar yang teracak. */
  assert.deepEqual(terapkanRerank(kandidat('a', 'b', 'c'), []).map((h) => h.id), ['a', 'b', 'c']);
  assert.deepEqual(
    terapkanRerank(kandidat('a', 'b', 'c'), [{ id: 'x', skor: 1 }]).map((h) => h.id),
    ['a', 'b', 'c'],
  );
});

test('skor SERI diputus urutan lama, bukan urutan kedatangan', () => {
  /* Hasil pencarian yang berubah-ubah antar permintaan untuk pertanyaan yang
     sama membuat orang berhenti memercayainya — dan tak ada cara memperbaiki
     laporan bug yang tak bisa diulang. */
  const k = kandidat('a', 'b', 'c');
  const seri = [{ id: 'c', skor: 1 }, { id: 'a', skor: 1 }, { id: 'b', skor: 1 }];
  assert.deepEqual(terapkanRerank(k, seri).map((h) => h.id), ['a', 'b', 'c']);
});

test('id ganda dari penyedia: yang pertama menang, tak ada yang tergandakan', () => {
  const hasil = terapkanRerank(kandidat('a', 'b'), [
    { id: 'b', skor: 9 }, { id: 'b', skor: -9 },
  ]);
  assert.deepEqual(hasil.map((h) => h.id), ['b', 'a']);
  assert.equal(hasil.length, 2, 'kandidat tergandakan');
});

/* ── skala nilai, yang menjaga MMR tetap berarti ──────────────────────── */

test('pasangUlangSkala mengubah URUTAN tanpa mengubah sebaran nilainya', () => {
  /* MMR menimbang relevansi lawan keragaman dengan lambda yang disetel untuk
     besaran RRF (~0,02). Memakai skor mentah penyedia (0..1) akan membesarkan
     suku relevansi puluhan kali dan membuat suku keragaman praktis hilang —
     hasilnya potongan-potongan mirip yang saling menggantikan, persis yang MMR
     ada untuk dicegah. */
  const urut = [
    { id: 'c', rank: 0.98 }, { id: 'a', rank: 1 }, { id: 'b', rank: 0.99 },
  ];
  const out = pasangUlangSkala(urut);
  assert.deepEqual(out.map((x) => x.id), ['c', 'a', 'b'], 'urutan ikut berubah');
  assert.deepEqual(out.map((x) => x.rank), [1, 0.99, 0.98], 'nilai tak menurun mengikuti urutan');
  assert.deepEqual(
    [...out.map((x) => x.rank)].sort(), [...urut.map((x) => x.rank)].sort(),
    'sebaran nilainya berubah — skala MMR ikut bergeser',
  );
});

/* ── batas biaya ──────────────────────────────────────────────────────── */

test('kandidat yang dikirim DIBATASI, berapa pun besar korpusnya', () => {
  /* Tiap kandidat adalah satu lintasan model. Tanpa batas atas, pertanyaan
     pada korpus besar diam-diam mengirim ratusan potongan dan satu permintaan
     chat berbiaya belasan kali lipat tanpa ada yang memutuskan begitu. */
  assert.ok(porsiKandidat(6) <= KANDIDAT_MAKS);
  assert.ok(porsiKandidat(1000) <= KANDIDAT_MAKS);
  assert.ok(porsiKandidat(6) >= 6, 'kandidatnya lebih sedikit dari yang akan dipakai');
});

/* ── mati secara bawaan, dan tetap begitu ─────────────────────────────── */

const SVC = readFileSync('src/modules/chat/retrieval.service.ts', 'utf8');
const SET = readFileSync('src/modules/core/db/schema.ts', 'utf8');

test('NULL = mati, dan itu bawaan kolomnya', () => {
  /* Kolom tanpa default & tanpa notNull berarti seluruh tenant yang sudah ada
     — dan setiap tenant baru — mendapat NULL. Menyalakannya untuk semua orang
     berarti memutuskan pertukaran latensi atas nama korpus yang belum pernah
     kita lihat. */
  /* Diiris sampai koma penutup DEKLARASINYA, bukan sampai batas blok
     berikutnya. Versi sebelumnya memakai irisBlok() dan ikut menyeret kolom
     apa pun yang ditulis SESUDAHNYA — begitu kolom baru dengan `.default()`
     ditambahkan tepat di bawahnya, uji ini gagal sambil melaporkan bahwa
     RERANKER-lah yang punya default. Uji yang menuduh kolom yang salah lebih
     buruk daripada uji yang diam: yang membacanya akan mengubah kolom yang
     tak bersalah. */
  const awal = SET.indexOf("activeRerankModel: text('active_rerank_model')");
  assert.ok(awal > 0, 'kolom reranker hilang dari schema.ts');
  const blok = SET.slice(awal, SET.indexOf(',', awal) + 1);
  assert.ok(!/notNull\(\)/.test(blok), 'kolom dibuat wajib — tenant lama akan menabrak');
  assert.ok(!/\.default\(/.test(blok), 'ada default — reranker menyala tanpa diminta');
});

test('reranker tak dipanggil sama sekali bila setelannya kosong', () => {
  const blok = irisBlok(SVC, 'async function mungkinRerank(');
  assert.ok(/if \(!model\) return scored;/.test(blok),
    'tak ada jalan pintas untuk "mati" — jalur mati ikut membayar');
  const iCek = blok.indexOf('if (!model) return scored;');
  const iPanggil = blok.indexOf('nilaiUlang(');
  assert.ok(iCek > 0 && iCek < iPanggil, 'penyedia dipanggil sebelum setelannya diperiksa');
});

test('kegagalan reranker TIDAK menggagalkan pencarian', () => {
  /* Lapisan yang seluruh nilainya penyempurnaan tak boleh bisa menjatuhkan
     jawaban. Tapi diamnya harus TERCATAT — lapisan yang mati diam-diam akan
     tampak seperti "kok tidak ada bedanya" selama berbulan-bulan. */
  const blok = irisBlok(SVC, 'async function mungkinRerank(');
  assert.ok(/catch \(e\)/.test(blok) && /return scored;/.test(blok.slice(blok.indexOf('catch'))),
    'kegagalan reranker menjatuhkan pencarian');
  assert.ok(/rerank\.gagal/.test(blok), 'kegagalannya tak dicatat ke mana pun');
});

test('rerank berjalan SEBELUM MMR, bukan sesudah', () => {
  /* MMR menata keragaman DI ATAS urutan yang diberikan padanya. Kalau reranker
     berjalan sesudahnya, keduanya jadi dua penataan yang saling menimpa. */
  const i = SVC.indexOf('mungkinRerank(tenantId');
  const j = SVC.indexOf('mmrSelect(');
  assert.ok(i > 0 && j > 0 && i < j, 'reranker dipanggil setelah MMR');
});

/* ── katalog ──────────────────────────────────────────────────────────── */

test('tiga jalur hosting tersedia — termasuk yang tak mengirim teks keluar', () => {
  /* Jawaban yang benar berbeda untuk SaaS (API pihak ketiga) dan on-premise
     (tak boleh ada teks dokumen yang meninggalkan jaringan). Menyediakan
     keduanya berarti keputusannya tak perlu ditebak dari sini. */
  const penyedia = new Set(MODEL_RERANK.map((m) => m.penyedia));
  assert.ok(penyedia.has('selfhosted'), 'tak ada jalur on-premise');
  assert.ok(penyedia.size >= 2, 'hanya satu jalur — pilihannya jadi tak ada');
  assert.equal(cariRerank('tidak-ada'), undefined);
  assert.equal(cariRerank(null), undefined);
  assert.equal(cariRerank(undefined), undefined);
});

test('server rerank sendiri wajib https kecuali loopback', () => {
  /* Yang melintas ke sana adalah ISI DOKUMEN tenant. Isolasi dijaga ketat
     sampai level basis data; HTTP polos ke IP publik membocorkan semuanya di
     satu titik yang tak dijaga. */
  const src = readFileSync('src/modules/chat/rerank-penyedia.ts', 'utf8');
  assert.ok(/assertPublicHttpUrl\(cfg\.baseUrl, \{ allowLoopback: true/.test(src),
    'endpoint rerank sendiri tak diperiksa — teks dokumen bisa lewat http polos');
});

test('panggilan rerank punya BATAS WAKTU', () => {
  /* Tanpa batas waktu, penyedia yang menggantung membuat setiap pertanyaan
     ikut menggantung — dan pengguna tak punya cara tahu sebabnya. */
  const src = readFileSync('src/modules/chat/rerank-penyedia.ts', 'utf8');
  assert.ok(/AbortSignal\.timeout\(TENGGAT_MS\)/.test(src), 'panggilan rerank tanpa batas waktu');
});
