-- 0049 — SALURAN PERINGATAN LANGSUNG (kartu a-alert-channels)
--
-- Peringatan sudah TERBIT sejak 0043 dan disebarkan ke webhook keluar. Yang
-- tak tertutup: pelanggan yang tidak punya sistem penerima webhook — dan itu
-- mayoritasnya. Bagi mereka, sync yang gagal jam dua pagi tetap tak memberi
-- tahu siapa pun sampai ada yang kebetulan membuka halaman Knowledge.
--
-- Tiga kolom, dan masing-masing alasannya:
--
--   alert_email             Alamat tujuan. NULL = mati. Sengaja SATU alamat,
--                           bukan daftar: daftar penerima menuntut UI kelola
--                           anggota sendiri, dan alamat milis/grup sudah
--                           menyelesaikan kebutuhan yang sama tanpa itu.
--
--   encrypted_slack_url     URL incoming-webhook Slack. DIENKRIPSI karena ia
--                           kredensial penuh: siapa pun yang memegangnya bisa
--                           menulis ke kanal itu selamanya. Menyimpannya
--                           terang di kolom teks berarti satu dump basis data
--                           = akses tulis ke Slack pelanggan.
--
--   alert_min_level         'gawat' (bawaan) atau 'perhatian'. Bawaannya
--                           SENGAJA yang paling sunyi. Sistem peringatan yang
--                           berisik melatih orang mengabaikannya, dan pada hari
--                           ia berbunyi untuk hal yang benar-benar baru tak ada
--                           yang membacanya lagi — persis alasan REDAM_MS ada
--                           di core/alerts.ts.
--
-- Idempotent: dijalankan berkali-kali tanpa efek tambahan (aturan proyek —
-- perubahan skema produksi HANYA lewat migrasi, tak pernah db:push).

alter table tenant_settings
  add column if not exists alert_email          text,
  add column if not exists encrypted_slack_url  text,
  add column if not exists alert_min_level      text not null default 'gawat';

-- Nilai di luar dua tingkat yang dikenal akan membuat pembanding di
-- alert-channels.service.ts diam-diam tak pernah cocok — yaitu peringatan yang
-- berhenti terkirim tanpa satu pun galat. Dijaga di sini, bukan hanya di kode.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tenant_settings_alert_min_level_ck'
  ) then
    alter table tenant_settings
      add constraint tenant_settings_alert_min_level_ck
      check (alert_min_level in ('perhatian', 'gawat'));
  end if;
end $$;
