import { NextResponse } from 'next/server';
import { z } from 'zod';
import { embeddingServerService } from '@/modules/settings/embedding-server.service';
import { superadminRoute } from '../../_guard';

export const runtime = 'nodejs';

const Body = z.object({
  name: z.string().min(1).optional(),
  baseUrl: z.string().min(1).optional(),
  /** kosong = jangan ubah token yang tersimpan */
  token: z.string().optional(),
  enabled: z.boolean().optional(),
});

type Ctx = { params: Promise<{ id: string }> };

/** PATCH /api/admin/embedding-servers/:id — ubah server. */
export const PATCH = superadminRoute<Ctx>(async (req, ctx) => {
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  return NextResponse.json(await embeddingServerService.update(id, parsed.data));
});

/** DELETE /api/admin/embedding-servers/:id — soft delete (Rule #3). */
export const DELETE = superadminRoute<Ctx>(async (_req, ctx) => {
  const { id } = await ctx.params;
  return NextResponse.json(await embeddingServerService.softDelete(id));
});
