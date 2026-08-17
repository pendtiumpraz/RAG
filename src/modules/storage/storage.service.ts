/**
 * LAYANAN PENYIMPANAN OBJEK (BYOB) — kredensial per-user, terenkripsi.
 *
 * Mengikuti pola oauthConnections (connection.service): per-tenant/per-user,
 * RLS via withTenant, kredensial AES-256-GCM. Beda: yang tersimpan bukan token
 * OAuth melainkan JSON kredensial statis (kunci S3/R2, service account GCS,
 * kunci Azure). Karena TIDAK kedaluwarsa sendiri, rahasianya wajib dienkripsi
 * dan TAK PERNAH dikirim balik ke peramban.
 *
 * RAHASIA: `list`/`get` mengembalikan `hasCredentials: boolean`, bukan isinya.
 * `decryptStorage` (server-side saja) dipakai saat benar-benar mengakses
 * bucket (unggahan/sync masa depan).
 */
import { and, eq, isNull } from 'drizzle-orm';
import { storageConnections } from '@/modules/core/db';
import { withTenant } from '@/modules/core/db/tenant-context';
import { encryptSecret, decryptSecret } from '@/modules/core/crypto';
import { platformSettingsService } from '@/modules/payments/platform-settings.service';
import {
  penyedia, daftarPenyedia, type KredensialStorage, type PenyediaStorage, type HasilUji,
} from './adapter';

/** Baris yang aman untuk UI — tanpa rahasia. */
export interface TampilanStorage {
  id: string;
  provider: PenyediaStorage;
  label: string | null;
  scoping: Record<string, unknown>;
  hasCredentials: boolean;
  isDefault: boolean;
  lastCheckedAt: string | null;
  lastError: string | null;
  updatedAt: string;
}

function keTampilan(
  r: typeof storageConnections.$inferSelect,
): TampilanStorage {
  return {
    id: r.id,
    provider: r.provider as PenyediaStorage,
    label: r.label,
    scoping: r.scoping as Record<string, unknown>,
    hasCredentials: Boolean(r.encryptedCredentials),
    isDefault: r.isDefault,
    lastCheckedAt: r.lastCheckedAt?.toISOString() ?? null,
    lastError: r.lastError,
    updatedAt: r.updatedAt?.toISOString() ?? r.createdAt?.toISOString(),
  };
}

/** Kredensial terdekripsi + adapter — HANYA dipakai di sisi server. */
export interface KredensialTersimpan {
  provider: PenyediaStorage;
  scoping: Record<string, unknown>;
  kred: KredensialStorage;
  isDefault: boolean;
}

export const storageService = {
  /** Daftar penyimpanan terhubung user (tanpa rahasia). */
  async list(tenantId: string, userId: string): Promise<TampilanStorage[]> {
    const rows = await withTenant(tenantId, (tx) => tx.select()
      .from(storageConnections)
      .where(and(
        eq(storageConnections.userId, userId),
        isNull(storageConnections.deletedAt),
      ))
      .orderBy(storageConnections.createdAt));
    return rows.map(keTampilan);
  },

  async get(tenantId: string, userId: string, id: string): Promise<TampilanStorage | null> {
    const rows = await withTenant(tenantId, (tx) => tx.select().from(storageConnections)
      .where(and(
        eq(storageConnections.id, id),
        eq(storageConnections.userId, userId),
        isNull(storageConnections.deletedAt),
      )).limit(1));
    const row = rows[0] ?? null;
    return row ? keTampilan(row) : null;
  },

  /**
   * Simpan/ubah penyimpanan BYOB. Kredensial diterima polos SEKALI lewat
   * HTTPS lalu dienkripsi di server. `id` ada = perbarui (ganti kredensial
   * & lingkup); tak ada = buat baru.
   */
  async save(input: {
    tenantId: string;
    userId: string;
    provider: PenyediaStorage;
    label?: string | null;
    credentials: KredensialStorage;
    isDefault?: boolean;
    id?: string;
  }): Promise<TampilanStorage> {
    const adapter = penyedia(input.provider);
    adapter.validasi(input.credentials);
    if (input.provider === 'platform') {
      throw new Error('Blob platform dielola lewat environment, bukan di sini.');
    }

    // scoping SELALU diturunkan dari kredensial oleh adapter — info lingkup/
    // akun tanpa rahasia. Mempercayai `input.scoping` mentah berarti rahasia
    // yang dikirim client ikut tersimpan; jangan pernah lakukan itu.
    const scoping = adapter.scopingDari(input.credentials);

    const nilai = {
      provider: input.provider,
      label: input.label?.trim() || null,
      scoping,
      encryptedCredentials: encryptSecret(JSON.stringify(input.credentials)),
      isDefault: input.isDefault === true,
      updatedAt: new Date(),
    };

    return withTenant(input.tenantId, async (tx) => {
      // Satu default per user — menetapkan default baru mematikan yang lama.
      if (input.isDefault) {
        await tx.update(storageConnections)
          .set({ isDefault: false, updatedAt: new Date() })
          .where(and(
            eq(storageConnections.userId, input.userId),
            isNull(storageConnections.deletedAt),
            eq(storageConnections.isDefault, true),
          ));
      }
      if (input.id) {
        const rows = await tx.update(storageConnections).set(nilai)
          .where(and(
            eq(storageConnections.id, input.id),
            eq(storageConnections.userId, input.userId),
            isNull(storageConnections.deletedAt),
          )).returning();
        const updated = rows[0];
        if (!updated) throw new Error('Penyimpanan tak ditemukan.');
        return keTampilan(updated);
      }
      const rows = await tx.insert(storageConnections).values({
        tenantId: input.tenantId,
        userId: input.userId,
        ...nilai,
      }).returning();
      const created = rows[0];
      return keTampilan(created);
    });
  },

  async remove(tenantId: string, userId: string, id: string): Promise<void> {
    await withTenant(tenantId, (tx) => tx.update(storageConnections)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(
        eq(storageConnections.id, id),
        eq(storageConnections.userId, userId),
        isNull(storageConnections.deletedAt),
      )));
  },

  /** Uji koneksi: validasi + uji nyata ke penyedia, lalu catat hasilnya. */
  async test(tenantId: string, userId: string, id: string): Promise<HasilUji> {
    const rows = await withTenant(tenantId, (tx) => tx.select().from(storageConnections)
      .where(and(
        eq(storageConnections.id, id),
        eq(storageConnections.userId, userId),
        isNull(storageConnections.deletedAt),
      )).limit(1));
    const row = rows[0] ?? null;
    if (!row) throw new Error('Penyimpanan tak ditemukan.');

    const adapter = penyedia(row.provider as PenyediaStorage);
    const kred = JSON.parse(decryptSecret(row.encryptedCredentials)) as KredensialStorage;
    try {
      const hasil = await adapter.uji(kred);
      await withTenant(tenantId, (tx) => tx.update(storageConnections).set({
        lastCheckedAt: new Date(), lastError: null, updatedAt: new Date(),
      }).where(eq(storageConnections.id, row.id)));
      return hasil;
    } catch (e) {
      const pesan = (e as Error).message.slice(0, 200);
      await withTenant(tenantId, (tx) => tx.update(storageConnections).set({
        lastCheckedAt: new Date(), lastError: pesan, updatedAt: new Date(),
      }).where(eq(storageConnections.id, row.id)));
      return { ok: false, reason: pesan };
    }
  },

  /**
   * Dekripsi kredensial server-side (akses bucket nyata). Mengembalikan null
   * bila tak ada; `scoping` tak pernah berisi rahasia.
   */
  async decryptForAccess(
    tenantId: string, userId: string, id: string,
  ): Promise<KredensialTersimpan | null> {
    const rows = await withTenant(tenantId, (tx) => tx.select().from(storageConnections)
      .where(and(
        eq(storageConnections.id, id),
        eq(storageConnections.userId, userId),
        isNull(storageConnections.deletedAt),
      )).limit(1));
    const row = rows[0] ?? null;
    if (!row) return null;
    return {
      provider: row.provider as PenyediaStorage,
      scoping: row.scoping as Record<string, unknown>,
      kred: JSON.parse(decryptSecret(row.encryptedCredentials)) as KredensialStorage,
      isDefault: row.isDefault,
    };
  },

  /**
   * Pilihan penyedia yang BOLEH dipilih user saat ini (dari saklar superadmin)
   * + opsi platform blob (SELALU tampil sebagai bawaan, tak bisa dimatikan).
   *
   * Penyedia yang dimatikan superadmin TIDAK dikembalikan di sini — sel
   * koneksinya tak akan tampil di form "Hubungkan", jadi pelanggan tak
   * melihat kotak yang ditolaknya. (Menyaring di sumber jauh lebih jujur
   * daripada menyaring di UI: tombol yang tersembunyi tak pernah membuat
   * tangkapan layar bingung.)
   */
  async pilihanPenyedia(): Promise<Array<{ provider: PenyediaStorage; label: string; enabled: boolean }>> {
    const cfg = await platformSettingsService.get();
    const diset = cfg.enabledStorageProviders;
    const pilihan: Array<{ provider: PenyediaStorage; label: string; enabled: boolean }> = [];
    for (const adapter of daftarPenyedia()) {
      if (adapter.provider === 'platform') {
        // Blob platform SELALU jadi pilihan bawaan — tak pernah dimatikan.
        pilihan.unshift({ provider: 'platform', label: 'Blob platform (bawaan)', enabled: true });
        continue;
      }
      pilihan.push({
        provider: adapter.provider,
        label: adapter.label,
        /* Kunci yang hilang = terbuka (pakai bawaan). */
        enabled: diset[adapter.provider] !== false,
      });
    }
    return pilihan;
  },

  /**
   * Pastikan penyedia boleh dipakai. Pengecualian utk superadmin — ia tetap
   * boleh bekerja dengan penyedia apa pun walau saklar mati (untuk uji,
   * perbaikan, atau pelanggan yang sedang bermigrasi). Lempar bila ditolak.
   */
  async pastikanAktif(provider: PenyediaStorage, isSuperadmin: boolean): Promise<void> {
    if (provider === 'platform' || isSuperadmin) return;
    const pilihan = await this.pilihanPenyedia();
    const ada = pilihan.find((p) => p.provider === provider);
    if (!ada || !ada.enabled) {
      throw new Error('Penyedia penyimpanan ini sedang dinonaktifkan oleh platform.');
    }
  },

  /** daftarPilihanPenyedia — daftar penyedia yang BOLEH dipilih user + opsi
   *  platform blob. Platform blob SELALU tampil sebagai pilihan bawaan.
   *  @deprecated pakai `pilihanPenyedia()` yang membaca saklar superadmin. */
  daftarPilihanPenyedia(): Array<{ provider: PenyediaStorage; label: string }> {
    return [
      { provider: 'platform', label: 'Blob platform (bawaan)' },
      { provider: 's3', label: 'AWS S3' },
      { provider: 'r2', label: 'Cloudflare R2' },
      { provider: 'gcs', label: 'Google Cloud Storage' },
      { provider: 'azure', label: 'Azure Blob Storage' },
      { provider: 's3-compat', label: 'S3-compatible (MinIO, Wasabi, …)' },
    ];
  },
};
