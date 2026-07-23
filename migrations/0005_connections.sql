-- RLS untuk oauth_connections. Pola sama dengan 0001.
ALTER TABLE oauth_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_connections FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON oauth_connections
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());

-- Satu koneksi aktif per (user, provider).
CREATE UNIQUE INDEX IF NOT EXISTS uq_oauth_connections_user_provider
  ON oauth_connections (user_id, provider) WHERE deleted_at IS NULL;
