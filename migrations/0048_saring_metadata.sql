-- 0048 · METADATA YANG BISA DISARING (kartu a-prefilter-metadata)
--
-- KOLOM, BUKAN JSONB. `documents.metadata` sudah ada dan menggoda, tapi
-- penyaring di atas jsonb tak bisa digabung dengan pra-penyaringan indeks
-- vektor: Postgres tak punya statistik yang bisa dipercaya untuk `->>`, dan
-- rencananya jatuh ke pemindaian penuh persis di korpus tempat penyaring ini
-- seharusnya menolong.
--
-- SEMUANYA NULLABLE, dan itu disengaja. Tak semua konektor tahu foldernya
-- (Notion & Slack tak punya hierarki), dan tak semua penanda versi upstream
-- adalah waktu (eTag Graph & ETag S3 adalah hash). Kolom yang dipaksa terisi
-- akan berisi tebakan, dan penyaring di atas tebakan membuang dokumen yang
-- sebenarnya cocok — kegagalan yang jauh lebih buruk daripada tak punya
-- penyaring sama sekali.
--
-- BARIS LAMA TETAP NULL. Tak ada backfill: `ext` bisa diturunkan dari title
-- kapan saja, tapi menulis 25 juta baris untuk kenyamanan bukan pertukaran
-- yang masuk akal. Yang di-ingest setelah ini terisi; yang lama ikut hanya
-- saat dokumennya disinkronkan ulang.

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS ext text,
  ADD COLUMN IF NOT EXISTS folder text,
  ADD COLUMN IF NOT EXISTS modified_at timestamptz;

-- Didenormalkan ke lapisan pertama juga. Tanpa ini, penyaring hanya bisa
-- bekerja SESUDAH tier-1 memilih 120 dokumennya — dan 120 dokumen yang
-- terpilih tanpa memperhatikan penyaring bisa habis tersaring semuanya,
-- sehingga jawabannya kosong padahal dokumennya ada. Sama derajatnya dengan
-- centroid: data turunan yang dibangun ulang dari `documents`.
ALTER TABLE document_vectors
  ADD COLUMN IF NOT EXISTS ext text,
  ADD COLUMN IF NOT EXISTS folder text,
  ADD COLUMN IF NOT EXISTS modified_at timestamptz;

-- Indeks penyaring. PARSIAL pada deleted_at IS NULL — seluruh jalur baca
-- selalu menyertakan syarat itu, dan indeks yang ikut memuat baris terhapus
-- membayar ruang untuk baris yang tak pernah dibaca.
CREATE INDEX IF NOT EXISTS idx_documents_ext
  ON documents (knowledge_base_id, ext) WHERE deleted_at IS NULL;

-- text_pattern_ops: penyaring folder dicocokkan sebagai PREFIKS (LIKE 'x/%').
-- Tanpa kelas operator ini, indeks b-tree biasa tak dipakai untuk LIKE pada
-- basis data ber-collation non-C, dan penyaringnya jatuh ke pemindaian penuh
-- tanpa satu pun tanda.
CREATE INDEX IF NOT EXISTS idx_documents_folder
  ON documents (knowledge_base_id, folder text_pattern_ops) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_documents_modified_at
  ON documents (knowledge_base_id, modified_at) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_document_vectors_ext
  ON document_vectors (knowledge_base_id, ext) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_document_vectors_folder
  ON document_vectors (knowledge_base_id, folder text_pattern_ops) WHERE deleted_at IS NULL;

COMMENT ON COLUMN documents.folder IS
  'Jalur folder upstream tanpa nama berkas. NULL = sumbernya tak punya hierarki (Notion/Slack) atau tak melaporkannya.';
COMMENT ON COLUMN documents.modified_at IS
  'Waktu ubah upstream. NULL bila penanda versinya bukan waktu (eTag Graph, ETag S3) — lihat waktuUbah() di saring.ts.';
