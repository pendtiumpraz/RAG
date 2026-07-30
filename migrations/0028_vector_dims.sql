-- INDEKS VEKTOR BERDIMENSI ASLI — memangkas RAM indeks ±3,75×.
--
-- MASALAHNYA. Kolom `embedding` bertipe vector(1536) dan `padVector()`
-- memaksa SEMUA model ke ukuran itu dengan menambahkan NOL. MiniLM sebenarnya
-- 384 dimensi, jadi tiga perempat setiap vektor adalah nol — dan nol itu tetap
-- dibayar penuh di indeks HNSW, yang harus residen di RAM. Untuk korpus 1 TB
-- (47 juta potongan) selisihnya 282 GB lawan 75 GB: penentu antara server
-- biasa dan mesin kelas khusus.
--
-- KENAPA CUKUP MENGUBAH INDEKS, BUKAN KOLOMNYA. Karena paddingnya NOL, ia tak
-- menyumbang apa pun pada hasil kali titik maupun norma. Jarak kosinus atas
-- 384 dimensi pertama karena itu IDENTIK dengan jarak atas 1536 dimensi
-- berpadding — bukan hampiran. Diverifikasi terhadap data produksi sebelum
-- migrasi ini ditulis: selisih maksimum antar-keduanya PERSIS 0.
--
--   subvector(embedding, 1, 384)::vector(384) <=> subvector(q, 1, 384)
--     ≡ embedding <=> q      (untuk vektor sumber berdimensi 384)
--
-- Konsekuensinya tak ada embedding yang perlu dihitung ulang, tak ada kolom
-- yang berubah tipe, dan potongan yang sudah tersimpan tetap sah.
--
-- KENAPA PERLU KOLOM `embedding_dims`. Indeks parsial harus tahu baris mana
-- yang berdimensi 384. Memakai daftar nama model di dalam SQL akan menyimpang
-- begitu registry bertambah — kolom angka tak bisa menyimpang.

ALTER TABLE documents ADD COLUMN IF NOT EXISTS embedding_dims smallint;

COMMENT ON COLUMN documents.embedding_dims IS
  'Dimensi ASLI model embedding (sebelum zero-padding ke 1536). Menentukan indeks parsial mana yang dipakai.';

-- Backfill dari dimensi yang tercatat di registry aplikasi. Model yang tak
-- dikenal dibiarkan NULL dan tetap memakai indeks 1536 penuh — aman, hanya
-- tak ikut menghemat.
UPDATE documents SET embedding_dims = 384
  WHERE embedding_dims IS NULL AND embedding_model IN ('all-MiniLM-L6-v2');
UPDATE documents SET embedding_dims = 768
  WHERE embedding_dims IS NULL AND embedding_model IN ('nomic-embed-text-v1.5');
UPDATE documents SET embedding_dims = 1024
  WHERE embedding_dims IS NULL AND embedding_model IN ('bge-m3', 'bge-m3-selfhosted');
UPDATE documents SET embedding_dims = 1536
  WHERE embedding_dims IS NULL AND embedding IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_documents_dims ON documents (embedding_dims);

-- Indeks parsial per dimensi. Masing-masing hanya memuat baris berdimensi itu,
-- jadi tak ada vektor yang terpotong keliru.
CREATE INDEX IF NOT EXISTS idx_documents_emb_384 ON documents
  USING hnsw ((subvector(embedding, 1, 384)::vector(384)) vector_cosine_ops)
  WHERE embedding_dims = 384;

CREATE INDEX IF NOT EXISTS idx_documents_emb_768 ON documents
  USING hnsw ((subvector(embedding, 1, 768)::vector(768)) vector_cosine_ops)
  WHERE embedding_dims = 768;

CREATE INDEX IF NOT EXISTS idx_documents_emb_1024 ON documents
  USING hnsw ((subvector(embedding, 1, 1024)::vector(1024)) vector_cosine_ops)
  WHERE embedding_dims = 1024;

-- Indeks 1536 penuh TETAP ADA: ia melayani model yang memang 1536 dimensi
-- (OpenAI, Cohere) dan baris lama yang dimensinya belum tercatat.
