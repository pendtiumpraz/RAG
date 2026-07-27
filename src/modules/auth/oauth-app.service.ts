import { eq, and, isNull } from 'drizzle-orm';
import { db, oauthApps } from '@/modules/core/db';
import { encryptSecret, decryptSecret } from '@/modules/core/crypto';
import { ValidationError } from '@/modules/chatbot/chatbot.service';
import { audit } from '@/modules/core/guardrails';

/**
 * KREDENSIAL APLIKASI OAUTH (Google / Microsoft) — dari DATABASE, bukan env.
 *
 * Kenapa dipindah: lewat env, mengganti kredensial menuntut redeploy. Itu
 * bikin pemulihan lambat justru saat paling dibutuhkan — client secret
 * Microsoft kedaluwarsa maksimal 24 bulan dan begitu lewat, login serta
 * sinkronisasi berhenti tanpa ada perubahan kode apa pun.
 *
 * Env TETAP didukung sebagai cadangan (on-prem, dev, dan pemulihan bila
 * database sedang bermasalah). Urutannya: DATABASE dulu, env belakangan.
 */

export type OAuthProviderId = 'google' | 'microsoft';

export interface OAuthAppConfig {
  clientId: string;
  clientSecret: string;
  msTenantId?: string | null;
  source: 'database' | 'env';
}

/** Bentuk aman untuk browser — secret TIDAK pernah ikut. */
export interface PublicOAuthApp {
  provider: OAuthProviderId;
  clientId: string;
  msTenantId: string | null;
  enabled: boolean;
  hasSecret: boolean;
  source: 'database' | 'env' | 'none';
  updatedAt: Date | null;
}

/**
 * Cache proses. Tanpa ini setiap permintaan auth memukul database — dan
 * NextAuth memanggilnya sangat sering (setiap pengecekan sesi di App Router).
 *
 * TTL pendek disengaja: di serverless tiap instance punya cache sendiri, jadi
 * perubahan kredensial baru merata setelah TTL lewat. 30 detik cukup singkat
 * untuk terasa langsung, cukup panjang untuk menghindari badai kueri.
 */
const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { value: OAuthAppConfig | null; at: number }>();

function envConfig(provider: OAuthProviderId): OAuthAppConfig | null {
  const clientId = provider === 'google' ? process.env.GOOGLE_CLIENT_ID : process.env.MS_CLIENT_ID;
  const clientSecret = provider === 'google' ? process.env.GOOGLE_CLIENT_SECRET : process.env.MS_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return {
    clientId, clientSecret,
    msTenantId: provider === 'microsoft' ? (process.env.MS_TENANT_ID || 'common') : null,
    source: 'env',
  };
}

export const oauthAppService = {
  /** Kredensial siap pakai, atau null bila provider belum dikonfigurasi. */
  async get(provider: OAuthProviderId): Promise<OAuthAppConfig | null> {
    const hit = cache.get(provider);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

    let value: OAuthAppConfig | null = null;
    try {
      const rows = await db.select().from(oauthApps).where(and(
        eq(oauthApps.provider, provider),
        eq(oauthApps.enabled, true),
        isNull(oauthApps.deletedAt),
      )).limit(1);
      const r = rows[0];
      if (r) {
        value = {
          clientId: r.clientId,
          clientSecret: decryptSecret(r.encryptedSecret),
          msTenantId: r.msTenantId ?? 'common',
          source: 'database',
        };
      }
    } catch (err) {
      // Database bermasalah TIDAK boleh mematikan login sepenuhnya — jatuh ke
      // env supaya jalur yang sudah dikonfigurasi lewat env tetap hidup.
      console.error('[oauth-app] gagal membaca dari database, memakai env:', err);
    }

    if (!value) value = envConfig(provider);
    cache.set(provider, { value, at: Date.now() });
    return value;
  },

  /** Buang cache — dipanggil sesudah perubahan agar tak menunggu TTL. */
  invalidate(provider?: OAuthProviderId) {
    if (provider) cache.delete(provider); else cache.clear();
  },

  /** Untuk UI superadmin: menyatakan sumbernya, tapi tak pernah nilai secret. */
  async list(): Promise<PublicOAuthApp[]> {
    const rows = await db.select().from(oauthApps).where(isNull(oauthApps.deletedAt));
    const byProvider = new Map(rows.map((r) => [r.provider, r]));

    return (['google', 'microsoft'] as OAuthProviderId[]).map((provider) => {
      const r = byProvider.get(provider);
      if (r) {
        return {
          provider, clientId: r.clientId, msTenantId: r.msTenantId,
          enabled: r.enabled, hasSecret: !!r.encryptedSecret,
          source: 'database' as const, updatedAt: r.updatedAt,
        };
      }
      const env = envConfig(provider);
      return {
        provider,
        clientId: env?.clientId ?? '',
        msTenantId: env?.msTenantId ?? null,
        enabled: !!env,
        hasSecret: !!env,
        source: env ? ('env' as const) : ('none' as const),
        updatedAt: null,
      };
    });
  },

  /** Simpan/ubah. `clientSecret` kosong = pertahankan yang tersimpan. */
  async upsert(
    actor: { id: string; tenantId: string },
    provider: OAuthProviderId,
    input: { clientId: string; clientSecret?: string; msTenantId?: string | null; enabled?: boolean },
  ): Promise<PublicOAuthApp> {
    const clientId = input.clientId?.trim();
    if (!clientId) throw new ValidationError('Client ID wajib diisi');

    const existing = (await db.select().from(oauthApps).where(and(
      eq(oauthApps.provider, provider), isNull(oauthApps.deletedAt),
    )).limit(1))[0];

    const secret = input.clientSecret?.trim();
    if (!existing && !secret) throw new ValidationError('Client secret wajib diisi saat pertama kali menyimpan');

    if (existing) {
      await db.update(oauthApps).set({
        clientId,
        ...(secret ? { encryptedSecret: encryptSecret(secret) } : {}),
        msTenantId: provider === 'microsoft' ? (input.msTenantId?.trim() || 'common') : null,
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        updatedAt: new Date(),
      }).where(eq(oauthApps.id, existing.id));
    } else {
      await db.insert(oauthApps).values({
        provider, clientId, encryptedSecret: encryptSecret(secret!),
        msTenantId: provider === 'microsoft' ? (input.msTenantId?.trim() || 'common') : null,
        enabled: input.enabled ?? true,
      });
    }

    this.invalidate(provider);
    await audit(actor.tenantId, actor.id, 'oauth.app.saved', provider, { clientId });
    return (await this.list()).find((a) => a.provider === provider)!;
  },

  /** Hapus (soft) kredensial database — sistem kembali memakai env bila ada. */
  async remove(actor: { id: string; tenantId: string }, provider: OAuthProviderId): Promise<PublicOAuthApp> {
    const rows = await db.update(oauthApps)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(oauthApps.provider, provider), isNull(oauthApps.deletedAt)))
      .returning({ id: oauthApps.id });
    if (!rows[0]) throw new ValidationError('Kredensial tidak ditemukan');

    this.invalidate(provider);
    await audit(actor.tenantId, actor.id, 'oauth.app.removed', provider, {});
    return (await this.list()).find((a) => a.provider === provider)!;
  },
};
