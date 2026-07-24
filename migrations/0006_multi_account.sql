-- Multi-akun per provider: tambah account_email + ubah unique constraint.
ALTER TABLE oauth_connections ADD COLUMN IF NOT EXISTS account_email text NOT NULL DEFAULT '';
ALTER TABLE oauth_connections ADD COLUMN IF NOT EXISTS account_label text;

-- unique lama (1 akun per provider) → diganti unique per (user, provider, akun)
DROP INDEX IF EXISTS uq_oauth_connections_user_provider;
CREATE UNIQUE INDEX IF NOT EXISTS uq_oauth_connections_user_provider_account
  ON oauth_connections (user_id, provider, account_email) WHERE deleted_at IS NULL;
