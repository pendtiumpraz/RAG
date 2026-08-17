-- 0052 — BERKAS ORISINAL UNGGAHAN MANUAL DI BLOB/BYOB (uploaded_files)
--
-- Bos Galih: "Sing nyimpen nang blob cuma sing upload aja." Sampai migrasi
-- ini, berkas sumber unggahan manual TIDAK disimpan di mana pun — hanya teks
-- hasil ekstraksi yang diverktorkan. Sekarang berkas ORISINAL disimpan ke
-- blob/BYOB, dan tabel ini mencatat referensinya (path/url + koneksi BYOB)
-- sekaligus menjadi dasar penghitungan pemakaian blob per tenant terhadap
-- kuota paket `storageBytes`.
--
-- Drive/SharePoint TIDAK menulis ke sini — mereka sync langsung tanpa blob;
-- baris di tabel ini murni milik jalur unggahan manual.
--
-- Idempotent (bisa diulang tanpa efek tambahan — aturan proyek: perubahan
-- skema produksi HANYA lewat migrasi, tak pernah db:push).

create table if not exists uploaded_files (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid not null,
  user_id                uuid not null,
  knowledge_base_id      uuid not null,
  source_id              uuid,
  filename               text not null,
  size_bytes             bigint not null,
  provider               text not null,
  storage_connection_id  uuid,
  path                   text not null,
  url                    text,
  mime                   text,
  created_at             timestamp not null default now(),
  updated_at             timestamp not null default now(),
  deleted_at             timestamp
);

create index if not exists idx_uploaded_files_tenant
  on uploaded_files (tenant_id);

create index if not exists idx_uploaded_files_kb
  on uploaded_files (knowledge_base_id, source_id);

create index if not exists idx_uploaded_files_deleted_at
  on uploaded_files (deleted_at);

-- RLS — pola sama dengan semua tabel tenant (lihat migrasi 0001).
alter table uploaded_files enable row level security;
alter table uploaded_files force row level security;

do $$
begin
  if not exists (select 1 from pg_policies
                 where tablename='uploaded_files' and policyname='tenant_isolation') then
    create policy tenant_isolation on uploaded_files
      using (tenant_id = app_current_tenant())
      with check (tenant_id = app_current_tenant());
  end if;
end $$;
