-- D12: Pembayaran QRIS multi-gateway + mode deploy dari database.
--
-- Tiga tabel:
--  • platform_settings  — SATU baris (id=1): mode deploy (saas/onprem) dan
--    harga plan. Di DATABASE, bukan env — superadmin mengubahnya dari UI.
--  • payment_gateways   — kredensial Midtrans/Tripay/Xendit (secret AES di
--    kolom terenkripsi, pola oauth_apps). Hanya SATU yang aktif.
--  • payments           — transaksi QRIS per tenant (RLS): pending → paid
--    lewat webhook ter-verifikasi signature, lalu plan tenant diaktifkan.

CREATE TABLE IF NOT EXISTS platform_settings (
  id               smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  deployment_mode  text NOT NULL DEFAULT 'saas',
  plan_prices      jsonb NOT NULL DEFAULT '{"pro": 299000, "enterprise": 1499000}'::jsonb,
  created_at       timestamp NOT NULL DEFAULT now(),
  updated_at       timestamp NOT NULL DEFAULT now(),
  deleted_at       timestamp
);
INSERT INTO platform_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS payment_gateways (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider          text NOT NULL,              -- 'midtrans' | 'tripay' | 'xendit'
  encrypted_secret  text NOT NULL,              -- JSON rahasia (AES-256-GCM)
  public_config     jsonb NOT NULL DEFAULT '{}'::jsonb, -- merchant code / client key / sandbox
  active            boolean NOT NULL DEFAULT false,     -- hanya SATU boleh true
  created_at        timestamp NOT NULL DEFAULT now(),
  updated_at        timestamp NOT NULL DEFAULT now(),
  deleted_at        timestamp
);
CREATE INDEX IF NOT EXISTS idx_payment_gateways_deleted_at ON payment_gateways (deleted_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_gateways_provider
  ON payment_gateways (provider) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS payments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  user_id       uuid NOT NULL,
  plan          text NOT NULL,                 -- 'pro' | 'enterprise'
  months        integer NOT NULL DEFAULT 1,
  amount        integer NOT NULL,              -- IDR utuh
  provider      text NOT NULL,
  provider_ref  text NOT NULL,                 -- order_id / merchant_ref / reference_id
  qr_string     text,                          -- payload QRIS (digambar di halaman kita)
  qr_image_url  text,                          -- gambar QR dari provider (bila ada)
  status        text NOT NULL DEFAULT 'pending', -- pending|paid|expired|failed
  paid_at       timestamp,
  expires_at    timestamp,
  raw_callback  jsonb,
  created_at    timestamp NOT NULL DEFAULT now(),
  updated_at    timestamp NOT NULL DEFAULT now(),
  deleted_at    timestamp
);
CREATE INDEX IF NOT EXISTS idx_payments_tenant_id  ON payments (tenant_id);
CREATE INDEX IF NOT EXISTS idx_payments_deleted_at ON payments (deleted_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_provider_ref
  ON payments (provider, provider_ref) WHERE deleted_at IS NULL;

-- RLS payments (pola 0001/0005) + jalur webhook.
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments FORCE  ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='payments' AND policyname='tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON payments
      USING (tenant_id = app_current_tenant())
      WITH CHECK (tenant_id = app_current_tenant());
  END IF;
  -- Webhook gateway datang TANPA sesi/tenant; otentikasinya verifikasi
  -- signature per provider di service, lalu menulis lewat GUC platform_admin
  -- (pola 0009/0017 — di sini butuh SELECT+UPDATE, bukan hanya read).
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='payments' AND policyname='payments_platform_admin_all') THEN
    CREATE POLICY payments_platform_admin_all ON payments
      USING (current_setting('app.admin_context', true) = 'platform_admin')
      WITH CHECK (current_setting('app.admin_context', true) = 'platform_admin');
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nalar_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON platform_settings, payment_gateways, payments TO nalar_app;
  END IF;
END $$;
