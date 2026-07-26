-- Undangan anggota tim: bergabung ke tenant yang SUDAH ADA
-- (signup publik selalu membuat tenant baru — undangan tidak).
CREATE TABLE IF NOT EXISTS invitations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL,
  email            text NOT NULL,
  role             text NOT NULL DEFAULT 'member',
  token_hash       text NOT NULL,
  invited_by       uuid NOT NULL,
  expires_at       timestamp NOT NULL,
  accepted_at      timestamp,
  accepted_user_id uuid,
  created_at       timestamp NOT NULL DEFAULT now(),
  updated_at       timestamp NOT NULL DEFAULT now(),
  deleted_at       timestamp
);

CREATE INDEX IF NOT EXISTS idx_invitations_tenant_id  ON invitations (tenant_id);
CREATE INDEX IF NOT EXISTS idx_invitations_token_hash ON invitations (token_hash);
CREATE INDEX IF NOT EXISTS idx_invitations_deleted_at ON invitations (deleted_at);

-- RLS seperti tabel ber-tenant lainnya (pola 0001), dijaga agar aman
-- dijalankan ULANG oleh db:migrate.
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='invitations' AND policyname='tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON invitations
      USING (tenant_id = app_current_tenant())
      WITH CHECK (tenant_id = app_current_tenant());
  END IF;
END $$;

-- PENERIMAAN undangan terjadi SEBELUM tenant diketahui (calon anggota belum
-- punya sesi), jadi pencarian by-token harus bisa menembus RLS — persis
-- masalah yang sama dengan login by-email di 0002. Pola solusinya pun sama:
-- satu policy tambahan yang HANYA terbuka ketika transaksi menyatakan
-- konteksnya lewat GUC, dan GUC itu diset hanya di invitation.service.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='invitations' AND policyname='invitations_accept_lookup') THEN
    CREATE POLICY invitations_accept_lookup ON invitations
      FOR SELECT USING (current_setting('app.invite_context', true) = 'accept');
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nalar_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON invitations TO nalar_app;
  END IF;
END $$;
