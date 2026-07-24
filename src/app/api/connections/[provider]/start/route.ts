import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/modules/core/auth';
import { providerConfig, redirectUri, signState } from '@/modules/connections/oauth-flow';
import type { OAuthProvider } from '@/modules/connections/connection.service';

export const runtime = 'nodejs';

/** GET /api/connections/{google|microsoft}/start → redirect ke OAuth consent. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const user = await getCurrentUser();
  const { provider } = await ctx.params;
  if (provider !== 'google' && provider !== 'microsoft')
    return NextResponse.json({ error: 'provider tidak dikenal' }, { status: 400 });

  const cfg = providerConfig(provider as OAuthProvider);
  if (!cfg.clientId) return NextResponse.json({ error: `${provider} OAuth belum dikonfigurasi (env)` }, { status: 400 });

  const url = new URL(cfg.authUrl);
  url.searchParams.set('client_id', cfg.clientId);
  url.searchParams.set('redirect_uri', redirectUri(provider as OAuthProvider));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', cfg.scope);
  url.searchParams.set('state', signState(user.id));
  for (const [k, v] of Object.entries(cfg.extraAuth)) url.searchParams.set(k, v);

  return NextResponse.redirect(url.toString());
}
