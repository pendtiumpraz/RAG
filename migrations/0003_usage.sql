-- RLS untuk tabel usage_counters (dibuat drizzle push setelah 0001).
-- Pola sama dengan 0001_rls.sql.

ALTER TABLE usage_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_counters FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON usage_counters
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

-- Unik per (tenant, periode) supaya increment bisa upsert.
CREATE UNIQUE INDEX IF NOT EXISTS uq_usage_counters_tenant_period
  ON usage_counters (tenant_id, period) WHERE deleted_at IS NULL;
