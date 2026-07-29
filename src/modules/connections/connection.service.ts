import { and, eq, isNull } from 'drizzle-orm';
import { oauthConnections } from '@/modules/core/db';
import { withTenant } from '@/modules/core/db/tenant-context';
import { encryptSecret, decryptSecret } from '@/modules/core/crypto';
import { DRIVE_FILE, DRIVE_READONLY } from '@/modules/auth/oauth-app.service';

/**
 * KONEKSI OAUTH PER-USER, MULTI-AKUN — token akses storage milik user
 * (Google Drive / OneDrive / SharePoint). Satu user bisa menghubungkan
 * BANYAK akun per provider (dibedakan `accountEmail`). Token terenkripsi,
 * hanya dipakai server-side; refresh otomatis.
 */

export type OAuthProvider = 'google' | 'microsoft';

export const connectionService = {
  /** Upsert token utk (user, provider, accountEmail). */
  async save(input: {
    tenantId: string; userId: string; provider: OAuthProvider; accountEmail: string;
    accountLabel?: string | null; accessToken: string; refreshToken?: string | null;
    expiresAt?: number | null; scope?: string | null;
  }): Promise<void> {
    const email = input.accountEmail.trim().toLowerCase();
    await withTenant(input.tenantId, async (tx) => {
      const prev = (await tx.select({
        refresh: oauthConnections.encryptedRefreshToken,
        scope: oauthConnections.scope,
      }).from(oauthConnections).where(and(
        eq(oauthConnections.userId, input.userId),
        eq(oauthConnections.provider, input.provider),
        eq(oauthConnections.accountEmail, email),
        isNull(oauthConnections.deletedAt),
      )).limit(1))[0];

      await tx.update(oauthConnections)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(and(
          eq(oauthConnections.userId, input.userId),
          eq(oauthConnections.provider, input.provider),
          eq(oauthConnections.accountEmail, email),
          isNull(oauthConnections.deletedAt),
        ));
      await tx.insert(oauthConnections).values({
        tenantId: input.tenantId, userId: input.userId, provider: input.provider,
        accountEmail: email, accountLabel: input.accountLabel ?? null,
        encryptedAccessToken: encryptSecret(input.accessToken),
        // Pada penambahan izin (incremental auth) Google kerap TIDAK mengirim
        // refresh_token lagi. Menimpanya dengan null akan mematikan auto-refresh
        // diam-diam: sumber tetap tampak sehat sampai token kedaluwarsa satu jam
        // kemudian, lalu sync gagal tanpa sebab yang terlihat.
        encryptedRefreshToken: input.refreshToken
          ? encryptSecret(input.refreshToken)
          : prev?.refresh ?? null,
        expiresAt: input.expiresAt ? new Date(input.expiresAt * 1000) : null,
        // Idem untuk scope: bila balasan tak menyebutnya, izin lama tetap berlaku.
        scope: input.scope ?? prev?.scope ?? null,
      });
    });
  },

  /**
   * Access token valid utk satu akun. `accountEmail` opsional — bila kosong,
   * ambil koneksi pertama untuk provider itu (kompat lama). Refresh bila perlu.
   */
  async getAccessToken(
    tenantId: string, userId: string, provider: OAuthProvider, accountEmail?: string,
  ): Promise<string | null> {
    const email = accountEmail?.trim().toLowerCase();
    const row = await withTenant(tenantId, async (tx) => {
      const conds = [
        eq(oauthConnections.userId, userId),
        eq(oauthConnections.provider, provider),
        isNull(oauthConnections.deletedAt),
      ];
      if (email) conds.push(eq(oauthConnections.accountEmail, email));
      return (await tx.select().from(oauthConnections).where(and(...conds)).limit(1))[0] ?? null;
    });
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

  /** Daftar akun terhubung (tanpa token) utk UI. */
  /**
   * Daftar akun terhubung + APA YANG SEBENARNYA DIIZINKAN akun itu.
   *
   * Kemampuan diturunkan dari scope yang benar-benar diberikan Google/Microsoft
   * saat menyambung, bukan dari mode yang sedang aktif di pengaturan. Keduanya
   * bisa berbeda: mengubah mode Drive tidak mengubah token yang sudah tersimpan.
   * Perbedaan itulah yang dulu membuat akun tampak "tersambung" tapi Picker
   * tak bisa memilih berkas — dan orang terpaksa memutus lalu menyambung ulang
   * tanpa pernah tahu sebabnya. Sekarang UI bisa menyebutkannya.
   */
  async list(tenantId: string, userId: string) {
    const rows = await withTenant(tenantId, (tx) => tx.select({
      id: oauthConnections.id, provider: oauthConnections.provider,
      accountEmail: oauthConnections.accountEmail, accountLabel: oauthConnections.accountLabel,
      expiresAt: oauthConnections.expiresAt, scope: oauthConnections.scope,
    }).from(oauthConnections).where(and(
      eq(oauthConnections.userId, userId), isNull(oauthConnections.deletedAt),
    )));

    return rows.map((r) => {
      const granted = r.scope ?? '';
      return {
        ...r,
        /** Google: bisa dipakai Google Picker memilih berkas. */
        canPickFiles: r.provider === 'google' ? granted.includes(DRIVE_FILE) : true,
        /** Bisa menelusuri folder rekursif (butuh scope baca yang lebih luas). */
        canScanFolder: r.provider === 'google'
          ? granted.includes(DRIVE_READONLY)
          : /Files\.Read/i.test(granted) || !granted, // Graph: koneksi lama tanpa catatan scope dianggap mampu
      };
    });
  },

  async disconnect(tenantId: string, userId: string, connectionId: string) {
    return withTenant(tenantId, (tx) => tx.update(oauthConnections)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(
        eq(oauthConnections.id, connectionId),
        eq(oauthConnections.userId, userId),
        isNull(oauthConnections.deletedAt),
      )));
  },
};

/* ── refresh flows ────────────────────────────────────────────────── */
async function refresh(provider: OAuthProvider, refreshToken: string):
  Promise<{ accessToken: string; expiresIn: number } | null> {
  try {
    if (provider === 'google') {
      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!,
          grant_type: 'refresh_token', refresh_token: refreshToken,
        }),
      });
      if (!res.ok) return null;
      const j = await res.json();
      return { accessToken: j.access_token, expiresIn: j.expires_in ?? 3600 };
    }
    const tenant = process.env.MS_TENANT_ID || 'common';
    const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.MS_CLIENT_ID!, client_secret: process.env.MS_CLIENT_SECRET!,
        grant_type: 'refresh_token', refresh_token: refreshToken,
        scope: 'https://graph.microsoft.com/Files.Read offline_access',
      }),
    });
    if (!res.ok) return null;
    const j = await res.json();
    return { accessToken: j.access_token, expiresIn: j.expires_in ?? 3600 };
  } catch { return null; }
}
