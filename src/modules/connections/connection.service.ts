import { and, eq, isNull } from 'drizzle-orm';
import { oauthConnections } from '@/modules/core/db';
import { withTenant } from '@/modules/core/db/tenant-context';
import { encryptSecret, decryptSecret } from '@/modules/core/crypto';
import { DRIVE_FILE, DRIVE_READONLY, oauthAppService } from '@/modules/auth/oauth-app.service';

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

    const r = await refresh(provider, decryptSecret(row.encryptedRefreshToken));
    if (!r.accessToken) return null;
    await withTenant(tenantId, async (tx) => {
      await tx.update(oauthConnections).set({
        encryptedAccessToken: encryptSecret(r.accessToken!),
        expiresAt: new Date(Date.now() + r.expiresIn! * 1000),
        updatedAt: new Date(),
      }).where(eq(oauthConnections.id, row.id));
    });
    return r.accessToken;
  },

  /**
   * Sama dengan getAccessToken, tetapi MENYEBUTKAN sebab gagalnya.
   *
   * Dipakai endpoint /api/connections/test, yang seluruh gunanya memang
   * mendiagnosis. getAccessToken sengaja tetap mengembalikan null saja: di
   * jalur sync, pemanggilnya tak punya apa pun untuk dilakukan dengan
   * sebabnya, dan membuat semua pemanggil menangani objek galat hanya akan
   * menambah kode yang tak dibaca siapa pun.
   */
  async probeAccessToken(
    tenantId: string, userId: string, provider: OAuthProvider, accountEmail?: string,
  ): Promise<{ token: string | null; failure?: RefreshFailure; detail?: string }> {
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
    if (!row) return { token: null, failure: 'revoked', detail: 'koneksi tak ditemukan' };

    if (!row.expiresAt || row.expiresAt.getTime() - Date.now() > 60_000) {
      return { token: decryptSecret(row.encryptedAccessToken) };
    }
    if (!row.encryptedRefreshToken) {
      // Google hanya memberi refresh_token pada otorisasi PERTAMA kecuali
      // diminta ulang dengan prompt=consent. Tanpa itu koneksi tampak sehat
      // sampai satu jam kemudian.
      return { token: null, failure: 'revoked', detail: 'tak ada refresh token tersimpan' };
    }

    const r = await refresh(provider, decryptSecret(row.encryptedRefreshToken));
    if (!r.accessToken) return { token: null, failure: r.failure, detail: r.detail };

    await withTenant(tenantId, async (tx) => {
      await tx.update(oauthConnections).set({
        encryptedAccessToken: encryptSecret(r.accessToken!),
        expiresAt: new Date(Date.now() + r.expiresIn! * 1000),
        updatedAt: new Date(),
      }).where(eq(oauthConnections.id, row.id));
    });
    return { token: r.accessToken };
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

/**
 * Kenapa gagalnya, bukan sekadar gagal.
 *
 * Dua sebab yang menuntut tindakan BERLAWANAN, dan menyamakannya adalah
 * bug yang baru saja kami perbaiki:
 *
 *   'revoked' — token dicabut/kedaluwarsa di sisi penyedia. Pemiliknya
 *               memang harus menyambung ulang.
 *   'config'  — kredensial aplikasi OAuth-nya sendiri salah/kosong.
 *               Menyambung ulang TIDAK menolong: alur connect memakai
 *               kredensial database dan akan berhasil, lalu jam berikutnya
 *               refresh gagal lagi dengan cara yang sama. Yang harus
 *               diperbaiki superadmin, bukan pemilik akun.
 */
export type RefreshFailure = 'revoked' | 'config' | 'network';

export interface RefreshResult {
  accessToken?: string;
  expiresIn?: number;
  /** Ada HANYA bila gagal. */
  failure?: RefreshFailure;
  detail?: string;
}

async function refresh(provider: OAuthProvider, refreshToken: string): Promise<RefreshResult> {
  /* SUMBER KREDENSIAL HARUS SAMA DENGAN ALUR CONNECT.
     Dulu fungsi ini membaca process.env langsung sementara providerConfig()
     sudah pindah ke database (D10). Akibatnya bukan sekadar tak rapi: pada
     pemasangan yang kredensialnya HANYA di database — dan itu keadaan
     bawaan sekarang — client_id di sini undefined, Google membalas
     invalid_client, dan SEMUA koneksi Google mati serentak satu jam setelah
     disambungkan. Pesannya pun menyuruh menyambung ulang, yang tak mungkin
     memperbaikinya. */
  const app = await oauthAppService.get(provider);
  if (!app?.clientId || !app?.clientSecret) {
    return { failure: 'config', detail: `kredensial aplikasi ${provider} belum diisi` };
  }

  try {
    const url = provider === 'google'
      ? 'https://oauth2.googleapis.com/token'
      : `https://login.microsoftonline.com/${app.msTenantId || 'common'}/oauth2/v2.0/token`;

    const body = new URLSearchParams({
      client_id: app.clientId, client_secret: app.clientSecret,
      grant_type: 'refresh_token', refresh_token: refreshToken,
    });
    if (provider === 'microsoft') {
      body.set('scope', 'https://graph.microsoft.com/Files.Read offline_access');
    }

    const res = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body, signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      // Badan galatnya DIBACA, tak dibuang. Tanpa ini kegagalan konfigurasi
      // dan token tercabut tampak persis sama dari luar — dan itulah yang
      // membuat bug ini bertahan begitu lama.
      const teks = await res.text().catch(() => '');
      const kode = /"error"\s*:\s*"([a-z_]+)"/.exec(teks)?.[1] ?? '';
      const konfigurasi = kode === 'invalid_client' || kode === 'unauthorized_client'
        || res.status === 401;
      console.error(`[oauth-refresh] ${provider} ${res.status} ${kode || teks.slice(0, 200)}`);
      return {
        failure: konfigurasi ? 'config' : 'revoked',
        detail: kode || `HTTP ${res.status}`,
      };
    }

    const j = await res.json() as {
      access_token: string; expires_in?: number; refresh_token?: string;
    };
    return { accessToken: j.access_token, expiresIn: j.expires_in ?? 3600 };
  } catch (e) {
    // Jaringan gagal BUKAN token tercabut. Menyamakannya akan menyuruh orang
    // menyambung ulang akun yang sebenarnya sehat.
    console.error(`[oauth-refresh] ${provider} gagal menghubungi penyedia:`, e);
    return { failure: 'network', detail: (e as Error).message.slice(0, 120) };
  }
}
