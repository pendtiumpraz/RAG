import { NextRequest, NextResponse, after } from 'next/server';
import { requireRole } from '@/modules/core/auth';
import { syncService } from '@/modules/knowledge/sync.service';
import { jobsSettled } from '@/modules/core/jobs';

export const runtime = 'nodejs';
/** Sync bisa mengunduh + embed banyak file — beri waktu setelah respons. */
export const maxDuration = 60;

/**
 * POST /api/sources/:id/sync — re-sync manual (antre job, dedup otomatis).
 *
 * Default: DELTA — hanya file baru/berubah yang diunduh & di-embed.
 * `?full=1` memaksa re-ingest semua file (mis. setelah ganti model embedding).
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireRole('superadmin', 'admin');
  const { id } = await ctx.params;
  const full = req.nextUrl.searchParams.get('full') === '1';
  const status = syncService.enqueue(user.tenantId, user.id, id, full);
  // Jaga lambda tetap hidup sampai job selesai (lihat jobsSettled di core/jobs).
  after(jobsSettled);
  return NextResponse.json({ ok: true, mode: full ? 'full' : 'delta', status }, { status: 202 });
}
