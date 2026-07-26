-- Billing: masa berlaku plan.
--
-- Sengaja netral terhadap penyedia pembayaran. Penagihan manual (transfer →
-- superadmin mengaktifkan plan sampai tanggal tertentu) sudah bisa berjalan
-- dengan kolom ini saja; integrasi gateway kelak tinggal mengisi kolom yang
-- sama, tanpa mengubah penegakan kuota.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan_expires_at timestamp;

-- Dipakai untuk menyapu tenant yang plannya sudah lewat.
CREATE INDEX IF NOT EXISTS idx_tenants_plan_expires_at ON tenants (plan_expires_at);
