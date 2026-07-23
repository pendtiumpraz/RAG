import { and, eq, isNull } from 'drizzle-orm';
import { oauthConnections } from '@/modules/core/db';
import { withTenant } from '@/modules/core/db/tenant-context';
import { encryptSecret, decryptSecret } from '@/modules/core/crypto';

/**
 * KONEKSI OAUTH PER-USER — token akses storage MILIK USER SENDIRI
 * (Google Drive / OneDrive / SharePoint). Disimpan terenkripsi, hanya
 * dipakai server-side oleh sync worker. Refresh otomatis saat kedaluwarsa.
 */

export type OAuthProvider = 'google' | 'microsoft';

export const connectionService = {
  /** Upsert token (dipanggil dari callback NextAuth saat scopes diberikan). */
  async save(input: {
    tenantId: string; userId: string; provider: OAuthProvider;
    accessToken: string; refreshToken?: string | null;
    expiresAt?: number | null; scope?: string | null;
  }): Promise<void> {
    await withTenant(input.tenantId, async (tx) => {
      // soft-delete koneksi lama (jejak audit utuh), insert baru
      await tx.update(oauthConnections)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(and(
          eq(oauthConnections.userId, input.userId),
          eq(oauthConnections.provider, input.provider),
          isNull(oauthConnections.deletedAt),
        ));
      await tx.insert(oauthConnections).values({
        tenantId: input.tenantId,
        userId: input.userId,
        provider: input.provider,
        encryptedAccessToken: encryptSecret(input.accessToken),
        encryptedRefreshToken: input.refreshToken ? encryptSecret(input.refreshToken) : null,
        expiresAt: input.expiresAt ? new Date(input.expiresAt * 1000) : null,
        scope: input.scope ?? null,
      });
    });
  },

  /** Access token valid — refresh dulu bila kedaluwarsa (<60 dtk sisa). */
  async getAccessToken(tenantId: string, userId: string, provider: OAuthProvider): Promise<string | null> {
    const row = await withTenant(tenantId, async (tx) =>
      (await tx.select().from(oauthConnections).where(and(
        eq(oauthConnections.userId, userId),
        eq(oauthConnections.provider, provider),
        isNull(oauthConnections.deletedAt),
      )).limit(1))[0] ?? null);
    if (!row) return null;

    const notExpired = !row.expiresAt || row.expiresAt.getTime() - Date.now() > 60_000;
    if (notExpired) return decryptSecret(row.encryptedAccessToken);

    if (!row.encryptedRefreshToken) return null;
    const refreshed = await refresh(provider, decryptSecret(row.encryptedRefreshToken));
    if (!refreshed) return null;

    await withTenant(tenantId, async (tx) => {
      await tx.update(oauthConnections).set({
        encryptedAccessToken: encryptSecret(refreshed.accessToken),
        expiresAt: new Date(Date.now() + refreshed.expiresIn * 1000),
        updatedAt: new Date(),
      }).where(eq(oauthConnections.id, row.id));
    });
    return refreshed.accessToken;
  },

  /** Status koneksi utk UI (tanpa membocorkan token). */
  async status(tenantId: string, userId: string) {
    return withTenant(tenantId, async (tx) => {
      const rows = await tx.select({
        provider: oauthConnections.provider,
        scope: oauthConnections.scope,
        expiresAt: oauthConnections.expiresAt,
      }).from(oauthConnections).where(and(
        eq(oauthConnections.userId, userId),
        isNull(oauthConnections.deletedAt),
      ));
      return rows;
    });
  },
};

/* ── refresh flows ────────────────────────────────────────────────── */

async function refresh(provider: OAuthProvider, refreshToken: string):
  Promise<{ accessToken: string; expiresIn: number } | null> {
  try {
    if (provider === 'google') {
      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID!,
          client_secret: process.env.GOOGLE_CLIENT_SECRET!,
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }),
      });
      if (!res.ok) return null;
      const j = await res.json();
      return { accessToken: j.access_token, expiresIn: j.expires_in ?? 3600 };
    }
    // microsoft
    const tenant = process.env.MS_TENANT_ID || 'common';
    const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.MS_CLIENT_ID!,
        client_secret: process.env.MS_CLIENT_SECRET!,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        scope: 'https://graph.microsoft.com/Files.Read offline_access',
      }),
    });
    if (!res.ok) return null;
    const j = await res.json();
    return { accessToken: j.access_token, expiresIn: j.expires_in ?? 3600 };
  } catch {
    return null;
  }
}
