import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/modules/core/auth';
import { syncService } from '@/modules/knowledge/sync.service';

export const runtime = 'nodejs';

/** POST /api/sources/:id/sync — re-sync manual (antre job, dedup otomatis). */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  const { id } = await ctx.params;
  const status = syncService.enqueue(user.tenantId, user.id, id);
  return NextResponse.json({ ok: true, status }, { status: 202 });
}
