-- 0031 — KATEGORI dokumen: master data per tenant + kolom pada catatan Memory
--
-- Kategori TIDAK di-hardcode. Tiap perusahaan punya taksonomi sendiri — kantor
-- hukum dan pabrik tak mungkin memakai daftar yang sama — jadi ia jadi master
-- data yang bisa disunting, dan agen Memory boleh MENGUSULKAN kategori baru
-- saat menemui dokumen yang tak masuk mana pun.
--
-- Usulan agen masuk berstatus 'proposed', bukan langsung aktif. Alasannya
-- konkret: kalau LLM bebas membuat kategori, "Kontrak" / "Perjanjian" /
-- "Dokumen Kontraktual" lahir sebagai tiga kategori berbeda untuk hal yang
-- sama, dan taksonomi yang pecah begitu tak bisa dirapikan lagi setelah
-- ribuan dokumen terlanjur memakainya. Satu klik persetujuan mencegah itu.
--
-- `slot` menentukan penanda visual (warna × bentuk) dan DISIMPAN, bukan
-- diturunkan dari urutan: kalau ia dihitung dari posisi, menghapus satu
-- kategori akan mengecat ulang semua kategori sesudahnya.
--
-- Tanpa foreign key (aturan proyek): memory_notes.category menyimpan slug.

create table if not exists document_categories (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  slug        text not null,
  label       text not null,
  slot        integer not null default 0,
  -- 'active' = dipakai & tampil di master data · 'proposed' = usulan agen
  status      text not null default 'active',
  -- Dari mana asalnya: 'seed' | 'user' | 'agent'
  origin      text not null default 'user',
  created_at  timestamp not null default now(),
  updated_at  timestamp not null default now(),
  deleted_at  timestamp
);

create index if not exists idx_document_categories_tenant
  on document_categories (tenant_id, status) where deleted_at is null;
create unique index if not exists uq_document_categories_slug
  on document_categories (tenant_id, slug) where deleted_at is null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'document_categories_status_valid') then
    alter table document_categories add constraint document_categories_status_valid
      check (status in ('active', 'proposed'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'document_categories_origin_valid') then
    alter table document_categories add constraint document_categories_origin_valid
      check (origin in ('seed', 'user', 'agent'));
  end if;
end $$;

-- RLS: master data ini milik tenant, bukan platform.
alter table document_categories enable row level security;
alter table document_categories force row level security;

drop policy if exists document_categories_tenant_isolation on document_categories;
create policy document_categories_tenant_isolation on document_categories
  for all
  using (tenant_id = app_current_tenant())
  with check (tenant_id = app_current_tenant());

grant select, insert, update, delete on document_categories to nalar_app;

-- Kolom kategori pada catatan Memory. Ditulis tahap DISTILL agen, yang sudah
-- memanggil LLM sekali per dokumen — jadi tak ada permintaan LLM tambahan dan
-- tak ada tagihan tambahan, hanya beberapa token keluaran lagi.
alter table memory_notes add column if not exists category text not null default 'lain';

create index if not exists idx_memory_notes_category
  on memory_notes (chatbot_id, category) where deleted_at is null;
