-- 0047 · KUANTISASI BINER SEBAGAI LAPISAN PENYARING (kartu a-quantization-rerank)
--
-- TANPA KOLOM BARU, TANPA BACKFILL. pgvector 0.8 punya `binary_quantize()`,
-- jadi bentuk biner tiap vektor bisa jadi INDEKS EKSPRESI di atas kolom yang
-- sudah ada. Kolom tersendiri akan menuntut backfill seluruh korpus, satu
-- cabang baru di jalur tulis, dan satu keadaan baru yang bisa menyimpang
-- ("kolom biner tertinggal dari embedding-nya") — tiga harga untuk sesuatu
-- yang sudah tersedia gratis sebagai ekspresi.
--
-- KENAPA HANYA PENYARING. Presisi 1 bit menggeser potongan mana yang terambil.
-- Potongan yang meleset berubah jadi karangan begitu chatbot tak berada di
-- mode kepatuhan ketat — jadi indeks ini TIDAK PERNAH menentukan urutan
-- akhir. Ia hanya mempersempit kandidat; jarak eksak yang memutuskan. Aturan
-- itu ditegakkan di kode (src/modules/chat/kuantisasi.ts) dan dijaga tes.
--
-- 32x LEBIH KECIL: 384 dimensi × 2 byte (halfvec) = 768 byte per baris, lawan
-- 384 bit = 48 byte. Pada korpus kecil ini tak berarti apa pun; ia dibangun
-- untuk pemasangan on-premise berkorpus besar, dan MATI secara bawaan sampai
-- superadmin menyalakannya.
--
-- Dimensinya mengikuti indeks halfvec yang sudah ada (0035/0037): 384, 768,
-- 1024, 1536. Menambah dimensi baru = menambah satu blok di sini DAN satu di
-- indeks halfvec — keduanya memang harus berpasangan.

-- DITULIS SATU PER SATU, bukan lewat FOREACH + format().
--
-- Versi pertama memakai perulangan, dan `npm run dr:verify` langsung
-- melaporkan ketiganya sebagai "indeks LIAR": pemeriksa hanyutan mencocokkan
-- NAMA objek dengan teks migrasi, dan nama yang lahir dari format() tak pernah
-- muncul sebagai teks. Itu persis kelas positif-palsu yang sudah pernah dibayar
-- di migrasi 0017 dan dicatat di kartu a-runbook: pemeriksa berisik lebih buruk
-- daripada tak ada, karena orang belajar mengabaikannya dan selisih sungguhan
-- bersembunyi di antara deranya.
--
-- Empat baris berulang lebih baik daripada satu perulangan yang membutakan
-- alat yang sudah dipercaya orang.

CREATE INDEX IF NOT EXISTS idx_documents_biner_384
  ON documents USING hnsw
  ((binary_quantize(subvector(embedding, 1, 384))::bit(384)) bit_hamming_ops)
  WHERE deleted_at IS NULL AND embedding_dims = 384;

CREATE INDEX IF NOT EXISTS idx_documents_biner_768
  ON documents USING hnsw
  ((binary_quantize(subvector(embedding, 1, 768))::bit(768)) bit_hamming_ops)
  WHERE deleted_at IS NULL AND embedding_dims = 768;

CREATE INDEX IF NOT EXISTS idx_documents_biner_1024
  ON documents USING hnsw
  ((binary_quantize(subvector(embedding, 1, 1024))::bit(1024)) bit_hamming_ops)
  WHERE deleted_at IS NULL AND embedding_dims = 1024;

-- 1536 tak memakai subvector — sama seperti idx_documents_embedding.
CREATE INDEX IF NOT EXISTS idx_documents_biner_1536
  ON documents USING hnsw ((binary_quantize(embedding)::bit(1536)) bit_hamming_ops)
  WHERE deleted_at IS NULL AND embedding_dims = 1536;

COMMENT ON INDEX idx_documents_biner_1536 IS
  'Lapisan PENYARING kuantisasi biner. Tak pernah menentukan urutan akhir — lihat src/modules/chat/kuantisasi.ts';

-- Saklarnya sendiri: keputusan PEMASANGAN, bukan per-tenant — yang ditukar
-- adalah waktu lawan ketepatan pada infrastruktur bersama. MATI secara bawaan.
ALTER TABLE platform_settings
  ADD COLUMN IF NOT EXISTS binary_quantize boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN platform_settings.binary_quantize IS
  'Nyalakan lapisan penyaring kuantisasi biner (hanya berlaku pada korpus besar). Bawaan mati.';
