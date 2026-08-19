import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authService } from '@/modules/auth/auth.service';
import { apikeyService, SCOPES, type Scope } from '@/modules/integrations/apikey.service';
import { audit } from '@/modules/core/guardrails';
import { masterRoute } from '../_master';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* B4 — provisioning bertoken master. Bukan POST /api/auth/signup apa adanya:
   itu tanpa-auth + rate-limit per-IP (anti-abuse publik), tak cocok untuk
   server yang provision massal. Jalur ini bertoken master, dan langsung
   mengembalikan kunci API tenant baru (menyatukan B4+B3). */
const Body = z.object({
  orgName: z.string().min(1).max(120),
  name: z.string().min(1).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(200),
  /** Kunci pertama tenant. Default scope write+chat (write mencakup read). */
  keyName: z.string().max(120).optional(),
  scopes: z.array(z.enum(SCOPES as [Scope, ...Scope[]])).nonempty().optional(),
});

/** POST /api/v1/tenants — provision 1 tenant baru → {tenantId, apiKey}. */
export const POST = masterRoute(async (req) => {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Input tidak valid' }, { status: 400 });
  }
  const { orgName, name, email, password, keyName, scopes } = parsed.data;
  // signup melempar ValidationError (mis. email dipakai) → 422 di masterRoute.
  const user = await authService.signup({ orgName, name, email, password });

  const { key, row } = await apikeyService.create(
    { id: user.id, tenantId: user.tenantId },
    { name: keyName ?? 'Maira S2S', scopes: scopes ?? ['write', 'chat'] },
  );
  await audit(user.tenantId, user.id, 'tenant.provisioned', undefined, { via: 'master', apiKeyId: row.id });

  return NextResponse.json({
    tenantId: user.tenantId, userId: user.id,
    apiKey: key, apiKeyId: row.id, scopes: row.scopes,
  }, { status: 201 });
});
