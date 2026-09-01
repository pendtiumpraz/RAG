import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ??= 'postgres://x:y@localhost:5432/z';
process.env.CREDENTIALS_ENCRYPTION_KEY ??= '0'.repeat(64);

/**
 * MODEL BERNALAR TAK BOLEH MENYIARKAN ISI KEPALANYA.
 *
 * Sejak Sumopod didaftarkan sebagai server LLM (llm_servers) dan
 * MiniMax-M2.7-highspeed dijadikan model aktif, keluaran model bisa diawali
 * `<think>…</think>`. Jalur JSON tak terganggu — parser hanya memungut objek
 * blok — tapi jalur FALLBACK menampilkan keluaran mentah, jadi tepat ketika
 * model membalas prosa (saat ia paling mungkin bingung) pengguna akan membaca
 * "The user is asking in Indonesian…" alih-alih jawaban. Pada chatbot
 * pelanggan itu sekaligus membocorkan cara kerja retrieval di baliknya.
 *
 * Diuji pada keluaran NYATA yang dikembalikan MiniMax lewat Sumopod
 * (2026-08-26), bukan contoh karangan.
 */

const load = () => import('../src/modules/chat/blocks');

test('penalaran <think> dibuang dari jalur fallback', async () => {
  const { buangPenalaran } = await load();
  const nyata = '<think>\nThe user is asking in Indonesian: "sebutkan ibu kota Indonesia."\n</think>\nIbu kota Indonesia adalah Jakarta.';
  assert.equal(buangPenalaran(nyata), 'Ibu kota Indonesia adalah Jakarta.');
});

test('blok penalaran yang tak pernah ditutup ikut dibuang', async () => {
  const { buangPenalaran } = await load();
  // Model yang kehabisan anggaran token berhenti di tengah penalaran; sisa itu
  // justru yang paling tak berbentuk untuk ditampilkan.
  const terpotong = 'Jakarta.\n<think>tunggu, apakah dokumennya menyebut';
  assert.equal(buangPenalaran(terpotong), 'Jakarta.');
});

test('jawaban tanpa penalaran tak berubah sedikit pun', async () => {
  const { buangPenalaran } = await load();
  const polos = 'Kebijakan garansi berlaku 12 bulan sejak tanggal pembelian.';
  assert.equal(buangPenalaran(polos), polos);
});

test('fallback stream membuang penalaran, bukan menampilkannya', async () => {
  const { createBlockStreamParser } = await load();
  const blok: Array<{ type: string; text?: string }> = [];
  const p = createBlockStreamParser((b) => blok.push(b as { type: string; text?: string }));
  // model membalas PROSA (mengabaikan format JSON) dengan penalaran di depan
  p.push('<think>Saya perlu memeriksa dokumen');
  p.push(' garansi dulu.</think>\n\nGaransi berlaku 12 bulan.');
  const { fallback } = p.finalize();

  assert.equal(fallback, true, 'seharusnya jatuh ke fallback — model tak mengirim JSON');
  const teks = blok.map((b) => b.text ?? '').join(' ');
  assert.match(teks, /Garansi berlaku 12 bulan/);
  assert.doesNotMatch(teks, /think|memeriksa dokumen/i,
    'penalaran model bocor ke jawaban yang dilihat pengguna');
});
