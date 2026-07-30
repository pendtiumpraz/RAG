-- 0034 — TAKSONOMI ULANG: "Lain-lain" jadi "Belum dikategorikan"
--
-- "Lain-lain" terbaca sebagai jenis dokumen yang SAH, sehingga pemilik data
-- menyangka ada kelompok berkas bernama lain-lain — padahal yang sebenarnya
-- terjadi adalah sistem belum berhasil menilai. Labelnya kini menyebut
-- keadaannya apa adanya, sekaligus memberi tahu bahwa ia bisa dibereskan.
--
-- Slug ikut berubah ('lain' → 'belum') karena slug muncul di UI sebagai kunci
-- teknis, dan kunci bernama 'lain' akan terus menyesatkan siapa pun yang
-- membacanya. Perubahan slug WAJIB dibarengi pemindahan seluruh catatan yang
-- menunjuk slug lama — kalau tidak, catatan-catatan itu jadi yatim: tak punya
-- kategori, tak berwarna di graf, dan tak bisa disaring.
--
-- Taksonomi juga diperkaya dari 8 jadi 12 kategori. Daftar yang terlalu umum
-- memaksa separuh korpus jatuh ke penampung, dan penampung yang penuh tak
-- memberi tahu apa pun. Kategori baru disisipkan oleh ensureSeeded() saat
-- halaman dibuka — ia hanya menambahkan slug yang BELUM PERNAH ada, sehingga
-- kategori yang sengaja dihapus pengguna tidak hidup lagi.

-- 1. Pindahkan catatan lebih dulu, SEBELUM slug kategorinya berubah.
update memory_notes set category = 'belum', updated_at = now()
where category = 'lain' and deleted_at is null;

-- 2. Baru ubah baris kategorinya.
--    Bila 'belum' entah bagaimana sudah ada, baris 'lain' dibuang saja
--    (soft delete) agar unique index tenant+slug tidak bentrok.
update document_categories set slug = 'belum', label = 'Belum dikategorikan', updated_at = now()
where slug = 'lain' and deleted_at is null
  and not exists (
    select 1 from document_categories x
    where x.tenant_id = document_categories.tenant_id
      and x.slug = 'belum' and x.deleted_at is null);

update document_categories set deleted_at = now(), updated_at = now()
where slug = 'lain' and deleted_at is null;

-- 3. Batas nilai kategori pada memory_notes dari migrasi 0031 sudah tak
--    berlaku sejak kategori jadi master data — dibuang bila masih ada.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'memory_notes_category_valid') then
    alter table memory_notes drop constraint memory_notes_category_valid;
  end if;
end $$;
