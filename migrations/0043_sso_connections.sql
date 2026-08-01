-- 0043 — SSO ENTERPRISE (D16): identity provider milik pelanggan sendiri
--
-- Tenant menyalakan dan mengisi kredensial IdP-nya sendiri; kita tak
-- mendaftarkan aplikasi apa pun. Polanya sama dengan kunci API penyedia LLM
-- dan kunci S3 — dan bedanya menentukan: kalau kita yang mendaftarkan, tiap
-- pelanggan baru harus menunggu kita.
--
-- CLIENT SECRET TERENKRIPSI (AES-256-GCM, core/crypto), tak pernah polos.
-- Siapa pun yang membacanya bisa menukar kode otorisasi atas nama pelanggan.

create table if not exists sso_connections (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null,                    -- tanpa FK (Rule #2)
  -- 'entra' | 'google' | 'okta' | 'oidc'
  kind          text not null,
  -- Issuer OIDC yang SUDAH diturunkan (auth/sso.ts issuerDari) — disimpan
  -- jadi, bukan mentah, supaya jalur login tak pernah menurunkannya ulang
  -- dan tak pernah bisa menurunkannya berbeda.
  issuer        text not null,
  client_id     text not null,
  client_secret text not null,                    -- TERENKRIPSI
  -- Domain email yang diarahkan ke koneksi ini.
  domain        text not null,
  enabled       boolean not null default true,
  created_at    timestamp not null default now(),
  updated_at    timestamp not null default now(),
  deleted_at    timestamp
);

create index if not exists idx_sso_connections_tenant
  on sso_connections (tenant_id) where deleted_at is null;

-- ┌─ UNIK SECARA GLOBAL, BUKAN PER TENANT ─────────────────────────────┐
-- │ Dua tenant yang sama-sama mengaku memiliki "perusahaan.co.id"       │
-- │ membuat perutean tak bisa ditentukan — dan menebaknya berarti       │
-- │ mengirim karyawan satu perusahaan ke IdP perusahaan lain, yang      │
-- │ berarti menyerahkan percobaan login mereka kepada pihak ketiga.     │
-- │                                                                     │
-- │ Ditegakkan indeks, BUKAN kode aplikasi: pemeriksaan di aplikasi     │
-- │ berjalan di bawah RLS dan karena itu tak pernah bisa melihat baris  │
-- │ tenant lain — ia akan selalu mengatakan "domain ini bebas".         │
-- └─────────────────────────────────────────────────────────────────────┘
create unique index if not exists uq_sso_connections_domain
  on sso_connections (lower(domain)) where deleted_at is null and enabled;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sso_connections_kind_valid') then
    alter table sso_connections add constraint sso_connections_kind_valid
      check (kind in ('entra', 'google', 'okta', 'oidc'));
  end if;
end $$;

alter table sso_connections enable row level security;
alter table sso_connections force row level security;

drop policy if exists sso_connections_tenant_isolation on sso_connections;
create policy sso_connections_tenant_isolation on sso_connections
  for all
  using (tenant_id = app_current_tenant())
  with check (tenant_id = app_current_tenant());

-- Jalur LOGIN membaca tabel ini SEBELUM tenant diketahui — orang yang belum
-- masuk memang belum punya tenant. Sama seperti login lintas tenant
-- (users_platform_admin_*) dan resolusi widget publik, dibuka lewat GUC yang
-- hanya diset di satu tempat: sso.service.resolveByDomain(). Kebijakannya
-- HANYA select, dan hanya baris yang enabled — menulis tetap mustahil dari
-- konteks ini, dan koneksi yang dimatikan tak bisa dipakai masuk.
drop policy if exists sso_connections_login_lookup on sso_connections;
create policy sso_connections_login_lookup on sso_connections
  for select
  using (current_setting('app.sso_context', true) = 'domain_lookup'
         and deleted_at is null and enabled);

grant select, insert, update, delete on sso_connections to nalar_app;
