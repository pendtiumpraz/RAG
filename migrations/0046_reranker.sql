-- 0046 · RERANKER LINTAS-ENCODER (kartu a-reranker)
--
-- Satu kolom: model reranker yang aktif untuk tenant ini. NULL = MATI, dan
-- itulah bawaannya untuk semua orang yang sudah ada maupun yang baru.
--
-- Kenapa mati secara bawaan, padahal ia meningkatkan ketepatan. Diukur 31 Jul
-- 2026 pada korpus bertemplate 200 dokumen: pertanyaan yang menyebut kode
-- dokumen sudah terjangkau kaki leksikal 100%, yang berkata-kata saja 81,3%.
-- Reranker membeli perbaikan pada sekitar 19% permintaan dengan biaya latensi
-- yang ditanggung 100% permintaan. Menyalakannya untuk semua orang berarti
-- memutuskan pertukaran itu atas nama orang yang korpusnya belum pernah kita
-- lihat.
--
-- NULL vs string kosong: sengaja NULL. Kolom teks yang "kosong berarti mati"
-- selalu berakhir dengan dua nilai yang berarti mati ('' dan NULL) dan satu
-- cabang kode yang lupa salah satunya.
--
-- Idempoten & aman dijalankan berulang — seperti seluruh migrasi di sini,
-- karena inilah SATU-SATUNYA jalur perubahan skema produksi (db:push sudah
-- tiga kali merusaknya).

ALTER TABLE tenant_settings
  ADD COLUMN IF NOT EXISTS active_rerank_model text;

COMMENT ON COLUMN tenant_settings.active_rerank_model IS
  'Model reranker lintas-encoder yang aktif. NULL = mati (bawaan). Lihat src/modules/chat/rerank-penyedia.ts';
