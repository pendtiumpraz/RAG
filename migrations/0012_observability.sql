-- Observability: superadmin perlu membaca audit_logs LINTAS TENANT.
--
-- Pola sama dengan users_platform_admin_read (0009): satu policy tambahan yang
-- HANYA terbuka ketika transaksi menyatakan konteks admin platform lewat GUC
-- `app.admin_context`. Policy ber-OR, jadi query aplikasi biasa tetap
-- terisolasi penuh per tenant.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='audit_logs' AND policyname='audit_logs_platform_admin_read'
  ) THEN
    CREATE POLICY audit_logs_platform_admin_read ON audit_logs
      FOR SELECT USING (current_setting('app.admin_context', true) = 'platform_admin');
  END IF;
END $$;

-- Ringkasan ops selalu difilter waktu; tanpa index ini query 24 jam terakhir
-- memindai seluruh tabel yang terus tumbuh.
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at DESC);
