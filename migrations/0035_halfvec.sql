-- 0035 — VEKTOR PRESISI SETENGAH + berhenti memberi padding
--
-- Dua perubahan yang bersama-sama memangkas penyimpanan vektor 7,9×, dan
-- keduanya HANYA masuk akal dilakukan sekarang: mengubah tipe kolom setelah
-- jutaan potongan masuk berarti menulis ulang seluruh tabel.
--
--   1. `vector` (fp32, 4 byte/dimensi) → `halfvec` (fp16, 2 byte/dimensi)
--   2. dimensi kolom dilepas: `vector(1536)` → `halfvec` tanpa batasan,
--      sehingga baris 384 dimensi menyimpan 384, bukan dipaksa 1.536
--
-- Terukur pada basis data ini:
--   vector(1536)            6.148 byte
--   halfvec(1536)           3.076 byte
--   halfvec tanpa batasan     776 byte   ← untuk model 384 dimensi
--
-- KENAPA fp16 AMAN. Bukan asumsi — diukur terhadap data produksi: 50 posisi
-- peringkat teratas dari 5 pertanyaan, SELURUHNYA identik antara fp32 dan
-- fp16. Masuk akal, karena embedding model bahasa punya derau jauh melampaui
-- presisi fp16; yang dibuang di sini adalah digit yang tak membawa informasi.
--
-- KENAPA MELEPAS DIMENSI AMAN. `padVector()` mengisi ujung vektor dengan NOL
-- sampai 1.536. Jarak kosinus atas N dimensi pertama identik dengan jarak
-- atas 1.536 dimensi berpadding — sifat yang sudah dipakai indeks berdimensi
-- asli (migrasi 0028). Baris LAMA yang masih 1.536 dimensi tetap terbaca:
-- subvector(x, 1, 384) mengambil bagian yang sama persis, entah sisanya nol
-- atau memang tak ada.

/* ── documents ───────────────────────────────────────────────────── */

-- Indeks lama dibuang DULU: ia terikat pada tipe kolom lamanya, dan ALTER
-- TYPE akan ditolak selama masih ada yang bergantung padanya.
-- NAMA-NAMA INI DIAMBIL DARI BASIS DATA, bukan dari ingatan: migrasi 0028
-- menamainya "idx_documents_emb_384", bukan "..._dims_384". Menghapus nama
-- yang salah membuat indeks lama tetap menempel pada kolomnya, sehingga
-- ALTER TYPE ditolak — kegagalan yang memakan waktu justru karena tampak
-- sepele. Kedua ejaan didaftarkan supaya migrasi ini aman dijalankan pada
-- basis data mana pun, entah yang mana yang kebetulan ada di sana.
drop index if exists idx_documents_embedding;
drop index if exists idx_documents_emb_384;
drop index if exists idx_documents_emb_768;
drop index if exists idx_documents_emb_1024;
drop index if exists idx_documents_dims_384;
drop index if exists idx_documents_dims_768;
drop index if exists idx_documents_dims_1024;

alter table documents
  alter column embedding type halfvec using embedding::halfvec;

/* ── document_vectors (lapisan pertama retrieval bertingkat) ─────── */

drop index if exists idx_document_vectors_centroid;
drop index if exists idx_docvec_384;
drop index if exists idx_docvec_768;
drop index if exists idx_docvec_1024;
drop index if exists idx_docvec_1536;

alter table document_vectors
  alter column centroid type halfvec using centroid::halfvec;

/* ── memory_notes ────────────────────────────────────────────────── */

drop index if exists idx_memory_notes_embedding;

alter table memory_notes
  alter column embedding type halfvec using embedding::halfvec;

/* ── potong padding pada baris yang SUDAH ADA ────────────────────── */
--
-- ALTER TYPE hanya mengubah presisinya (4 → 2 byte per dimensi); jumlah
-- dimensinya tetap 1.536 karena begitulah nilai lamanya tersimpan. Baris
-- lama jadi 3.076 byte, sementara baris BARU yang tak lagi diberi padding
-- hanya 776. Selisih itu bertahan selamanya kalau tak dipotong sekarang.
--
-- Pemotongan ini TIDAK menghilangkan apa pun: yang dibuang adalah nol yang
-- ditambahkan padVector(), dan jarak kosinus atas N dimensi pertama identik
-- dengan jarak atas 1.536 dimensi berpadding. Sifat yang sama sudah dipakai
-- indeks berdimensi asli sejak migrasi 0028.
--
-- Hanya menyentuh baris yang dimensi aslinya DIKETAHUI dan lebih kecil dari
-- yang tersimpan. Baris tanpa `embedding_dims` (pra-0028) dibiarkan apa
-- adanya — menebak dimensinya jauh lebih berbahaya daripada membiarkannya
-- besar.
update documents
set embedding = subvector(embedding, 1, embedding_dims)::halfvec
where embedding is not null
  and embedding_dims is not null
  and embedding_dims < 1536;

update document_vectors
set centroid = subvector(centroid, 1, embedding_dims)::halfvec
where centroid is not null
  and embedding_dims is not null
  and embedding_dims < 1536;

/* ── indeks berdimensi asli, kini di atas halfvec ────────────────── */
--
-- Satu indeks PARSIAL per dimensi yang benar-benar dipakai. Parsial karena
-- satu tabel memuat beberapa model sekaligus; indeks penuh atas ekspresi
-- yang hanya sah untuk sebagian baris akan menolak baris lainnya.
--
-- Dibuat CONCURRENTLY? TIDAK — berkas migrasi berjalan di dalam transaksi,
-- dan CREATE INDEX CONCURRENTLY dilarang di sana. Pada tabel sekecil ini
-- penguncian sesaat tak terasa; untuk pemasangan pada korpus besar, indeks
-- dibangun terpisah setelah data masuk (lihat docs/DB-MIGRATION.md).

create index if not exists idx_documents_dims_384 on documents
  using hnsw ((subvector(embedding, 1, 384)::halfvec(384)) halfvec_cosine_ops)
  where deleted_at is null and embedding_dims = 384;

create index if not exists idx_documents_dims_768 on documents
  using hnsw ((subvector(embedding, 1, 768)::halfvec(768)) halfvec_cosine_ops)
  where deleted_at is null and embedding_dims = 768;

create index if not exists idx_documents_dims_1024 on documents
  using hnsw ((subvector(embedding, 1, 1024)::halfvec(1024)) halfvec_cosine_ops)
  where deleted_at is null and embedding_dims = 1024;

-- Model yang memang 1.536 dimensi (mis. OpenAI). Ia TETAP memakai cast
-- berdimensi, bukan kolomnya langsung: HNSW menuntut dimensi yang diketahui
-- saat indeks dibangun, sedangkan kolomnya sengaja tak berbatas agar baris
-- 384 dimensi boleh menyimpan 384 saja. Tanpa cast ini, Postgres menolak
-- dengan 42804 — "tak ada operator class untuk tipe tanpa dimensi".
create index if not exists idx_documents_embedding on documents
  using hnsw ((embedding::halfvec(1536)) halfvec_cosine_ops)
  where deleted_at is null and embedding_dims = 1536;

create index if not exists idx_document_vectors_dims_384 on document_vectors
  using hnsw ((subvector(centroid, 1, 384)::halfvec(384)) halfvec_cosine_ops)
  where deleted_at is null and embedding_dims = 384;

create index if not exists idx_document_vectors_dims_768 on document_vectors
  using hnsw ((subvector(centroid, 1, 768)::halfvec(768)) halfvec_cosine_ops)
  where deleted_at is null and embedding_dims = 768;

-- Statistik harus dihitung ulang: tipe kolomnya berubah, dan perencana kueri
-- yang bekerja dengan statistik lama bisa memilih rencana yang jauh lebih
-- lambat — gejalanya "kok jadi pelan", padahal yang kurang cuma ini.
analyze documents;
analyze document_vectors;
analyze memory_notes;
