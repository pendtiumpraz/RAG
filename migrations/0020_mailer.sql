-- D13: Sistem email — SMTP dikonfigurasi superadmin (database, bukan env),
-- verifikasi email pendaftar, dan reset password.
--
--  • platform_settings += smtp_config (host/port/secure/user/from) +
--    encrypted_smtp_password (AES — Gmail App Password dkk).
--  • users += email_verified_at. SEMUA user yang sudah ada di-backfill
--    terverifikasi — tanpa ini, menyalakan SMTP akan MENGUNCI semua akun
--    lama (termasuk milikmu) di gerbang verifikasi yang belum pernah
--    mereka lewati.
--  • auth_tokens: token verifikasi & reset (yang disimpan HASH sha256-nya,
--    seperti invitations). Tanpa RLS: dipakai dari tautan email publik
--    tanpa sesi/tenant; isinya hanya hash + user_id, sekali pakai,
--    berumur pendek.

ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS smtp_config jsonb;
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS encrypted_smtp_password text;

ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at timestamp;
UPDATE users SET email_verified_at = now() WHERE email_verified_at IS NULL;

CREATE TABLE IF NOT EXISTS auth_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL,
  kind        text NOT NULL,               -- 'verify' | 'reset'
  token_hash  text NOT NULL,               -- sha256(token) — token asli hanya di email
  expires_at  timestamp NOT NULL,
  used_at     timestamp,
  created_at  timestamp NOT NULL DEFAULT now(),
  updated_at  timestamp NOT NULL DEFAULT now(),
  deleted_at  timestamp
);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_user       ON auth_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_deleted_at ON auth_tokens (deleted_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_auth_tokens_hash
  ON auth_tokens (token_hash) WHERE deleted_at IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nalar_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON auth_tokens TO nalar_app;
  END IF;
END $$;
