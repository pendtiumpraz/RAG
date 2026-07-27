-- Kredensial aplikasi OAuth (Google/Microsoft) pindah dari env ke database,
-- supaya bisa diubah superadmin tanpa redeploy.
--
-- Tabel PLATFORM: tanpa tenant_id, tanpa RLS — ini kredensial APLIKASI, bukan
-- data tenant. Kendali aksesnya di layer aplikasi (requireRole('superadmin')),
-- dan client_secret disimpan terenkripsi AES-256-GCM.
CREATE TABLE IF NOT EXISTS oauth_apps (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider         text NOT NULL,
  client_id        text NOT NULL,
  encrypted_secret text NOT NULL,
  ms_tenant_id     text,
  enabled          boolean NOT NULL DEFAULT true,
  created_at       timestamp NOT NULL DEFAULT now(),
  updated_at       timestamp NOT NULL DEFAULT now(),
  deleted_at       timestamp
);

CREATE INDEX IF NOT EXISTS idx_oauth_apps_provider   ON oauth_apps (provider);
CREATE INDEX IF NOT EXISTS idx_oauth_apps_deleted_at ON oauth_apps (deleted_at);

-- Satu kredensial aktif per provider — dua baris hidup untuk 'google' akan
-- membuat provider mana yang dipakai jadi tak tentu.
CREATE UNIQUE INDEX IF NOT EXISTS uq_oauth_apps_provider
  ON oauth_apps (provider) WHERE deleted_at IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nalar_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON oauth_apps TO nalar_app;
  END IF;
END $$;
