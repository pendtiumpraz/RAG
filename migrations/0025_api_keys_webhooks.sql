-- AKSES PROGRAMATIK: API key per tenant + webhook keluar.
--
-- Sampai sekarang satu-satunya cara memanggil Nalar dari luar adalah cookie
-- sesi browser — artinya sistem pelanggan tak bisa berintegrasi sama sekali.
-- Dua tabel ini menutup lubang itu dari dua arah: masuk (API key) dan keluar
-- (webhook).

/* ── kunci API ─────────────────────────────────────────────────────────
   Yang disimpan HANYA sha256 dari kunci penuh. Kunci mentahnya ditampilkan
   sekali saat dibuat lalu tak bisa dilihat lagi — bocornya database tidak
   dengan sendirinya menyerahkan akses ke API. `prefix` disimpan terpisah
   supaya UI tetap bisa membedakan kunci tanpa menyimpan nilai yang berguna
   bagi penyerang.                                                        */
CREATE TABLE IF NOT EXISTS api_keys (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL,
  name         text NOT NULL,
  prefix       text NOT NULL,              -- 'nk_live_a1b2c3d4' (utk tampilan)
  key_hash     text NOT NULL,              -- sha256(kunci penuh), hex
  scopes       jsonb NOT NULL DEFAULT '["read"]'::jsonb,
  created_by   uuid,
  last_used_at timestamp,
  expires_at   timestamp,
  revoked_at   timestamp,
  created_at   timestamp NOT NULL DEFAULT now(),
  updated_at   timestamp NOT NULL DEFAULT now(),
  deleted_at   timestamp
);
CREATE INDEX IF NOT EXISTS idx_api_keys_tenant     ON api_keys (tenant_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_deleted_at ON api_keys (deleted_at);
-- Pencarian saat autentikasi memakai hash-nya; unik sekaligus indeks.
CREATE UNIQUE INDEX IF NOT EXISTS uq_api_keys_hash
  ON api_keys (key_hash) WHERE deleted_at IS NULL;

/* ── webhook keluar ────────────────────────────────────────────────────
   `encrypted_secret` AES-256-GCM (core/crypto). Penerima memverifikasi
   HMAC-SHA256 atas body mentah — tanpa itu siapa pun yang tahu URL-nya bisa
   mengirim kejadian palsu.                                               */
CREATE TABLE IF NOT EXISTS webhooks (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL,
  url              text NOT NULL,
  encrypted_secret text NOT NULL,
  events           jsonb NOT NULL DEFAULT '[]'::jsonb,
  enabled          boolean NOT NULL DEFAULT true,
  -- Jejak pengiriman TERAKHIR. Tabel log pengiriman sengaja belum dibuat:
  -- yang dibutuhkan saat webhook bermasalah adalah "gagal kenapa, kapan",
  -- dan itu muat di sini tanpa tabel yang tumbuh tanpa batas.
  last_status      integer,
  last_attempt_at  timestamp,
  last_error       text,
  fail_count       integer NOT NULL DEFAULT 0,
  created_at       timestamp NOT NULL DEFAULT now(),
  updated_at       timestamp NOT NULL DEFAULT now(),
  deleted_at       timestamp
);
CREATE INDEX IF NOT EXISTS idx_webhooks_tenant     ON webhooks (tenant_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_deleted_at ON webhooks (deleted_at);

/* ── RLS ───────────────────────────────────────────────────────────────
   Sama seperti seluruh tabel ber-tenant: FORCE, dan policy tenant biasa.  */
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['api_keys', 'webhooks'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = t || '_tenant') THEN
      -- app_current_tenant() (0001) — BUKAN current_setting(...)::uuid mentah.
      -- Helper itu ber-NULLIF: tanpa dia, query di luar konteks tenant MELEMPAR
      -- "invalid input syntax for type uuid" alih-alih mengembalikan nol baris,
      -- dan autentikasi API key (yang memang berjalan sebelum tenant diketahui)
      -- akan gagal total.
      EXECUTE format(
        'CREATE POLICY %I ON %I USING (tenant_id = app_current_tenant()) '
        || 'WITH CHECK (tenant_id = app_current_tenant());',
        t || '_tenant', t);
    END IF;
  END LOOP;
END $$;

/* ── celah pencarian kunci ─────────────────────────────────────────────
   Autentikasi API key harus menemukan barisnya SEBELUM tenant-nya diketahui —
   persis masalah widget embed (0013) dan login by-email (0002). Tanpa policy
   ini query mengembalikan NOL BARIS tanpa galat, dan SETIAP permintaan ber-API
   key akan dijawab 401 secara diam-diam.

   Dibuka HANYA di apikeyService.resolve(), yang mencari dengan key_hash persis
   dan hanya mengembalikan kolom routing. UPDATE ikut dibuka karena stempel
   `last_used_at` ditulis pada transaksi yang sama.                        */
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='api_keys' AND policyname='api_keys_auth_lookup'
  ) THEN
    CREATE POLICY api_keys_auth_lookup ON api_keys
      FOR SELECT USING (current_setting('app.api_context', true) = 'api_key');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='api_keys' AND policyname='api_keys_auth_touch'
  ) THEN
    CREATE POLICY api_keys_auth_touch ON api_keys
      FOR UPDATE USING (current_setting('app.api_context', true) = 'api_key');
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nalar_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON api_keys TO nalar_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON webhooks TO nalar_app;
  END IF;
END $$;
