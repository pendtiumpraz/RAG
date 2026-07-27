import { NextResponse } from 'next/server';
import { z } from 'zod';
import { oauthAppService, type OAuthProviderId } from '@/modules/auth/oauth-app.service';
import { superadminRoute } from '../_guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Kredensial aplikasi OAuth — SUPERADMIN saja.
 *
 * Client secret tak pernah dibalas ke browser; daftar hanya menyatakan
 * ada/tidaknya beserta sumbernya (database atau env).
 */
export const GET = superadminRoute(async () =>
  NextResponse.json(await oauthAppService.list()));

const Body = z.object({
  provider: z.enum(['google', 'microsoft']),
  clientId: z.string().min(1),
  /** kosong = pertahankan secret yang tersimpan */
  clientSecret: z.string().optional(),
  msTenantId: z.string().optional(),
  enabled: z.boolean().optional(),
  /** D10 — Google saja: 'full' (drive.readonly, restricted) | 'picker' (drive.file). */
  driveAccessMode: z.enum(['full', 'picker']).optional(),
  /** API key browser Google Picker (opsional; bukan rahasia). */
  pickerApiKey: z.string().nullable().optional(),
});

export const PUT = superadminRoute(async (req, _ctx, actor) => {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Input tidak valid' }, { status: 400 });
  }
  const { provider, ...rest } = parsed.data;
  return NextResponse.json(await oauthAppService.upsert(actor, provider as OAuthProviderId, rest));
});

/** DELETE ?provider=google — hapus kredensial DB; sistem kembali ke env bila ada. */
export const DELETE = superadminRoute(async (req, _ctx, actor) => {
  const provider = req.nextUrl.searchParams.get('provider');
  if (provider !== 'google' && provider !== 'microsoft') {
    return NextResponse.json({ error: 'provider tidak dikenal' }, { status: 400 });
  }
  return NextResponse.json(await oauthAppService.remove(actor, provider));
});
