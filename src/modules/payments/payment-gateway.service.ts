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
  /** non-rahasia: { merchantCode? , clientKey?, sandbox: boolean } */
  publicConfig: Record<string, string | boolean>;
}

export interface PublicGateway {
  provider: PaymentProvider;
  active: boolean;
  configured: boolean;
  publicConfig: Record<string, string | boolean>;
  updatedAt: Date | null;
}

const TTL = 30_000;
let activeCache: { value: GatewayConfig | null; at: number } | null = null;

export const paymentGatewayService = {
  /** Gateway aktif siap pakai (secret terdekripsi) — null bila belum ada. */
  async getActive(): Promise<GatewayConfig | null> {
    if (activeCache && Date.now() - activeCache.at < TTL) return activeCache.value;
    const row = (await db.select().from(paymentGateways).where(and(
      eq(paymentGateways.active, true), isNull(paymentGateways.deletedAt))).limit(1))[0];
    const value = row ? {
      provider: row.provider as PaymentProvider,
      secrets: JSON.parse(decryptSecret(row.encryptedSecret)) as GatewaySecrets,
      publicConfig: row.publicConfig ?? {},
    } : null;
    activeCache = { value, at: Date.now() };
    return value;
  },

  /** Kredensial satu provider (utk verifikasi webhook provider non-aktif pun). */
  async get(provider: PaymentProvider): Promise<GatewayConfig | null> {
    const row = (await db.select().from(paymentGateways).where(and(
      eq(paymentGateways.provider, provider), isNull(paymentGateways.deletedAt))).limit(1))[0];
    if (!row) return null;
    return {
      provider,
      secrets: JSON.parse(decryptSecret(row.encryptedSecret)) as GatewaySecrets,
      publicConfig: row.publicConfig ?? {},
    };
  },

  /** Daftar utk UI superadmin — tanpa secret. */
  async list(): Promise<PublicGateway[]> {
    const rows = await db.select().from(paymentGateways).where(isNull(paymentGateways.deletedAt));
    const byP = new Map(rows.map((r) => [r.provider, r]));
    return PAYMENT_PROVIDERS.map((provider) => {
      const r = byP.get(provider);
      return {
        provider, active: r?.active ?? false, configured: !!r,
        publicConfig: r?.publicConfig ?? {}, updatedAt: r?.updatedAt ?? null,
      };
    });
  },

  /** Simpan kredensial. `secrets` kosong = pertahankan yang tersimpan. */
  async upsert(actor: { id: string; tenantId: string }, provider: PaymentProvider, input: {
    secrets?: GatewaySecrets;
    publicConfig?: Record<string, string | boolean>;
  }): Promise<void> {
    const existing = (await db.select().from(paymentGateways).where(and(
      eq(paymentGateways.provider, provider), isNull(paymentGateways.deletedAt))).limit(1))[0];

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
