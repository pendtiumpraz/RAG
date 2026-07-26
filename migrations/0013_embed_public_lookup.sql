-- PERBAIKAN BUG PRODUKSI: widget embed selalu 404.
--
-- `GET/POST /api/chat/<publicKey>` harus menemukan chatbot SEBELUM tenant-nya
-- diketahui — pengunjung situs pelanggan tidak punya sesi. Tapi `chatbots`
-- FORCE RLS pada tenant_id, sehingga query tanpa `app.current_tenant`
-- mengembalikan NOL BARIS, bukan galat. Akibatnya resolveChatbotByPublicKey()
-- selalu null dan SETIAP widget membalas 404 — diam-diam, tanpa jejak error.
--
-- Persis masalah yang sama dengan login by-email (0002) dan penerimaan
-- undangan (0010), jadi solusinya pun sama: satu policy tambahan yang HANYA
-- terbuka ketika transaksi menyatakan konteksnya lewat GUC. GUC
-- `app.embed_context` diset HANYA di resolveChatbotByPublicKey(), yang mencari
-- dengan public_key persis dan hanya mengembalikan kolom routing.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='chatbots' AND policyname='chatbots_public_lookup'
  ) THEN
    CREATE POLICY chatbots_public_lookup ON chatbots
      FOR SELECT USING (current_setting('app.embed_context', true) = 'public_key');
  END IF;
END $$;

-- Pencarian by public_key adalah jalur terpanas produk ini (tiap pemuatan
-- widget). Unik sekaligus indeks.
CREATE UNIQUE INDEX IF NOT EXISTS uq_chatbots_public_key
  ON chatbots (public_key) WHERE deleted_at IS NULL;
