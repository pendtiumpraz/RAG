import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/modules/core/auth';
import { providerConfig, redirectUri, signState } from '@/modules/connections/oauth-flow';
import type { OAuthProvider } from '@/modules/connections/connection.service';
import { DRIVE_READONLY } from '@/modules/auth/oauth-app.service';

export const runtime = 'nodejs';

/**
 * GET /api/connections/{google|microsoft}/start → redirect ke OAuth consent.
 *
 * Dua parameter opsional yang membuat penyambungan ULANG tak lagi perlu:
 *
 *   ?grant=folder   minta tambahan drive.readonly di atas izin yang SUDAH ada.
 *                   `include_granted_scopes=true` membuat Google menerbitkan
 *                   token yang memuat izin lama + baru sekaligus, jadi tak ada
 *                   yang hilang. Tanpa ini, satu-satunya cara menaikkan izin
 *                   adalah memutus koneksi lalu menyambung lagi dari nol —
 *                   persis langkah membingungkan yang dulu terpaksa dilakukan.
 *
 *   ?account=email  dikirim sebagai login_hint supaya Google langsung menuju
 *                   akun yang bersangkutan alih-alih meminta memilih akun lagi.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const user = await getCurrentUser();
  const { provider } = await ctx.params;
  if (provider !== 'google' && provider !== 'microsoft')
    return NextResponse.json({ error: 'provider tidak dikenal' }, { status: 400 });

  const cfg = await providerConfig(provider as OAuthProvider);
  if (!cfg.clientId) {
    return NextResponse.json({ error: `${provider} OAuth belum dikonfigurasi` }, { status: 400 });
  }

  const wantFolder = req.nextUrl.searchParams.get('grant') === 'folder';
  const account = req.nextUrl.searchParams.get('account')?.trim();

  // Tambahkan scope yang diminta bila belum termuat di scope mode saat ini.
  let scope = cfg.scope;
  if (wantFolder && provider === 'google' && !scope.includes(DRIVE_READONLY)) {
    scope = `${scope} ${DRIVE_READONLY}`;
  }

  const url = new URL(cfg.authUrl);
  url.searchParams.set('client_id', cfg.clientId);
  url.searchParams.set('redirect_uri', redirectUri(provider as OAuthProvider));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', scope);
  url.searchParams.set('state', signState(user.id));
  for (const [k, v] of Object.entries(cfg.extraAuth)) url.searchParams.set(k, v);

  if (provider === 'google') {
    // Izin lama IKUT TERBAWA ke token baru — inti dari "tak perlu sambung ulang".
    url.searchParams.set('include_granted_scopes', 'true');
    if (account) {
      // login_hint menggantikan select_account: langsung ke akun yang dimaksud.
      url.searchParams.set('login_hint', account);
      url.searchParams.set('prompt', 'consent');
    }
  }

  return NextResponse.redirect(url.toString());
}
