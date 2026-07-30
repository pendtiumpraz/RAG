import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env.DATABASE_URL ??= 'postgres://x:y@localhost:5432/z';
process.env.CREDENTIALS_ENCRYPTION_KEY ??= '0'.repeat(64);

const SRC = readFileSync('src/modules/chat/retrieval.service.ts', 'utf8');

/* Invarian di bawah hidup di dalam string SQL. Menjalankan kodenya tak
   membuktikan apa pun tanpa korpus jutaan potongan, jadi yang diuji adalah
   BENTUK kuerinya — sama seperti uji korelasi subquery di conversation. */

test('kaki leksikal TIDAK ikut disaring lapisan pertama', () => {
  // Inilah jaring pengaman mode bertingkat. Centroid sebuah dokumen tebal itu
  // kabur — ia mewakili tema umum, bukan satu nomor kontrak di halaman 300.
  // Pencarian kode/nomor/nama persis harus tetap menjangkau seluruh korpus.
  // Kalau `tierFilter` sampai ikut ditempel ke CTE `lex`, dokumen yang
  // centroid-nya meleset jadi TAK BISA ditemukan sama sekali.
  const lex = SRC.slice(SRC.indexOf('lex as ('), SRC.indexOf('), ', SRC.indexOf('lex as (')));
  assert.ok(lex.length > 0, 'CTE lex tak ditemukan — uji ini perlu diperbarui');
  assert.ok(!lex.includes('tierFilter'),
    'kaki leksikal ikut disaring lapisan pertama — jaring pengaman mode bertingkat hilang');
});

test('kaki vektor MEMANG disaring lapisan pertama', () => {
  // Sisi lain dari uji di atas: kalau filternya tak terpasang di kaki vektor,
  // mode bertingkat tak menghemat apa pun dan hanya menambah satu kueri.
  const vec = SRC.slice(SRC.indexOf('vec as ('), SRC.indexOf('q as ('));
  assert.ok(vec.includes('tierFilter'), 'kaki vektor tak memakai tierFilter');
});

test('mode bertingkat menyala dari KEBERADAAN vektor dokumen, bukan dari setelan', () => {
  // Keputusan ini disengaja: menyuruh pemilik data memilih "mode retrieval"
  // berarti meminta mereka menilai sesuatu yang tak punya dasar untuk dinilai.
  // Ambangnya ditentukan ingest; retrieval cuma membaca jejaknya lewat EXISTS.
  assert.ok(SRC.includes('select exists ('), 'pengecekan EXISTS hilang');
  assert.ok(SRC.includes('document_vectors v'), 'tak membaca document_vectors');
  // Menghitung potongan pada tiap pertanyaan akan menaruh beban baru persis di
  // jalur terpanas produk — kebalikan dari tujuan fiturnya.
  const cek = SRC.slice(SRC.indexOf('const tiered ='), SRC.indexOf('const tierFilter'));
  assert.ok(!/count\(\*\)/.test(cek), 'menghitung potongan di jalur kueri panas');
});

test('ambang lapisan pertama tak diturunkan diam-diam', () => {
  const ING = readFileSync('src/modules/knowledge/knowledge.service.ts', 'utf8');
  const m = ING.match(/TIERED_MIN_CHUNKS\s*=\s*([\d_]+)/);
  assert.ok(m, 'TIERED_MIN_CHUNKS tak ditemukan');
  const n = Number(m![1].replace(/_/g, ''));
  // Di bawah ±200 ribu potongan, indeks datar tak memakan apa pun dan tak
  // punya risiko recall sama sekali; menyalakan penyaringan di sana hanya
  // menambah satu lompatan tanpa imbalan — dan menambah risiko yang tak perlu.
  assert.ok(n >= 100_000, `ambang ${n} terlalu rendah — mode bertingkat menyala di korpus kecil`);
});
