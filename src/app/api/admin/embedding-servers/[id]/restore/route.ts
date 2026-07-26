import { NextResponse } from 'next/server';
import { embeddingServerService } from '@/modules/settings/embedding-server.service';
import { superadminRoute } from '../../../_guard';

export const runtime = 'nodejs';

/** PATCH /api/admin/embedding-servers/:id/restore — kembalikan dari Sampah (Rule #3). */
export const PATCH = superadminRoute<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  const { id } = await ctx.params;
  return NextResponse.json(await embeddingServerService.restore(id));
});
