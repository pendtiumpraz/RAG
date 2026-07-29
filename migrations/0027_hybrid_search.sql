-- HYBRID SEARCH: kaki leksikal untuk melengkapi pencarian vektor.
--
-- Vektor menilai MAKNA dan lemah pada token literal: "RAB 2020" vs "RAB 2021"
-- nyaris identik secara embedding, padahal pembedanya justru angka itu.
-- Full-text search Postgres menilai KEMUNCULAN TOKEN dan kuat persis di situ.
-- Digabung, masing-masing menutup titik buta yang lain.
--
-- KENAPA KONFIGURASI 'simple', BUKAN 'indonesian' (yang tersedia di Neon):
--   1. Tugas kaki leksikal justru pencocokan token PERSIS — kode dokumen,
--      tahun, nomor, nama diri. Stemming mengikis kemampuan itu, padahal
--      itulah satu-satunya alasan kaki ini ada.
--   2. Dokumen pelanggan bercampur Indonesia–Inggris. Stemmer satu bahasa yang
--      dikenakan pada bahasa lain merusak lebih banyak daripada menolong.
--   3. 'simple' ada di SEMUA build Postgres. Konfigurasi bahasa bisa absen di
--      image on-premise, dan indeks yang gagal dibuat berarti sync gagal.
-- Kebutuhan pencocokan makna ("klaim" ↔ "pengklaiman") memang tak dijawab
-- 'simple' — itu memang tugas kaki vektor.

-- Kolom TERGENERASI: tak ada jalur tulis yang bisa lupa memperbaruinya.
-- to_tsvector(regconfig, text) bersifat IMMUTABLE (berbeda dari bentuk satu
-- argumen), jadi sah dipakai di generated column.
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS fts tsvector
  GENERATED ALWAYS AS (
    to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(content, ''))
  ) STORED;

-- GIN: indeks pilihan untuk pencarian tsvector.
CREATE INDEX IF NOT EXISTS idx_documents_fts ON documents USING gin (fts);

COMMENT ON COLUMN documents.fts IS
  'Vektor full-text (judul + isi, konfigurasi simple) — kaki leksikal hybrid search.';
