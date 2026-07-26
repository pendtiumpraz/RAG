import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/modules/core/auth';
import { embeddingServerService } from '@/modules/settings/embedding-server.service';
import { ValidationError } from '@/modules/chatbot/chatbot.service';

export const runtime = 'nodejs';

const Body = z.object({
  name: z.string().min(1).optional(),
  baseUrl: z.string().min(1).optional(),
  /** kosong = jangan ubah token yang tersimpan */
  token: z.string().optional(),
  enabled: z.boolean().optional(),
});

/** PATCH /api/admin/embedding-servers/:id — ubah server. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await requireRole('superadmin');
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  try {
    return NextResponse.json(await embeddingServerService.update(id, parsed.data));
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 422 });
    return NextResponse.json({ error: (e as Error).message }, { status: 422 });
  }
}

/** DELETE /api/admin/embedding-servers/:id — soft delete (Rule #3). */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await requireRole('superadmin');
  const { id } = await ctx.params;
  try {
    return NextResponse.json(await embeddingServerService.softDelete(id));
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 404 });
    throw e;
  }
}
