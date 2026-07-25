import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/modules/core/auth';
import { syncService } from '@/modules/knowledge/sync.service';

export const runtime = 'nodejs';

/**
 * POST /api/sources/:id/sync — re-sync manual (antre job, dedup otomatis).
 *
 * Default: DELTA — hanya file baru/berubah yang diunduh & di-embed.
 * `?full=1` memaksa re-ingest semua file (mis. setelah ganti model embedding).
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  const { id } = await ctx.params;
  const full = req.nextUrl.searchParams.get('full') === '1';
  const status = syncService.enqueue(user.tenantId, user.id, id, full);
  return NextResponse.json({ ok: true, mode: full ? 'full' : 'delta', status }, { status: 202 });
}
