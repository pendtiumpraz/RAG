import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apikeyService, SCOPES, type Scope } from '@/modules/integrations/apikey.service';
import { masterRoute } from '../../../_master';
import { tenantOwner } from '../../../_actor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/* B3 — mint kunci API baru untuk tenant yang SUDAH ada, bertoken master.
   createdBy diisi admin aktif tenant (jejak audit), bukan null. */
const Body = z.object({
  name: z.string().max(120).optional(),
  scopes: z.array(z.enum(SCOPES as [Scope, ...Scope[]])).nonempty().optional(),
});

/** POST /api/v1/tenants/:id/keys — mint kunci baru untuk tenant :id. */
export const POST = masterRoute<Ctx>(async (req, ctx) => {
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Input tidak valid' }, { status: 400 });
  }
  const owner = await tenantOwner(id);
  if (!owner) return NextResponse.json({ error: 'Tenant tak ditemukan atau tanpa admin aktif.' }, { status: 409 });

  const { key, row } = await apikeyService.create(
    { id: owner.id, tenantId: id },
    { name: parsed.data.name ?? 'Maira S2S', scopes: parsed.data.scopes ?? ['write', 'chat'] },
  );
  return NextResponse.json({
    tenantId: id, apiKey: key, apiKeyId: row.id, scopes: row.scopes,
  }, { status: 201 });
});
