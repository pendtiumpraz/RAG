-- 0038 — AUTENTIKASI DUA FAKTOR (TOTP)
--
-- Akun superadmin memegang kredensial SELURUH tenant: kunci API tiap
-- penyedia, token OAuth tiap pengguna, dan jalan masuk ke setiap knowledge
-- base. Satu kata sandi bukan perlindungan yang sepadan untuk itu.
--
-- SELURUH KOLOM BOLEH NULL, dan itu menentukan: 2FA menyala per AKUN, bukan
-- per sistem. Memaksakannya serentak akan mengunci setiap pengguna yang
-- sedang login pada saat migrasi berjalan — termasuk orang yang menjalankan
-- migrasinya. Yang belum mendaftarkan perangkatnya tetap masuk seperti biasa
-- sampai ia sendiri menyalakannya.

-- Rahasia TOTP, TERENKRIPSI (AES-256-GCM, core/crypto) — bukan teks polos.
-- Rahasia TOTP setara kata sandi kedua: siapa pun yang membacanya bisa
-- membuat kode yang sah selamanya, dan tanpa jejak apa pun di log.
alter table users add column if not exists totp_secret text;

-- NULL = pendaftaran belum SELESAI. Rahasia yang sudah dibuat tapi belum
-- dikonfirmasi dengan satu kode yang benar TIDAK boleh menjaga apa pun:
-- kalau ia langsung berlaku, orang yang salah memindai QR akan terkunci
-- dari akunnya sendiri tanpa pernah punya kode yang cocok.
alter table users add column if not exists totp_enabled_at timestamp;

-- Langkah waktu terakhir yang sudah dipakai. Tanpa ini satu kode berlaku
-- 90 detik penuh dan bisa dipakai berkali-kali — penyerang yang sempat
-- melihat layar korban punya jendela penuh untuk mengulanginya.
alter table users add column if not exists totp_last_step bigint;

-- Kode cadangan, disimpan sebagai HASH scrypt — sama seperti kata sandi.
-- Kehilangan ponsel adalah kejadian biasa, bukan luar biasa; 2FA tanpa jalan
-- pulih hanya memindahkan risiko dari "akun dibobol" ke "akun hilang
-- selamanya", dan yang kedua jauh lebih sering terjadi.
alter table users add column if not exists totp_backup_codes jsonb;

-- Menjawab "siapa saja yang sudah memasang 2FA" tanpa memindai seluruh tabel.
-- Parsial: baris yang belum menyalakannya tak perlu menempati indeks.
create index if not exists idx_users_totp_enabled
  on users (tenant_id) where totp_enabled_at is not null and deleted_at is null;
