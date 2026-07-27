import { createHmac, randomBytes } from 'node:crypto';
import type { OAuthProvider } from './connection.service';
import { oauthAppService } from '@/modules/auth/oauth-app.service';

/**
 * OAuth "connect account" flow — TERPISAH dari login NextAuth. Dipakai utk
 * menghubungkan BANYAK akun Google/Microsoft (storage) tanpa mengubah sesi.
 * State di-HMAC dengan NEXTAUTH_SECRET (CSRF + membawa userId).
 */

export interface ProviderConfig {
  authUrl: string; tokenUrl: string; scope: string;
  clientId?: string; clientSecret?: string; extraAuth: Record<string, string>;
  fetchEmail: (accessToken: string) => Promise<string>;
}

/**
 * Kredensial dibaca dari DATABASE (env sebagai cadangan) lewat
 * oauthAppService, jadi fungsi ini async. Sebelumnya ia membaca
 * `process.env` langsung, sehingga mengganti client secret menuntut redeploy.
 */
export async function providerConfig(provider: OAuthProvider): Promise<ProviderConfig> {
  const app = await oauthAppService.get(provider);

  if (provider === 'google') {
    return {
      authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      scope: 'openid email https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file',
      clientId: app?.clientId, clientSecret: app?.clientSecret,
      extraAuth: { access_type: 'offline', prompt: 'select_account consent' }, // select_account → bisa pilih akun beda
      fetchEmail: async (t) => {
        const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${t}` } });
        return (await r.json()).email;
      },
    };
  }
  const tenant = app?.msTenantId || 'common';
  return {
    authUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
    tokenUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    scope: 'openid email offline_access https://graph.microsoft.com/Files.Read',
    clientId: app?.clientId, clientSecret: app?.clientSecret,
    extraAuth: { prompt: 'select_account' },
    fetchEmail: async (t) => {
      const r = await fetch('https://graph.microsoft.com/v1.0/me', { headers: { Authorization: `Bearer ${t}` } });
      const j = await r.json();
      return j.mail || j.userPrincipalName;
    },
  };
}

export function redirectUri(provider: OAuthProvider): string {
  const base = process.env.NEXTAUTH_URL || 'http://localhost:3000';
  return `${base}/api/connections/${provider}/callback`;
}

const SECRET = () => process.env.NEXTAUTH_SECRET || 'dev-secret';

export function signState(userId: string): string {
  const nonce = randomBytes(8).toString('hex');
  const exp = Date.now() + 10 * 60_000; // 10 menit
  const payload = `${userId}.${nonce}.${exp}`;
  const sig = createHmac('sha256', SECRET()).update(payload).digest('base64url');
  return Buffer.from(`${payload}.${sig}`).toString('base64url');
}

export function verifyState(state: string): string | null {
  try {
    const decoded = Buffer.from(state, 'base64url').toString();
    const [userId, nonce, exp, sig] = decoded.split('.');
    const payload = `${userId}.${nonce}.${exp}`;
    const expect = createHmac('sha256', SECRET()).update(payload).digest('base64url');
    if (sig !== expect) return null;
    if (Date.now() > Number(exp)) return null;
    return userId;
  } catch { return null; }
}

/** Tukar authorization code → tokens. */
export async function exchangeCode(provider: OAuthProvider, code: string) {
  const cfg = await providerConfig(provider);
  const res = await fetch(cfg.tokenUrl, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: cfg.clientId!, client_secret: cfg.clientSecret!,
      grant_type: 'authorization_code', code, redirect_uri: redirectUri(provider),
    }),
  });
  if (!res.ok) throw new Error(`Token exchange gagal: ${res.status}`);
  const j = await res.json();
  return {
    accessToken: j.access_token as string,
    refreshToken: (j.refresh_token as string) ?? null,
    expiresAt: j.expires_in ? Math.floor(Date.now() / 1000) + j.expires_in : null,
    scope: (j.scope as string) ?? cfg.scope,
  };
}
