-- 0050 — BYOB PENYIMPANAN OBJEK PER-USER (storage_connections)
--
-- "Bring-your-own-blob": pelanggan NON-superadmin menghubungkan penyimpanan
-- objeknya sendiri (AWS S3, Cloudflare R2, Google Cloud Storage, Azure Blob,
-- atau S3-compatible lain). Platform blob (BLOB_STORE_ID/BLOB_READ_WRITE_TOKEN
-- dari env) tetap menjadi bawaan superadmin dan TAK PERNAH tersimpan di sini.
--
-- Mengikuti pola oauth_connections (migrasi 0001/0005): per-tenant, per-user,
-- RLS, kredensial DIENKRIPSI. Perbedaan intinya: satunya token OAuth, yang ini
-- JSON kredensial statis yang TIDAK kedaluwarsa sendiri — karena itu wajib
-- dienkripsi AES-256-GCM dan tak pernah dikirim balik ke peramban.
--
-- Idempotent (diulang tanpa efek tambahan — aturan proyek: perubahan skema
-- produksi HANYA lewat migrasi, tak pernah db:push).

create table if not exists storage_connections (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null,
  user_id               uuid not null,
  provider              text not null,
  label                 text,
  scoping               jsonb not null default '{}'::jsonb,
  encrypted_credentials text not null,
  is_default            boolean not null default false,
  last_checked_at       timestamp,
  last_error            text,
  created_at            timestamp not null default now(),
  updated_at            timestamp not null default now(),
  deleted_at            timestamp
);

create index if not exists idx_storage_connections_scope
  on storage_connections (tenant_id, user_id);

create index if not exists idx_storage_connections_deleted_at
  on storage_connections (deleted_at);

-- Satu kredensial hidup per (user, provider, label). label null menjadi ''
-- via coalesce supaya beberapa baris 'nilai kosong' tak bisa menumpuk.
create unique index if not exists uq_storage_connections_user_provider_label
  on storage_connections (user_id, provider, coalesce(label, ''))
  where deleted_at is null;

-- RLS — pola sama dengan oauth_connections.
alter table storage_connections enable row level security;
alter table storage_connections force row level security;

do $$
begin
  if not exists (select 1 from pg_policies
                 where tablename='storage_connections' and policyname='tenant_isolation') then
    create policy tenant_isolation on storage_connections
      using (tenant_id = app_current_tenant())
      with check (tenant_id = app_current_tenant());
  end if;
end $$;
