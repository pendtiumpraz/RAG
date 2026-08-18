import { and, eq, isNull } from 'drizzle-orm';
import { db, paymentGateways } from '@/modules/core/db';
import { encryptSecret, decryptSecret } from '@/modules/core/crypto';
import { ValidationError } from '@/modules/chatbot/chatbot.service';
import { audit } from '@/modules/core/guardrails';

/**
 * KREDENSIAL GATEWAY PEMBAYARAN — dari DATABASE, tanpa env (D12).
 * Pola persis oauthAppService: secret AES-256-GCM, tak pernah ke browser,
 * cache 30 dtk. Hanya SATU provider `active` — mengaktifkan satu otomatis
 * menonaktifkan yang lain (transaksi).
 */

export type PaymentProvider = 'midtrans' | 'tripay' | 'xendit';
export const PAYMENT_PROVIDERS: PaymentProvider[] = ['midtrans', 'tripay', 'xendit'];

/** Field rahasia per provider (disimpan sebagai satu JSON terenkripsi):
 *  midtrans: { serverKey } · tripay: { apiKey, privateKey } ·
 *  xendit: { secretKey, callbackToken } */
export interface GatewaySecrets {
  serverKey?: string; apiKey?: string; privateKey?: string;
  secretKey?: string; callbackToken?: string;
}
export interface GatewayConfig {
  provider: PaymentProvider;
  secrets: GatewaySecrets;
  /** non-rahasia: { merchantCode?, clientKey?, proxyUrl?, sandbox: boolean }
   *  proxyUrl (tripay, opsional): base VPS ber-IP statis, mis.
   *  http://43.156.122.83:8888 — meneruskan /api & /api-sandbox ke TriPay. */
  publicConfig: Record<string, string | boolean>;
}

/* ── TriPay per-environment (sandbox & production terpisah) ───────────
 * TriPay menyimpan DUA set kredensial berdampingan sehingga pindah
 * sandbox↔production tak perlu isi ulang. Bentuk tersimpan (baru):
 *   encrypted_secret: { sandbox:{apiKey,privateKey}, production:{apiKey,privateKey} }
 *   public_config:    { activeEnv, envs:{ sandbox:{merchantCode,proxyUrl}, production:{…} } }
 * Bentuk lama (flat: secret {apiKey,privateKey} + public {merchantCode,
 * proxyUrl,sandbox:bool}) tetap terbaca — kredensialnya dianggap milik env
 * yang ditunjuk `sandbox` (true→sandbox, false→production). normalizeTripay
 * murni: satu-satunya tempat migrasi flat→per-env hidup. */
export type TripayEnv = 'sandbox' | 'production';
export interface TripayEnvData {
  apiKey?: string; privateKey?: string; merchantCode?: string; proxyUrl?: string;
}
interface TripayRawSecret {
  apiKey?: string; privateKey?: string;
  sandbox?: { apiKey?: string; privateKey?: string };
  production?: { apiKey?: string; privateKey?: string };
}
interface TripayRawPublic {
  merchantCode?: string; proxyUrl?: string; sandbox?: boolean;
  activeEnv?: TripayEnv;
  envs?: Record<TripayEnv, { merchantCode?: string; proxyUrl?: string }>;
}

/** Migrasi + resolusi TriPay ke dua env. Murni — diuji di tests/. */
export function normalizeTripay(
  rawSecret: TripayRawSecret | null | undefined,
  rawPublic: TripayRawPublic | null | undefined,
): { activeEnv: TripayEnv; envs: Record<TripayEnv, TripayEnvData> } {
  const s = rawSecret ?? {};
  const p = rawPublic ?? {};
  const legacyEnv: TripayEnv = p.sandbox === true ? 'sandbox' : 'production';
  const activeEnv: TripayEnv =
    p.activeEnv === 'sandbox' || p.activeEnv === 'production' ? p.activeEnv : legacyEnv;

  const build = (env: TripayEnv): TripayEnvData => {
    const out: TripayEnvData = {};
    const nestedSec = s[env];
    if (nestedSec && typeof nestedSec === 'object') {
      out.apiKey = nestedSec.apiKey; out.privateKey = nestedSec.privateKey;
    } else if (env === legacyEnv && (s.apiKey || s.privateKey)) {
      out.apiKey = s.apiKey; out.privateKey = s.privateKey;
    }
    const nestedPub = p.envs?.[env];
    if (nestedPub && typeof nestedPub === 'object') {
      out.merchantCode = nestedPub.merchantCode; out.proxyUrl = nestedPub.proxyUrl;
    } else if (env === legacyEnv) {
      if (typeof p.merchantCode === 'string') out.merchantCode = p.merchantCode;
      if (typeof p.proxyUrl === 'string') out.proxyUrl = p.proxyUrl;
    }
    return out;
  };
  return { activeEnv, envs: { sandbox: build('sandbox'), production: build('production') } };
}

export interface PublicGatewayEnv {
  merchantCode: string; proxyUrl: string;
  apiKeySet: boolean; privateKeySet: boolean; ready: boolean;
}
export interface PublicGateway {
  provider: PaymentProvider;
  active: boolean;
  configured: boolean;
  publicConfig: Record<string, string | boolean>;
  updatedAt: Date | null;
  /** hanya tripay: status per-env tanpa rahasia (hanya flag terisi). */
  tripay?: { activeEnv: TripayEnv; envs: Record<TripayEnv, PublicGatewayEnv> };
}

const TTL = 30_000;
let activeCache: { value: GatewayConfig | null; at: number } | null = null;

/** Baris DB → GatewayConfig siap pakai. TriPay diresolusi ke env AKTIF
 *  (secret + merchantCode + proxyUrl env itu, `sandbox` tersirat) sehingga
 *  chargeTripay dkk tak berubah. Provider lain tetap flat. */
function rowToConfig(row: typeof paymentGateways.$inferSelect): GatewayConfig {
  const secrets = JSON.parse(decryptSecret(row.encryptedSecret));
  if (row.provider === 'tripay') {
    const norm = normalizeTripay(
      secrets as TripayRawSecret,
      row.publicConfig as unknown as TripayRawPublic,
    );
    const e = norm.envs[norm.activeEnv];
    return {
      provider: 'tripay',
      secrets: { apiKey: e.apiKey, privateKey: e.privateKey },
      publicConfig: {
        merchantCode: e.merchantCode ?? '', proxyUrl: e.proxyUrl ?? '',
        sandbox: norm.activeEnv === 'sandbox',
      },
    };
  }
  return {
    provider: row.provider as PaymentProvider,
    secrets: secrets as GatewaySecrets,
    publicConfig: row.publicConfig ?? {},
  };
}

export const paymentGatewayService = {
  /** Gateway aktif siap pakai (secret terdekripsi) — null bila belum ada. */
  async getActive(): Promise<GatewayConfig | null> {
    if (activeCache && Date.now() - activeCache.at < TTL) return activeCache.value;
    const row = (await db.select().from(paymentGateways).where(and(
      eq(paymentGateways.active, true), isNull(paymentGateways.deletedAt))).limit(1))[0];
    const value = row ? rowToConfig(row) : null;
    activeCache = { value, at: Date.now() };
    return value;
  },

  /** Kredensial satu provider (utk verifikasi webhook provider non-aktif pun). */
  async get(provider: PaymentProvider): Promise<GatewayConfig | null> {
    const row = (await db.select().from(paymentGateways).where(and(
      eq(paymentGateways.provider, provider), isNull(paymentGateways.deletedAt))).limit(1))[0];
    if (!row) return null;
    return rowToConfig(row);
  },

  /** Kedua env TriPay (secret ter-dekripsi) — utk webhook memverifikasi
   *  signature di env manapun, walau env itu tak sedang aktif. */
  async getTripayEnvs(): Promise<{ activeEnv: TripayEnv; envs: Record<TripayEnv, TripayEnvData> } | null> {
    const row = (await db.select().from(paymentGateways).where(and(
      eq(paymentGateways.provider, 'tripay'), isNull(paymentGateways.deletedAt))).limit(1))[0];
    if (!row) return null;
    return normalizeTripay(
      JSON.parse(decryptSecret(row.encryptedSecret)) as TripayRawSecret,
      row.publicConfig as unknown as TripayRawPublic,
    );
  },

  /** Daftar utk UI superadmin — tanpa secret. TriPay dilengkapi status
   *  per-env (hanya flag terisi, bukan nilai rahasia). */
  async list(): Promise<PublicGateway[]> {
    const rows = await db.select().from(paymentGateways).where(isNull(paymentGateways.deletedAt));
    const byP = new Map(rows.map((r) => [r.provider, r]));
    return PAYMENT_PROVIDERS.map((provider) => {
      const r = byP.get(provider);
      const base: PublicGateway = {
        provider, active: r?.active ?? false, configured: !!r,
        publicConfig: r?.publicConfig ?? {}, updatedAt: r?.updatedAt ?? null,
      };
      if (provider === 'tripay' && r) {
        const norm = normalizeTripay(
          JSON.parse(decryptSecret(r.encryptedSecret)) as TripayRawSecret,
          r.publicConfig as unknown as TripayRawPublic,
        );
        const view = (e: TripayEnvData): PublicGatewayEnv => ({
          merchantCode: e.merchantCode ?? '', proxyUrl: e.proxyUrl ?? '',
          apiKeySet: !!e.apiKey, privateKeySet: !!e.privateKey,
          ready: !!e.apiKey && !!e.privateKey,
        });
        base.tripay = {
          activeEnv: norm.activeEnv,
          envs: { sandbox: view(norm.envs.sandbox), production: view(norm.envs.production) },
        };
      }
      return base;
    });
  },

  /** Simpan kredensial. `secrets` kosong = pertahankan yang tersimpan.
   *  TriPay: `env` menargetkan satu environment — env lain tak tersentuh. */
  async upsert(actor: { id: string; tenantId: string }, provider: PaymentProvider, input: {
    secrets?: GatewaySecrets;
    publicConfig?: Record<string, string | boolean>;
    env?: TripayEnv;
  }): Promise<void> {
    const existing = (await db.select().from(paymentGateways).where(and(
      eq(paymentGateways.provider, provider), isNull(paymentGateways.deletedAt))).limit(1))[0];

    if (provider === 'tripay') {
      return this._upsertTripay(actor, existing, input);
    }

    const hasNewSecrets = input.secrets && Object.values(input.secrets).some((v) => v?.trim());
    if (!existing && !hasNewSecrets) throw new ValidationError('Kredensial wajib diisi saat pertama kali menyimpan');

    if (existing) {
      await db.update(paymentGateways).set({
        ...(hasNewSecrets ? { encryptedSecret: encryptSecret(JSON.stringify(input.secrets)) } : {}),
        ...(input.publicConfig ? { publicConfig: input.publicConfig } : {}),
        updatedAt: new Date(),
      }).where(eq(paymentGateways.id, existing.id));
    } else {
      await db.insert(paymentGateways).values({
        provider,
        encryptedSecret: encryptSecret(JSON.stringify(input.secrets)),
        publicConfig: input.publicConfig ?? {},
      });
    }
    activeCache = null;
    await audit(actor.tenantId, actor.id, 'payment.gateway_saved', provider, {});
  },

  /** Simpan kredensial TriPay untuk SATU env (default: env aktif tersimpan,
   *  atau production bila baris baru). Merge: secret kosong = pertahankan,
   *  merchantCode/proxyUrl ditimpa apa adanya (boleh dikosongkan). */
  async _upsertTripay(
    actor: { id: string; tenantId: string },
    existing: typeof paymentGateways.$inferSelect | undefined,
    input: { secrets?: GatewaySecrets; publicConfig?: Record<string, string | boolean>; env?: TripayEnv },
  ): Promise<void> {
    const norm = existing
      ? normalizeTripay(
          JSON.parse(decryptSecret(existing.encryptedSecret)) as TripayRawSecret,
          existing.publicConfig as unknown as TripayRawPublic)
      : { activeEnv: 'production' as TripayEnv, envs: { sandbox: {}, production: {} } as Record<TripayEnv, TripayEnvData> };

    const env: TripayEnv = input.env ?? norm.activeEnv;
    const cur = { ...norm.envs[env] };
    const apiKey = input.secrets?.apiKey?.trim();
    const privateKey = input.secrets?.privateKey?.trim();
    if (apiKey) cur.apiKey = apiKey;
    if (privateKey) cur.privateKey = privateKey;
    if (input.publicConfig && 'merchantCode' in input.publicConfig) cur.merchantCode = String(input.publicConfig.merchantCode ?? '');
    if (input.publicConfig && 'proxyUrl' in input.publicConfig) cur.proxyUrl = String(input.publicConfig.proxyUrl ?? '');
    norm.envs[env] = cur;

    if (!existing && !cur.apiKey && !cur.privateKey) {
      throw new ValidationError('Kredensial wajib diisi saat pertama kali menyimpan');
    }

    const secretJson = JSON.stringify({
      sandbox: { apiKey: norm.envs.sandbox.apiKey, privateKey: norm.envs.sandbox.privateKey },
      production: { apiKey: norm.envs.production.apiKey, privateKey: norm.envs.production.privateKey },
    });
    const publicNested = {
      activeEnv: norm.activeEnv,
      envs: {
        sandbox: { merchantCode: norm.envs.sandbox.merchantCode ?? '', proxyUrl: norm.envs.sandbox.proxyUrl ?? '' },
        production: { merchantCode: norm.envs.production.merchantCode ?? '', proxyUrl: norm.envs.production.proxyUrl ?? '' },
      },
    } as unknown as Record<string, string | boolean>;

    if (existing) {
      await db.update(paymentGateways).set({
        encryptedSecret: encryptSecret(secretJson), publicConfig: publicNested, updatedAt: new Date(),
      }).where(eq(paymentGateways.id, existing.id));
    } else {
      await db.insert(paymentGateways).values({
        provider: 'tripay', encryptedSecret: encryptSecret(secretJson), publicConfig: publicNested,
      });
    }
    activeCache = null;
    await audit(actor.tenantId, actor.id, 'payment.gateway_saved', 'tripay', { env });
  },

  /** Pilih env TriPay aktif (sandbox/production) lalu aktifkan provider.
   *  Env wajib punya apiKey + privateKey lengkap. */
  async setTripayActiveEnv(actor: { id: string; tenantId: string }, env: TripayEnv): Promise<void> {
    const row = (await db.select().from(paymentGateways).where(and(
      eq(paymentGateways.provider, 'tripay'), isNull(paymentGateways.deletedAt))).limit(1))[0];
    if (!row) throw new ValidationError('Isi kredensial TriPay dulu sebelum mengaktifkannya');
    const norm = normalizeTripay(
      JSON.parse(decryptSecret(row.encryptedSecret)) as TripayRawSecret,
      row.publicConfig as unknown as TripayRawPublic);
    const e = norm.envs[env];
    if (!e.apiKey || !e.privateKey) {
      throw new ValidationError(`Kredensial TriPay ${env} belum lengkap (API Key & Private Key)`);
    }
    const publicNested = {
      activeEnv: env,
      envs: {
        sandbox: { merchantCode: norm.envs.sandbox.merchantCode ?? '', proxyUrl: norm.envs.sandbox.proxyUrl ?? '' },
        production: { merchantCode: norm.envs.production.merchantCode ?? '', proxyUrl: norm.envs.production.proxyUrl ?? '' },
      },
    } as unknown as Record<string, string | boolean>;
    await db.update(paymentGateways).set({ publicConfig: publicNested, updatedAt: new Date() })
      .where(eq(paymentGateways.id, row.id));
    activeCache = null;
    await this.setActive(actor, 'tripay');
  },

  /** Aktifkan SATU provider — sisanya dinonaktifkan dalam transaksi yang sama. */
  async setActive(actor: { id: string; tenantId: string }, provider: PaymentProvider): Promise<void> {
    await db.transaction(async (tx) => {
      const target = (await tx.select().from(paymentGateways).where(and(
        eq(paymentGateways.provider, provider), isNull(paymentGateways.deletedAt))).limit(1))[0];
      if (!target) throw new ValidationError('Isi kredensial provider ini dulu sebelum mengaktifkannya');
      await tx.update(paymentGateways).set({ active: false, updatedAt: new Date() })
        .where(isNull(paymentGateways.deletedAt));
      await tx.update(paymentGateways).set({ active: true, updatedAt: new Date() })
        .where(eq(paymentGateways.id, target.id));
    });
    activeCache = null;
    await audit(actor.tenantId, actor.id, 'payment.gateway_activated', provider, {});
  },

  invalidate() { activeCache = null; },
};
