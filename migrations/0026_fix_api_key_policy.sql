-- PERBAIKAN: policy tenant pada api_keys/webhooks memakai cast mentah.
--
-- 0025 menulis `current_setting('app.current_tenant', true)::uuid` alih-alih
-- helper `app_current_tenant()` dari 0001. Bedanya menentukan:
--
--   app_current_tenant() = NULLIF(current_setting(...), '')::uuid
--
-- Tanpa NULLIF, query di LUAR konteks tenant tidak mengembalikan nol baris
-- melainkan MELEMPAR `invalid input syntax for type uuid: ""`. Dan autentikasi
-- API key justru harus berjalan sebelum tenant diketahui — jadi setiap
-- permintaan ber-API key akan gagal dengan galat database, bukan 401.
--
-- Tertangkap saat verifikasi terhadap database nyata sebelum rilis.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['api_keys', 'webhooks'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', t || '_tenant', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING (tenant_id = app_current_tenant()) '
      || 'WITH CHECK (tenant_id = app_current_tenant());',
      t || '_tenant', t);
  END LOOP;
END $$;
