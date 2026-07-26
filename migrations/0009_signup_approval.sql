-- Gerbang pendaftaran: siapa pun boleh daftar, superadmin memverifikasi
-- sebelum akun bisa login.

ALTER TABLE users ADD COLUMN IF NOT EXISTS approved_at timestamp;
ALTER TABLE users ADD COLUMN IF NOT EXISTS approved_by uuid;

-- Penambahan kolom `status` + backfill DIJALANKAN SEKALI SAJA.
--
-- Kenapa dijaga begini: `db:migrate` menerapkan ULANG semua berkas migrasi.
-- Kalau backfill-nya polos, menjalankan migrasi lagi di kemudian hari akan
-- meng-'active'-kan SEMUA akun yang sedang menunggu verifikasi — persis
-- membatalkan fitur ini tanpa ada yang sadar.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'status'
  ) THEN
    ALTER TABLE users ADD COLUMN status text NOT NULL DEFAULT 'pending';
    -- Akun yang SUDAH ADA sebelum fitur ini jangan ikut terkunci.
    UPDATE users SET status = 'active', approved_at = now();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_status ON users (status);

-- Superadmin harus bisa melihat & memverifikasi user LINTAS TENANT, padahal
-- `users` FORCE RLS per tenant. Pola yang sama dengan users_auth_lookup
-- (0002): satu policy tambahan yang HANYA terbuka ketika transaksi secara
-- eksplisit menyatakan konteks admin platform:
--     set_config('app.admin_context', 'platform_admin', true)
-- GUC itu diset HANYA di user-approval.service, sesudah requireRole('superadmin').
-- Policy ber-OR, jadi query aplikasi biasa tetap terisolasi penuh.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='users' AND policyname='users_platform_admin_read') THEN
    CREATE POLICY users_platform_admin_read ON users
      FOR SELECT USING (current_setting('app.admin_context', true) = 'platform_admin');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='users' AND policyname='users_platform_admin_write') THEN
    CREATE POLICY users_platform_admin_write ON users
      FOR UPDATE USING (current_setting('app.admin_context', true) = 'platform_admin');
  END IF;
END $$;
