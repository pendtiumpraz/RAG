-- RLS untuk oauth_connections. Pola sama dengan 0001.
ALTER TABLE oauth_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_connections FORCE ROW LEVEL SECURITY;
-- Dijaga agar berkas ini aman dijalankan ULANG oleh `db:migrate`.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='oauth_connections' AND policyname='tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON oauth_connections
      USING (tenant_id = app_current_tenant())
      WITH CHECK (tenant_id = app_current_tenant());
  END IF;
END $$;

-- Satu koneksi aktif per (user, provider).
--
-- DIGANTIKAN 0006 (multi-akun: unik per user+provider+account_email). Saat
-- migrasi dijalankan ulang pada DB yang SUDAH punya banyak akun per provider,
-- membuat ulang index lama ini pasti gagal (duplikat) — kejadian nyata di
-- produksi 2026-07-28. Karena itu hanya dibuat bila penggantinya belum ada.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes
                 WHERE indexname = 'uq_oauth_connections_user_provider_account') THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uq_oauth_connections_user_provider
      ON oauth_connections (user_id, provider) WHERE deleted_at IS NULL;
  END IF;
END $$;
