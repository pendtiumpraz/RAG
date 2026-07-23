-- RLS untuk audit_logs (Guardrail L5). Pola sama dengan 0001.
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON audit_logs
  USING (tenant_id = app_current_tenant())
  WITH CHECK (tenant_id = app_current_tenant());
