-- RETRIEVAL BERTINGKAT — indeks residen berhenti tumbuh mengikuti korpus.
--
-- MASALAHNYA. Indeks HNSW datar memuat SETIAP potongan, jadi RAM tumbuh
-- linear terhadap besar korpus: 47 juta potongan = 69 GB bahkan setelah
-- optimasi dimensi. Untuk korpus yang terus bertambah, itu jalan buntu yang
-- ditunda, bukan yang diselesaikan.
--
-- GAGASANNYA. Yang perlu residen hanyalah lapisan PENYARING. Simpan satu
-- vektor per DOKUMEN (rerata vektor potongan-potongannya), indeks lapisan itu
-- saja, lalu baca potongan hanya dari dokumen yang lolos penyaringan. Untuk
-- korpus 1 TB: ±200 ribu dokumen = 0,3 GB, dan angka itu tak berubah walau
-- tiap dokumen bertambah tebal.
--
-- YANG DITUKAR, dan ini harus disebut terang: dokumen yang TERLEWAT di
-- lapisan pertama tak akan pernah dibaca di lapisan kedua. Rerata sebuah
-- dokumen 200 halaman itu kabur — ia mewakili tema umumnya, bukan kalimat
-- spesifik di dalamnya. Karena itu mode ini:
--   • mengambil kandidat dokumen JAUH lebih banyak dari yang dibutuhkan
--   • MEMPERTAHANKAN kaki leksikal di tingkat potongan, yang tak tersaring
--     lapisan pertama sama sekali — jadi pencarian kata/kode/nomor yang persis
--     tetap menjangkau seluruh korpus
--
-- Belum tervalidasi pada korpus besar. Karena itu ia OPT-IN, bukan default.

/* `doc_ref` — identitas DOKUMEN LOGIS di atas tabel potongan.
   Aturannya sama dengan yang dipakai /api/v1/documents, ditulis sebagai kolom
   tergenerasi supaya tak ada jalur tulis yang bisa lupa mengisinya. */
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS doc_ref text
  GENERATED ALWAYS AS (coalesce(external_id, title, id::text)) STORED;

CREATE INDEX IF NOT EXISTS idx_documents_doc_ref
  ON documents (knowledge_base_id, doc_ref) WHERE deleted_at IS NULL;

/* Lapisan pertama: satu baris per (knowledge base, dokumen, model). */
CREATE TABLE IF NOT EXISTS document_vectors (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  knowledge_base_id uuid NOT NULL,
  doc_ref         text NOT NULL,
  title           text,
  embedding_model text NOT NULL,
  embedding_dims  smallint,
  /* Rerata vektor seluruh potongan dokumen ini. pgvector menormalkan sendiri
     saat menghitung jarak kosinus, jadi rerata mentah sudah memadai. */
  centroid        vector(1536),
  chunks          integer NOT NULL DEFAULT 0,
  created_at      timestamp NOT NULL DEFAULT now(),
  updated_at      timestamp NOT NULL DEFAULT now(),
  deleted_at      timestamp
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_document_vectors_doc
  ON document_vectors (knowledge_base_id, doc_ref, embedding_model)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_document_vectors_tenant ON document_vectors (tenant_id);
CREATE INDEX IF NOT EXISTS idx_document_vectors_deleted_at ON document_vectors (deleted_at);

/* Indeks lapisan pertama — berdimensi asli, sama seperti 0028. INILAH
   satu-satunya indeks vektor yang perlu residen di RAM pada mode bertingkat. */
CREATE INDEX IF NOT EXISTS idx_docvec_384 ON document_vectors
  USING hnsw ((subvector(centroid, 1, 384)::vector(384)) vector_cosine_ops)
  WHERE embedding_dims = 384;
CREATE INDEX IF NOT EXISTS idx_docvec_768 ON document_vectors
  USING hnsw ((subvector(centroid, 1, 768)::vector(768)) vector_cosine_ops)
  WHERE embedding_dims = 768;
CREATE INDEX IF NOT EXISTS idx_docvec_1024 ON document_vectors
  USING hnsw ((subvector(centroid, 1, 1024)::vector(1024)) vector_cosine_ops)
  WHERE embedding_dims = 1024;
CREATE INDEX IF NOT EXISTS idx_docvec_1536 ON document_vectors
  USING hnsw (centroid vector_cosine_ops)
  WHERE embedding_dims = 1536 OR embedding_dims IS NULL;

/* RLS — sama seperti seluruh tabel ber-tenant. */
ALTER TABLE document_vectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_vectors FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='document_vectors' AND policyname='document_vectors_tenant') THEN
    CREATE POLICY document_vectors_tenant ON document_vectors
      USING (tenant_id = app_current_tenant())
      WITH CHECK (tenant_id = app_current_tenant());
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nalar_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON document_vectors TO nalar_app;
  END IF;
END $$;

/* Saklar per tenant. Default MATI: mode ini menukar sedikit ketepatan dengan
   penghematan besar, dan pertukaran itu keputusan pemilik data — bukan
   sesuatu yang pantas dinyalakan diam-diam di korpus yang sudah berjalan. */
ALTER TABLE tenant_settings
  ADD COLUMN IF NOT EXISTS tiered_retrieval boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN tenant_settings.tiered_retrieval IS
  'Mode retrieval bertingkat: saring di level dokumen dulu. Menghemat RAM indeks secara drastis, dengan risiko dokumen terlewat di lapisan pertama.';
