-- 0044 — DEMO PUBLIK DI LANDING, dengan rem yang nyata
--
-- Keputusan pemilik produk (1 Agu 2026): pengunjung boleh mencoba chatbot
-- tanpa mendaftar, karena orang perlu melihat produknya bekerja sebelum
-- membuat akun. Yang dicentang sebagai remnya: MATIKAN OTOMATIS saat kuota
-- bulanan demo habis.
--
-- Saklar itu mensyaratkan kuotanya PUNYA ANGKA — tak ada yang bisa habis
-- kalau batasnya tak pernah ditetapkan. Angkanya 1.000 pesan/bulan, dasarnya
-- bukan tebakan: PLAN_LIMITS menetapkan paket Pro 5.000 pesan/bulan, jadi
-- 1.000 kira-kira seperlimanya — cukup untuk ratusan pengunjung mencoba
-- beberapa pertanyaan, dan biayanya tetap setara satu pelanggan Pro walau
-- demonya dipakai sepanjang bulan.
--
-- NULL pada demo_chatbot_id = TIDAK ADA DEMO, dan itu keadaan awalnya.
-- Bagian demo di landing tak muncul sama sekali sampai superadmin menunjuk
-- chatbot mana yang jadi demo. Sengaja: chatbot demo berisi dokumen contoh
-- yang harus dipilih manusia, dan menebaknya berarti memajang isi knowledge
-- base pelanggan pertama yang kebetulan ditemukan query.

alter table platform_settings add column if not exists demo_chatbot_id uuid;

alter table platform_settings add column if not exists demo_limit_per_month integer;
update platform_settings set demo_limit_per_month = 1000 where demo_limit_per_month is null;
alter table platform_settings alter column demo_limit_per_month set default 1000;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'platform_settings_demo_limit_positive') then
    alter table platform_settings add constraint platform_settings_demo_limit_positive
      check (demo_limit_per_month is null or demo_limit_per_month >= 0);
  end if;
end $$;

-- Menghitung pemakaian demo bulan berjalan: percakapan chatbot demo, lalu
-- pesannya. Tanpa indeks ini, tiap permintaan demo memindai seluruh tabel
-- percakapan — dan yang paling terasa justru saat demonya ramai.
create index if not exists idx_conversations_chatbot_started
  on conversations (chatbot_id, started_at) where deleted_at is null;
