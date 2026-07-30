-- 0032 — PERSETUJUAN catatan Memory + tautan pasti catatan ↔ dokumen
--
-- (1) status catatan
-- Pemilik data ingin memutuskan ringkasan mana yang boleh masuk graf dan
-- dipakai menjawab. Tapi mode tinjau TIDAK boleh jadi default: catatan itu
-- satu per DOKUMEN, jadi korpus ribuan berkas berarti ribuan persetujuan —
-- dan sampai semuanya disetujui, kaki Memory tak menyumbang apa pun.
-- Bandingkan dengan kategori (migrasi 0031) yang jumlahnya belasan: di sana
-- tinjau-dulu murah, di sini ia bisa mematikan fiturnya sendiri.
-- Karena itu: default 'active', mode tinjau dinyalakan per tenant.
--
-- (2) doc_ref
-- Tautan catatan ke dokumennya selama ini hanya lewat kecocokan slug judul.
-- Itu rapuh dan tak bisa dipakai JOIN yang benar. doc_ref adalah identitas
-- dokumen logis yang sama dengan yang dipakai retrieval bertingkat dan
-- /api/v1/documents — satu definisi untuk seluruh sistem.

alter table memory_notes add column if not exists status  text not null default 'active';
alter table memory_notes add column if not exists doc_ref text;

create index if not exists idx_memory_notes_status
  on memory_notes (chatbot_id, status) where deleted_at is null;
create index if not exists idx_memory_notes_doc_ref
  on memory_notes (doc_ref) where deleted_at is null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'memory_notes_status_valid') then
    alter table memory_notes add constraint memory_notes_status_valid
      check (status in ('active', 'pending', 'rejected'));
  end if;
end $$;

-- Mode tinjau per tenant. false = catatan langsung aktif (default).
alter table tenant_settings add column if not exists memory_review boolean not null default false;

-- BACKFILL doc_ref untuk catatan yang sudah ada.
--
-- Tanpa ini, setiap pelanggan yang sudah menjalankan agen melihat kolom
-- ringkasan KOSONG sampai agen dijalankan ulang — fitur yang tampak rusak
-- padahal datanya ada, hanya tautannya yang belum.
--
-- Catatan lama dibuat dengan slug = slugify(judul dokumen), jadi tautannya
-- dipulihkan lewat slug yang sama. Ekspresi di bawah meniru slugify() di
-- memory.service.ts. Hanya menyentuh baris ber-doc_ref NULL, jadi aman
-- dijalankan berkali-kali dan tak pernah menimpa tautan yang sudah benar.
update memory_notes n
set doc_ref = d.doc_ref, updated_at = now()
from (
  select distinct on (slug_judul) slug_judul, doc_ref
  from (
    select doc_ref,
           trim(both '-' from regexp_replace(lower(title), '[^a-z0-9]+', '-', 'g')) as slug_judul
    from documents
    where deleted_at is null and title is not null
  ) x
  where slug_judul <> ''
) d
where n.doc_ref is null
  and n.deleted_at is null
  and n.slug = d.slug_judul;
