-- RLS untuk audit_logs (Guardrail L5). Pola sama dengan 0001.
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
-- Dijaga agar berkas ini aman dijalankan ULANG oleh `db:migrate`.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='audit_logs' AND policyname='tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON audit_logs
      USING (tenant_id = app_current_tenant())
      WITH CHECK (tenant_id = app_current_tenant());
  END IF;
END $$;
