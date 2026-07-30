-- 0033 — REDUNDANSI: berkas kembar tak lagi di-ingest dua kali
--
-- Dua lapis, karena keduanya menangkap hal berbeda dan biayanya berbeda:
--
--   L1 NAMA + UKURAN — datang dari listing, TANPA mengunduh apa pun. Paling
--      murah: berkas yang sama disalin ke folder lain langsung dilewati
--      sebelum satu byte pun ditarik.
--
--   L2 SIDIK JARI ISI (sha256 teks hasil ekstraksi) — butuh unduhan, tapi
--      menangkap yang L1 luput: salinan yang DI-RENAME ("Kontrak (1).pdf"),
--      dan berkas sama yang disimpan dalam format berbeda. Ia juga MENOLAK
--      false positive L1: dua berkas yang kebetulan senama dan seukuran tapi
--      isinya beda tetap masuk keduanya.
--
--   L2-lah yang menghemat paling banyak: unduhan itu murah, sedangkan
--   embedding dan penyimpanan vektor-lah yang menentukan spesifikasi server.
--
-- LINGKUPNYA SATU KNOWLEDGE BASE, bukan lintas KB. Dokumen yang sama sengaja
-- boleh hidup di dua KB berbeda: D11 menjadikan KB entitas mandiri yang
-- di-assign N:M ke chatbot, jadi men-dedup lintas KB akan mencabut dokumen
-- dari KB milik chatbot divisi lain yang justru membutuhkannya — diam-diam,
-- tanpa pesan apa pun.

alter table documents add column if not exists content_hash text;
alter table documents add column if not exists size_bytes  bigint;

-- Kunci pencarian kembar. Parsial: baris tanpa hash (pra-migrasi) tak perlu
-- ikut membesarkan indeks.
create index if not exists idx_documents_content_hash
  on documents (knowledge_base_id, content_hash)
  where deleted_at is null and content_hash is not null;

create index if not exists idx_documents_name_size
  on documents (knowledge_base_id, title, size_bytes)
  where deleted_at is null and size_bytes is not null;

-- Berkas kembar DICATAT, tidak dibuang diam-diam.
--
-- Kalau sebuah berkas hilang begitu saja dari knowledge base, pemiliknya akan
-- mengira sync-nya gagal — dan tak ada cara mengetahui bedanya. Baris di sini
-- adalah jawabannya: "berkas ini sama dengan itu, karena alasan ini".
create table if not exists document_duplicates (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null,
  knowledge_base_id uuid not null,
  source_id         uuid,
  /** Identitas berkas yang DILEWATI. */
  external_id       text,
  title             text,
  size_bytes        bigint,
  content_hash      text,
  /** doc_ref dokumen yang sudah lebih dulu ada. */
  canonical_doc_ref text not null,
  /** 'name-size' (dilewati sebelum unduh) | 'content-hash' (setelah ekstraksi) */
  reason            text not null,
  created_at        timestamp not null default now(),
  updated_at        timestamp not null default now(),
  deleted_at        timestamp
);

create index if not exists idx_document_duplicates_kb
  on document_duplicates (knowledge_base_id) where deleted_at is null;
create unique index if not exists uq_document_duplicates_file
  on document_duplicates (knowledge_base_id, external_id, canonical_doc_ref)
  where deleted_at is null and external_id is not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'document_duplicates_reason_valid') then
    alter table document_duplicates add constraint document_duplicates_reason_valid
      check (reason in ('name-size', 'content-hash'));
  end if;
end $$;

alter table document_duplicates enable row level security;
alter table document_duplicates force row level security;

drop policy if exists document_duplicates_tenant_isolation on document_duplicates;
create policy document_duplicates_tenant_isolation on document_duplicates
  for all
  using (tenant_id = app_current_tenant())
  with check (tenant_id = app_current_tenant());

grant select, insert, update, delete on document_duplicates to nalar_app;
