-- Server embedding sendiri (VPS) — tabel PLATFORM, bukan per-tenant.
--
-- Sengaja TANPA tenant_id dan TANPA RLS: server embedding adalah infrastruktur
-- bersama (seperti model host), bukan data tenant. Kendali aksesnya di layer
-- aplikasi — semua rute yang menyentuhnya wajib requireRole('superadmin').
-- Token disimpan terenkripsi AES-256-GCM.
CREATE TABLE IF NOT EXISTS embedding_servers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  base_url        text NOT NULL,
  encrypted_token text,
  enabled         boolean NOT NULL DEFAULT true,
  models          jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_checked_at timestamp,
  last_error      text,
  created_at      timestamp NOT NULL DEFAULT now(),
  updated_at      timestamp NOT NULL DEFAULT now(),
  deleted_at      timestamp
);

CREATE INDEX IF NOT EXISTS idx_embedding_servers_enabled    ON embedding_servers (enabled);
CREATE INDEX IF NOT EXISTS idx_embedding_servers_deleted_at ON embedding_servers (deleted_at);

-- Satu server per base_url (yang hidup) — mencegah entri kembar tak sengaja.
CREATE UNIQUE INDEX IF NOT EXISTS uq_embedding_servers_base_url
  ON embedding_servers (base_url) WHERE deleted_at IS NULL;

-- Role aplikasi butuh DML eksplisit: tabel ini dibuat oleh owner lewat migrasi,
-- jadi jangan bergantung pada ALTER DEFAULT PRIVILEGES saja.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nalar_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON embedding_servers TO nalar_app;
  END IF;
END $$;
