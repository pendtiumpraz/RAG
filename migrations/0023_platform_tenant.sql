-- Tenant milik OPERATOR PLATFORM bukan pelanggan — jangan dimeteran.
--
-- Sebelum ini ada ketidakcocokan yang membingungkan: /api/entitlements sudah
-- membuka semua FITUR untuk superadmin, tetapi usageService.snapshot() hanya
-- menerima tenantId sehingga tak tahu peran siapa pun dan tetap memakai batas
-- `free` — 1.000 pesan, 1 chatbot, 2 anggota. Fiturnya terbuka, jatahnya tidak.
--
-- Ditandai sebagai KOLOM, bukan disimpulkan dari peran saat query, karena
-- tabel `users` berada di bawah RLS: membacanya lintas tenant menuntut
-- escape hatch GUC, dan menaruh jalur seperti itu di jalur panas kuota
-- (dipanggil tiap giliran chat) memperbesar permukaan risiko tanpa perlu.
-- `tenants` sendiri memang tabel akar tanpa RLS.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS is_platform boolean NOT NULL DEFAULT false;

-- Backfill: tenant mana pun yang memuat superadmin adalah tenant operator.
-- Migrasi berjalan dengan role admin, jadi RLS tak menghalangi di sini.
UPDATE tenants t SET is_platform = true
WHERE t.deleted_at IS NULL
  AND EXISTS (
    SELECT 1 FROM users u
    WHERE u.tenant_id = t.id AND u.role = 'superadmin' AND u.deleted_at IS NULL
  )
  AND t.is_platform = false;

CREATE INDEX IF NOT EXISTS idx_tenants_is_platform ON tenants (is_platform) WHERE is_platform;

COMMENT ON COLUMN tenants.is_platform IS
  'Workspace operator platform — kuota & batas selalu tanpa batas, tak pernah ditagih.';
