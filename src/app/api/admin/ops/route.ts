import { NextResponse } from 'next/server';
import { opsService } from '@/modules/core/ops.service';
import { superadminRoute } from '../_guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/admin/ops?hours=24 — ringkasan operasional lintas tenant. */
export const GET = superadminRoute(async (req) => {
  const raw = Number(req.nextUrl.searchParams.get('hours') ?? 24);
  // Jendela terlalu lebar akan memindai audit_logs yang terus tumbuh.
  const hours = Number.isFinite(raw) ? Math.min(Math.max(raw, 1), 168) : 24;
  return NextResponse.json(await opsService.summary(hours));
});
