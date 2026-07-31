import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env.DATABASE_URL ??= 'postgres://x:y@localhost:5432/z';
process.env.CREDENTIALS_ENCRYPTION_KEY ??= '0'.repeat(64);

/**
 * LAPISAN PERTAMA BER-BAGIAN.
 *
 * Kegagalan yang dijaga di sini SUNYI dan tak bisa dipulihkan di hilir:
 * dokumen yang terlewat di lapisan pertama TAK AKAN PERNAH dibaca di lapisan
 * kedua. Tak ada galat, tak ada tes merah — hanya jawaban yang diam-diam
 * kehilangan dokumen yang sebenarnya memuat jawabannya.
 */

const DV = readFileSync('src/modules/knowledge/document-vectors.service.ts', 'utf8');
const RS = readFileSync('src/modules/chat/retrieval.service.ts', 'utf8');
const SCHEMA = readFileSync('src/modules/core/db/schema.ts', 'utf8');
const MIG = readFileSync('migrations/0037_tier1_segments.sql', 'utf8');

test('dokumen perkantoran biasa TETAP satu baris', async () => {
  /* Inti pilihan angkanya: 50 potongan per bagian berarti dokumen ±10
     potongan menghasilkan TEPAT SATU baris — nol biaya tambahan untuk korpus
     yang tak membutuhkannya. Menurunkannya akan membuat lapisan pertama
     tumbuh mendekati tabel potongan, dan indeks yang sama besar dengan yang
     ia gantikan tak menghemat apa pun. */
  const { POTONGAN_PER_BAGIAN } = await import('../src/modules/knowledge/document-vectors.service');
  assert.ok(POTONGAN_PER_BAGIAN >= 25,
    `${POTONGAN_PER_BAGIAN} terlalu kecil — lapisan pertama akan mendekati ukuran tabel potongan`);
  // Terverifikasi pada korpus produksi: 6 dokumen (4-8 potongan) → 6 baris.
  assert.ok(Math.ceil(10 / POTONGAN_PER_BAGIAN) === 1);
});

test('ekspresi bagian SATU definisi, dipakai SELECT dan GROUP BY', () => {
  /* Postgres mencocokkan ekspresi GROUP BY dengan kolom SELECT secara
     SINTAKSIS. Versi pertama gagal (42803 "column d.metadata must appear in
     the GROUP BY clause") hanya karena yang satu dibungkus ::smallint dan
     yang lain tidak — dua ekspresi yang secara makna sama persis. */
  assert.ok(/const bagianExpr = sql`/.test(DV), 'ekspresi bagian tak punya satu definisi');
  const pakai = (DV.match(/\$\{bagianExpr\}/g) ?? []).length;
  assert.equal(pakai, 2, `bagianExpr dipakai ${pakai}x — harus tepat 2 (SELECT & GROUP BY)`);
  // Pembagi lewat sql.raw, bukan parameter: dua $N di tempat berbeda pun tak
  // dijamin dianggap ekspresi yang sama oleh planner.
  assert.ok(/sql\.raw\(String\(POTONGAN_PER_BAGIAN\)\)/.test(DV),
    'pembagi dikirim sebagai parameter — kecocokan GROUP BY jadi tak terjamin');
});

test('nomor potongan yang HILANG tak memecah pengelompokan', () => {
  /* Potongan lama yang metadata-nya tak memuat nomor menghasilkan NULL, dan
     NULL memecah pengelompokan jadi satu baris per potongan — lapisan
     pertama berubah jadi salinan tabel potongan, persis hal yang ia ada
     untuk hindari. */
  assert.ok(/coalesce\(\(d\.metadata->>'chunk'\)::int, 0\)/.test(DV),
    'nomor potongan NULL tak diberi nilai bawaan');
});

test('lapisan pertama memeringkat lewat bagian TERBAIK, bukan rerata', () => {
  /* Bedanya menentukan untuk dokumen tebal: rerata kontrak 300 halaman
     mewakili tema umumnya, sementara pertanyaan menyasar satu pasal. */
  assert.ok(/group by v\.doc_ref/.test(RS), 'lapisan pertama tak mengelompokkan per dokumen');
  assert.ok(/order by min\(\$\{jarakTier1\}\)/.test(RS),
    'peringkat tak memakai bagian terbaik (min) — dokumen tebal tetap dinilai dari reratanya');
});

test('yang DIBATASI adalah jumlah dokumen, bukan jumlah bagian', () => {
  /* Membatasi baris bagian akan membiarkan satu dokumen tebal memakan
     seluruh 40 slot lewat sepuluh bagiannya, dan sembilan dokumen lain yang
     relevan justru tersingkir — kebalikan dari tujuan perubahan ini. */
  const blok = RS.slice(RS.indexOf('const tierFilter'), RS.indexOf('const tierFilter') + 900);
  const iGroup = blok.indexOf('group by v.doc_ref');
  const iLimit = blok.indexOf('limit ${TIER1_DOCS}');
  assert.ok(iGroup > 0 && iLimit > iGroup,
    'limit diterapkan sebelum pengelompokan per dokumen');
});

test('indeks unik memuat segment — DI SKEMA DAN DI MIGRASI', () => {
  /* Tanpa segment di indeks unik, menyisipkan bagian kedua akan MENIMPA
     bagian pertama lewat ON CONFLICT: dokumen tebal justru kehilangan
     wakilnya, kebalikan dari tujuan migrasi. Dan namanya harus SAMA di
     kedua tempat — kalau berbeda, db:push membuat indeks kedua yang isinya
     sama sambil membiarkan yang lama. */
  assert.ok(/uq_document_vectors_doc/.test(MIG) && /segment/.test(MIG));
  assert.ok(/drop index if exists uq_document_vectors_doc/.test(MIG),
    'indeks unik lama tak dibuang — ia akan menahan satu baris per dokumen');
  const blok = SCHEMA.slice(SCHEMA.indexOf("uniqueIndex('uq_document_vectors_doc')"),
    SCHEMA.indexOf("uniqueIndex('uq_document_vectors_doc')") + 220);
  assert.ok(/t\.segment/.test(blok), 'schema.ts belum mencantumkan segment di indeks uniknya');
  assert.ok(/on conflict \(knowledge_base_id, doc_ref, embedding_model, segment\)/.test(DV),
    'ON CONFLICT belum memuat segment — bagian kedua akan menimpa yang pertama');
});

test('migrasi idempoten & indeks pencariannya ikut dibuat', () => {
  // Migrasi dijalankan ulang tiap kali db:migrate dipanggil.
  assert.ok(/add column if not exists segment/.test(MIG));
  assert.ok(/create unique index if not exists/.test(MIG));
  /* Lapisan pertama kini menyentuh SELURUH baris bagian dalam satu knowledge
     base untuk mencari bagian terbaik; tanpa indeks (kb, model) itu jadi
     pemindaian penuh persis pada korpus besar yang lapisan ini ada untuk
     menyelamatkannya. */
  assert.ok(/idx_document_vectors_kb_model/.test(MIG), 'indeks pencarian bagian tak dibuat');
  assert.ok(/idx_document_vectors_kb_model/.test(SCHEMA), 'indeks itu tak dideklarasikan di schema.ts');
});
