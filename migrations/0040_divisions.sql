-- 0040 — DIVISI: pembatasan chatbot di dalam satu tenant
--
-- Sampai sekarang "divisi" hanya hidup sebagai PROSA di chatbots.context
-- ("Chatbot divisi HR, menjawab kebijakan karyawan") — tulisan yang membentuk
-- watak jawaban tapi tidak menjaga apa pun. Setiap anggota tenant bisa
-- membuka setiap chatbot, termasuk chatbot HR yang menjawab pertanyaan gaji.
--
-- KEPUTUSAN PEMILIK PRODUK (31 Jul 2026), dan bentuk tabel ini mengikutinya:
--   • Satu orang = SATU divisi. Karena itu division_id adalah kolom di users,
--     bukan tabel penghubung. Tabel penghubung akan lebih "fleksibel", tapi
--     fleksibilitas yang tak diminta adalah kompleksitas yang harus dijaga
--     selamanya — dan keanggotaan ganda mengubah arti "admin divisi" jadi
--     pertanyaan yang belum ada jawabannya.
--   • Admin tenant melihat SEMUA divisi. Pembatasan hanya berlaku bagi member.
--
-- KENAPA SEMUA KOLOMNYA BOLEH NULL, dan ini bukan kemalasan. Migrasi yang
-- menempatkan chatbot & pengguna yang sudah ada ke sebuah "divisi bawaan"
-- akan MENCABUT akses yang mereka punya hari ini — dan mencabutnya diam-diam,
-- pada saat migrasi berjalan, tanpa satu pun galat. NULL karena itu berarti
-- "tak dibatasi": chatbot tanpa divisi terlihat oleh semua orang, persis
-- seperti sebelum migrasi ini. Divisi menjadi sesuatu yang DITAMBAHKAN
-- dengan sengaja, bukan sesuatu yang mendadak berlaku.

create table if not exists divisions (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,          -- tanpa FK (Rule #2)
  name        text not null,
  description text,
  created_at  timestamp not null default now(),
  updated_at  timestamp not null default now(),
  deleted_at  timestamp
);

create index if not exists idx_divisions_tenant
  on divisions (tenant_id) where deleted_at is null;

-- Nama divisi unik per tenant, TANPA memandang besar-kecil huruf. "Keuangan"
-- dan "keuangan" sebagai dua divisi berbeda adalah cara paling mudah membuat
-- setengah orang tak melihat chatbot yang seharusnya mereka lihat, dan
-- sebabnya nyaris mustahil terlihat di layar.
create unique index if not exists uq_divisions_tenant_name
  on divisions (tenant_id, lower(name)) where deleted_at is null;

-- NULL = pengguna belum ditempatkan. Ia melihat chatbot yang tak berdivisi
-- saja — bukan tak melihat apa pun, dan bukan melihat semuanya.
alter table users add column if not exists division_id uuid;

-- NULL = chatbot tak dibatasi (perilaku sebelum migrasi ini).
alter table chatbots add column if not exists division_id uuid;

-- Kedua indeks ini melayani penyaringan daftar chatbot, yang berjalan pada
-- setiap pemuatan halaman. Parsial: baris tanpa divisi tak perlu diindeks —
-- ia lolos lewat cabang "IS NULL", bukan lewat pencocokan.
create index if not exists idx_users_division
  on users (division_id) where division_id is not null and deleted_at is null;
create index if not exists idx_chatbots_division
  on chatbots (division_id) where division_id is not null and deleted_at is null;

alter table divisions enable row level security;
alter table divisions force row level security;

drop policy if exists divisions_tenant_isolation on divisions;
create policy divisions_tenant_isolation on divisions
  for all
  using (tenant_id = app_current_tenant())
  with check (tenant_id = app_current_tenant());

grant select, insert, update, delete on divisions to nalar_app;
