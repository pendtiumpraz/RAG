-- RLS untuk tabel usage_counters (dibuat drizzle push setelah 0001).
-- Pola sama dengan 0001_rls.sql.

ALTER TABLE usage_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_counters FORCE ROW LEVEL SECURITY;
-- Dijaga agar berkas ini aman dijalankan ULANG oleh `db:migrate`.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='usage_counters' AND policyname='tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON usage_counters
      USING (tenant_id = app_current_tenant())
      WITH CHECK (tenant_id = app_current_tenant());
  END IF;
END $$;

-- Unik per (tenant, periode) supaya increment bisa upsert.
CREATE UNIQUE INDEX IF NOT EXISTS uq_usage_counters_tenant_period
  ON usage_counters (tenant_id, period) WHERE deleted_at IS NULL;
