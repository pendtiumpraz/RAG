import { NextResponse } from 'next/server';
import { z } from 'zod';
import { billingService, planCatalog } from '@/modules/usage/billing.service';
import { superadminRoute } from '../_guard';

export const runtime = 'nodejs';

/** GET /api/admin/billing — semua tenant + plan & pemakaiannya. */
export const GET = superadminRoute(async () =>
  NextResponse.json({
    tenants: await billingService.listAllTenants(),
    plans: planCatalog(),
  }));

const Body = z.object({
  tenantId: z.string().uuid(),
  plan: z.string().min(1),
  /** ISO date; null/kosong = tanpa batas waktu */
  expiresAt: z.string().nullable().optional(),
});

/** PATCH /api/admin/billing — setel plan sebuah tenant. */
export const PATCH = superadminRoute(async (req, _ctx, actor) => {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Input tidak valid' }, { status: 400 });

  const raw = parsed.data.expiresAt;
  const expiresAt = raw ? new Date(raw) : null;
  if (expiresAt && Number.isNaN(expiresAt.getTime())) {
    return NextResponse.json({ error: 'Tanggal tidak valid' }, { status: 400 });
  }
  return NextResponse.json(
    await billingService.setPlan(actor, parsed.data.tenantId, parsed.data.plan, expiresAt));
});
