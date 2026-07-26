-- Enable pgvector, then lock down every tenant-scoped table with RLS.
-- Run AFTER drizzle has created the tables (db:push / db:migrate).

CREATE EXTENSION IF NOT EXISTS vector;

-- Helper: current tenant from the per-transaction GUC set by withTenant().
-- Returns NULL when unset (e.g. superadmin maintenance connection).
CREATE OR REPLACE FUNCTION app_current_tenant() RETURNS uuid AS $$
  SELECT NULLIF(current_setting('app.current_tenant', true), '')::uuid;
$$ LANGUAGE sql STABLE;

-- Apply the same policy to every table that has a tenant_id column.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users','tenant_settings','provider_credentials','chatbots',
    'data_sources','documents','conversations','messages',
    'memory_notes','memory_edges'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
    -- Dijaga agar migrasi bisa dijalankan ULANG: `db:migrate` menerapkan semua
    -- berkas setiap kali, dan CREATE POLICY polos akan menggagalkannya
    -- ("policy already exists") sejak berkas pertama.
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = 'tenant_isolation'
    ) THEN
      EXECUTE format($f$
        CREATE POLICY tenant_isolation ON %I
        USING (tenant_id = app_current_tenant())
        WITH CHECK (tenant_id = app_current_tenant());
      $f$, t);
    END IF;
  END LOOP;
END $$;

-- tenant_settings uses tenant_id as PK, not a column named the same way
-- everywhere; the loop above still works because the column is tenant_id.
