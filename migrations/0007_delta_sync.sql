-- Delta / incremental sync: lacak identitas + versi file upstream per chunk.
-- Tanpa ini setiap sync meng-ingest ULANG semua file → duplikat chunk di KB
-- dan biaya embedding dibayar berulang.
ALTER TABLE documents ADD COLUMN IF NOT EXISTS external_id text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS external_version text;

-- Manifest lookup saat sync: "file apa saja dari source ini, versi berapa".
CREATE INDEX IF NOT EXISTS idx_documents_external
  ON documents (source_id, external_id);
