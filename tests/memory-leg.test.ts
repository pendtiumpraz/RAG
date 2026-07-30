import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env.DATABASE_URL ??= 'postgres://x:y@localhost:5432/z';
process.env.CREDENTIALS_ENCRYPTION_KEY ??= '0'.repeat(64);

const RET = readFileSync('src/modules/chat/retrieval.service.ts', 'utf8');
const CHAT = readFileSync('src/modules/chat/chat.service.ts', 'utf8');

/* Invarian di bawah hidup di dalam string SQL dan string prompt. Menjalankan
   kodenya tanpa korpus sungguhan tak membuktikan apa pun, jadi yang diuji
   BENTUKnya — pola yang sama dengan uji korelasi subquery di conversation. */

test('Memory adalah KAKI, bukan gerbang', () => {
  // Perbedaan ini menentukan apakah dokumen bisa hilang diam-diam. Catatan
  // Memory ditulis LLM; kalau agen luput mencatat sebuah topik dan Memory
  // dijadikan penyaring, dokumennya jadi tak terjangkau sama sekali — tanpa
  // pesan galat apa pun. Sebagai kaki, ia hanya bisa MENAMBAH kandidat.
  const vec = RET.slice(RET.indexOf('vec as ('), RET.indexOf('q as ('));
  const lex = RET.slice(RET.indexOf('lex as ('), RET.indexOf('mem as ('));
  assert.ok(!/memory_notes/.test(vec), 'kaki vektor disaring lewat Memory — itu gerbang, bukan kaki');
  assert.ok(!/memory_notes/.test(lex), 'kaki leksikal disaring lewat Memory — itu gerbang, bukan kaki');
  assert.ok(RET.includes('mem as ('), 'CTE kaki Memory hilang');
});

test('ketiga kaki masuk ke penggabungan RRF', () => {
  const f = RET.slice(RET.indexOf('rrfFuse(['), RET.indexOf('const meta'));
  for (const leg of ['vec_rank', 'lex_rank', 'mem_rank']) {
    assert.ok(f.includes(leg), `kaki ${leg} tak ikut digabung`);
  }
});

test('ringkasan tak pernah boleh mendominasi konteks', () => {
  // Ringkasan itu tafsiran, bukan bunyi dokumen. Kalau ia boleh mengisi
  // seluruh konteks, pertanyaan faktual ("berapa nilai kontraknya") dijawab
  // dari parafrase LLM alih-alih angka aslinya.
  const m = RET.match(/const memCap = \(k: number\) => Math\.max\(1, Math\.floor\(k \/ (\d+)\)\)/);
  assert.ok(m, 'memCap tak ditemukan / bentuknya berubah');
  assert.ok(Number(m![1]) >= 3, 'jatah ringkasan terlalu besar — teks asli harus tetap mayoritas');
  assert.equal(Math.max(1, Math.floor(6 / Number(m![1]))), 2, 'pada k=6 jatahnya harus 2');
});

test('slot yang gugur karena jatah DIISI cadangan', () => {
  // Tanpa cadangan, ringkasan yang melebihi jatah dibuang begitu saja dan
  // konteks pulang dengan slot kosong — biaya token yang sudah dibayar
  // terbuang, dan jawaban kehilangan satu potongan yang sah.
  assert.ok(RET.includes('mmrSelect(dedupeNearDuplicates(cand), k + memCap(k), MMR_LAMBDA)'),
    'MMR tak mengambil cadangan di atas k');
  assert.ok(RET.includes('if (hasil.length >= k) break;'), 'hasil tak dipangkas kembali ke k');
});

test('ringkasan DITANDAI sebelum masuk prompt', () => {
  // Ini penjaga anti-halusinasi yang paling mudah hilang tanpa disadari:
  // tanpa penanda, model menerima parafrase LLM dengan label yang sama
  // seperti kutipan asli, dan boleh mengutipnya seolah itu bunyi dokumen.
  assert.ok(CHAT.includes('type="summary"'), 'penanda ringkasan hilang dari blok konteks');
  assert.ok(/DERIVED SUMMARIES/.test(CHAT), 'instruksi soal ringkasan hilang dari system prompt');
  assert.ok(/never take a specific figure, date, name, clause, or amount from it/i.test(CHAT),
    'larangan mengambil angka/tanggal dari ringkasan hilang');
});

test('instruksi ringkasan hanya muncul bila ada ringkasan', () => {
  // Menyuntikkan aturan tentang sesuatu yang tak ada di konteks cuma
  // menghabiskan token pada tiap pertanyaan dan mengencerkan aturan lain.
  assert.ok(CHAT.includes('adaRingkasan ? ['), 'instruksi ringkasan tak bersyarat');
});
