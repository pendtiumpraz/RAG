import { eq } from 'drizzle-orm';
import { db, platformSettings } from '@/modules/core/db';
import { audit } from '@/modules/core/guardrails';

/**
 * PLATFORM SETTINGS — mode deploy & harga plan, dari DATABASE (D12).
 *
 * `deployment_mode` menentukan watak instalasi:
 *   'saas'   → pembayaran aktif, kuota plan ditegakkan.
 *   'onprem' → pembayaran MATI dan SEMUA kuota unlimited.
 * Diedit superadmin dari UI — bukan env, sehingga on-prem yang di-deploy dari
 * image yang sama tinggal mengganti satu baris DB. Env DEPLOYMENT_MODE lama
 * hanya dipakai sebagai nilai awal bila baris belum ada.
 *
 * Cache proses 30 dtk (pola oauthAppService): mode dibaca di jalur panas
 * (assertQuota tiap giliran chat) — tanpa cache tiap chat memukul DB.
 */

export type DeploymentMode = 'saas' | 'onprem';

/** Diskon langganan TAHUNAN vs 12× bulanan (20%). Bukan harga — boleh hardcode. */
export const YEARLY_DISCOUNT = 0.2;

/**
 * Harga setahun: 12× bulanan dikurangi diskon, dibulatkan ke ribuan rupiah utuh
 * (299.000 → 2.870.000). Sumber kebenaran harga tetap `planPrices` (bulanan);
 * angka tahunan selalu DITURUNKAN dari sini, tak pernah disimpan terpisah.
 */
export function yearlyPlanPrice(monthlyPrice: number): number {
  return Math.round((monthlyPrice * 12 * (1 - YEARLY_DISCOUNT)) / 1000) * 1000;
}

/** Peta harga tahunan diturunkan dari peta harga bulanan. */
export function yearlyPlanPrices(planPrices: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(planPrices).map(([plan, price]) => [plan, yearlyPlanPrice(price)]),
  );
}

/** Identitas penerbit kuitansi. Kosong = belum diisi, dan itu keadaan yang sah. */
export interface BillingIdentity {
  legalName?: string;
  address?: string;
  /** NPWP penerbit. Kuitansi tetap sah tanpa ini; faktur pajak bukan urusan sistem ini. */
  npwp?: string;
  email?: string;
  phone?: string;
}

export interface PlatformConfig {
  deploymentMode: DeploymentMode;
  planPrices: Record<string, number>;
  /** null = belum diisi. Halaman kuitansi mengatakannya apa adanya. */
  billingIdentity: BillingIdentity | null;
  /**
   * Saklar penyedia BYOB (migrasi 0051). Peta provider -> boolean; kunci yang
   * HILANG berarti 'pakai bawaan' (terbuka). 'platform' selalu tersedia dan
   * tak pernah ada di sini.
   */
  enabledStorageProviders: Record<string, boolean>;
}

const TTL = 30_000;
let cache: { value: PlatformConfig; at: number } | null = null;

const DEFAULTS: PlatformConfig = {
  deploymentMode: (process.env.DEPLOYMENT_MODE === 'onprem' ? 'onprem' : 'saas'),
  planPrices: { pro: 299_000, enterprise: 1_499_000 },
  /* TIDAK ada nilai bawaan, dan itu disengaja. Nama badan hukum yang ditebak
     akan tercetak di kuitansi yang masuk pembukuan pelanggan — kesalahan yang
     baru ketahuan saat auditor menanyakannya. Kosong lebih jujur. */
  billingIdentity: null,
  /* Penyedia S3/R2/GCS/Azure/S3-compat SEMUA tersedia sejak awal. Kunci yang
     hilang dibaca sebagai 'terbuka' oleh storage.service yang disanggah
     DEFAULTS ini — tak ada penyedia yang mati diam-diam. 'platform' tak ada
     di sini karena ia selalu tersedia dan bukan togglable. */
  enabledStorageProviders: { s3: true, r2: true, gcs: true, azure: true, 's3-compat': true },
};

export const platformSettingsService = {
  async get(): Promise<PlatformConfig> {
    if (cache && Date.now() - cache.at < TTL) return cache.value;
    let value = DEFAULTS;
    try {
      const row = (await db.select().from(platformSettings)
        .where(eq(platformSettings.id, 1)).limit(1))[0];
      if (row) {
        value = {
          deploymentMode: row.deploymentMode === 'onprem' ? 'onprem' : 'saas',
          planPrices: row.planPrices ?? DEFAULTS.planPrices,
          billingIdentity: row.billingIdentity ?? null,
          /* NULL di kolom = semua pakai bawaan (terbuka). Menggabung dengan
             DEFAULTS membuat penyedia yang kuncinya HILANG di DB tetap
             terbuka — sama seperti connectorsEnabled. */
          enabledStorageProviders: {
            ...DEFAULTS.enabledStorageProviders,
            ...(row.enabledStorageProviders ?? {}),
          },
        };
      }
    } catch (err) {
      // DB bermasalah tak boleh mematikan chat — jatuh ke default.
      console.error('[platform-settings] gagal baca, memakai default:', err);
    }
    cache = { value, at: Date.now() };
    return value;
  },

  async mode(): Promise<DeploymentMode> {
    return (await this.get()).deploymentMode;
  },

  async update(actor: { id: string; tenantId: string }, input: {
    deploymentMode?: DeploymentMode;
    planPrices?: Record<string, number>;
    billingIdentity?: BillingIdentity;
    enabledStorageProviders?: Record<string, boolean>;
  }): Promise<PlatformConfig> {
    await db.insert(platformSettings).values({ id: 1 }).onConflictDoNothing();
    await db.update(platformSettings).set({
      ...(input.deploymentMode ? { deploymentMode: input.deploymentMode } : {}),
      ...(input.planPrices ? { planPrices: input.planPrices } : {}),
      ...(input.billingIdentity ? { billingIdentity: input.billingIdentity } : {}),
      ...(input.enabledStorageProviders ? { enabledStorageProviders: input.enabledStorageProviders } : {}),
      updatedAt: new Date(),
    }).where(eq(platformSettings.id, 1));
    cache = null;
    await audit(actor.tenantId, actor.id, 'platform.settings_updated', 'platform', input);
    return this.get();
  },

  /** utk tes/dev */
  invalidate() { cache = null; },
};
