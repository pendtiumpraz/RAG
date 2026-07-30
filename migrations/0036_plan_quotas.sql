-- 0036 — KUOTA PLAN BISA DISETEL DARI ADMIN
--
-- Angka kuota adalah keputusan BISNIS, bukan keputusan teknis: berapa yang
-- cukup untuk membuat orang tertarik tanpa membuat mereka betah gratis
-- selamanya hanya bisa dijawab dengan mencoba, mengamati, lalu menyesuaikan.
-- Menaruhnya di kode berarti tiap penyesuaian menuntut deploy — dan
-- penyesuaian yang mahal adalah penyesuaian yang tak pernah dilakukan.
--
-- Nilai di `core/limits.ts` tetap menjadi DEFAULT. Kolom ini hanya menimpa
-- yang disebut; kunci yang tak ada memakai default. Dengan begitu menambah
-- jenis kuota baru di kode tak memerlukan pembaruan baris ini.
--
-- Plan `onprem` SENGAJA tak bisa ditimpa jadi berhingga (ditegakkan di
-- limits.ts): di sana batasnya server milik pelanggan, dan kuota buatan di
-- atas perangkat yang sudah mereka bayar hanya akan terasa mengada-ada.

alter table platform_settings
  add column if not exists plan_quotas jsonb;

comment on column platform_settings.plan_quotas is
  'Penimpa kuota per plan: { "free": { "maxChunks": 10, ... }, ... }. '
  'NULL / kunci yang hilang = pakai default di core/limits.ts.';
