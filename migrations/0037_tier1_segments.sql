-- 0037 — LAPISAN PERTAMA: beberapa vektor per dokumen, bukan satu centroid
--
-- Lapisan pertama retrieval bertingkat memakai SATU rerata vektor per
-- dokumen. Untuk dokumen tebal itu kelemahan yang harus disebut jujur:
-- rerata sebuah kontrak 300 halaman mewakili tema umumnya, BUKAN satu pasal
-- spesifik di dalamnya. Dan dokumen yang terlewat di lapisan pertama TAK
-- AKAN PERNAH dibaca di lapisan kedua — tak ada kesempatan kedua.
--
-- Risiko itu selama ini ditahan dua hal, dan keduanya tetap ada: kandidat
-- diambil 40 dokumen (jauh lebih banyak dari yang dipakai), dan kaki
-- leksikal tak ikut disaring sama sekali sehingga pencarian nomor/nama/kode
-- selalu menyapu seluruh korpus. Migrasi ini menambah penahan KETIGA:
-- dokumen tebal kini punya beberapa wakil, satu per BAGIAN.
--
-- Biayanya kecil dan terukur: satu baris per 50 potongan berarti dokumen
-- 10 potongan tetap satu baris (tak ada perubahan sama sekali untuk korpus
-- perkantoran biasa), sementara kontrak 500 potongan punya 10 wakil. Jumlah
-- baris lapisan pertama tetap jauh di bawah jumlah potongan — yang justru
-- jadi alasan lapisan ini ada.

-- 1. Kolom bagian. DEFAULT 0 supaya seluruh baris yang sudah ada tetap sah
--    dan tetap menjadi "bagian pertama" dokumennya; tak ada yang perlu
--    dibangun ulang sebelum sistem kembali benar.
alter table document_vectors
  add column if not exists segment smallint not null default 0;

-- 2. Indeks unik lama HARUS diganti: ia menahan satu baris per dokumen, dan
--    dengan itu terpasang, menyisipkan bagian kedua akan menimpa bagian
--    pertama lewat ON CONFLICT — dokumen tebal justru kehilangan wakilnya,
--    kebalikan dari tujuan migrasi ini.
drop index if exists uq_document_vectors_doc;

create unique index if not exists uq_document_vectors_doc
  on document_vectors (knowledge_base_id, doc_ref, embedding_model, segment)
  where deleted_at is null;

-- 3. Indeks pencarian per bagian. Lapisan pertama memeringkat dokumen lewat
--    bagian TERBAIKNYA, jadi kuerinya menyentuh seluruh baris bagian dalam
--    satu knowledge base — tanpa indeks ini ia jadi pemindaian penuh persis
--    pada korpus yang lapisan pertama ada untuk menyelamatkannya.
create index if not exists idx_document_vectors_kb_model
  on document_vectors (knowledge_base_id, embedding_model)
  where deleted_at is null;
