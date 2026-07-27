import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/modules/core/auth';
import { providerConfig, verifyState, exchangeCode } from '@/modules/connections/oauth-flow';
import { connectionService, type OAuthProvider } from '@/modules/connections/connection.service';

export const runtime = 'nodejs';

/** GET /api/connections/{provider}/callback?code&state → simpan token akun. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  const back = (msg: string) => NextResponse.redirect(new URL(`/knowledge?connect=${msg}`, req.url));

  if (provider !== 'google' && provider !== 'microsoft') return back('provider_invalid');
  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  if (!code || !state) return back('missing_code');

  const stateUserId = verifyState(state);
  const user = await getCurrentUser().catch(() => null);
  if (!user || !stateUserId || stateUserId !== user.id) return back('state_invalid');

  try {
    const tokens = await exchangeCode(provider as OAuthProvider, code);
    const cfg = await providerConfig(provider as OAuthProvider);
    const email = await cfg.fetchEmail(tokens.accessToken);
    await connectionService.save({
      tenantId: user.tenantId, userId: user.id, provider: provider as OAuthProvider,
      accountEmail: email, accountLabel: email,
      accessToken: tokens.accessToken, refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt, scope: tokens.scope,
    });
    return back('ok');
  } catch (e) {
    console.error('[oauth callback]', e);
    return back('error');
  }
}
