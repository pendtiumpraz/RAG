-- Auth support: password hash + cross-tenant login lookup under RLS.
-- Run AFTER 0001_rls.sql.

-- Credential users store a scrypt hash; OAuth users keep this NULL.
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash text;

-- PROBLEM: login must find a user BY EMAIL before any tenant is known,
-- but users is FORCE RLS'd on tenant_id (policy returns nothing when
-- app.current_tenant is unset).
--
-- SOLUTION: one extra, additive policy that ONLY opens SELECT while the
-- transaction explicitly declares an auth context. The auth service sets
--   set_config('app.auth_context', 'credential_login', true)
-- inside its lookup transaction and nowhere else. Policies OR together,
-- so normal application queries remain fully tenant-isolated.
CREATE POLICY users_auth_lookup ON users
  FOR SELECT
  USING (current_setting('app.auth_context', true) = 'credential_login');
