-- Sumber KB dari folder Google Drive PUBLIK (tanpa OAuth).
--
-- Drive API v3 melayani API key biasa untuk berkas yang dibagikan "Anyone
-- with the link". Itu satu-satunya jalur yang bisa menarik seluruh isi folder
-- secara rekursif TANPA scope drive.readonly yang restricted — jadi bebas dari
-- verifikasi CASA.
--
-- Kunci ini BERBEDA dari `picker_api_key`: yang itu memang dikirim ke browser
-- (dibatasi per-referrer), sedangkan yang ini dipakai server untuk membaca isi
-- folder dan karenanya disimpan TERENKRIPSI dan tak pernah keluar dari server.
ALTER TABLE oauth_apps ADD COLUMN IF NOT EXISTS encrypted_drive_api_key text;

COMMENT ON COLUMN oauth_apps.encrypted_drive_api_key IS
  'API key Drive server-side (AES-256-GCM) untuk membaca folder publik tanpa OAuth. Bukan picker_api_key.';
