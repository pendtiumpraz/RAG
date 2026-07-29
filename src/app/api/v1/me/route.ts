import { NextResponse } from 'next/server';
import { eq, isNull, and } from 'drizzle-orm';
import { db, tenants } from '@/modules/core/db';
import { apiRoute } from '../_guard';
import { usageService } from '@/modules/usage/usage.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/me — siapa pemegang kunci ini & apa batasnya.
 *
 * Endpoint pertama yang dipanggil orang untuk membuktikan kuncinya bekerja.
 * Ia juga menyebut kuota, supaya klien bisa mengerem sendiri alih-alih baru
 * tahu saat ditolak 429.
 */
export const GET = apiRoute('read', async (_req, _ctx, caller) => {
  const t = (await db.select({ name: tenants.name })
    .from(tenants)
    .where(and(eq(tenants.id, caller.tenantId), isNull(tenants.deletedAt)))
    .limit(1))[0];
  const snap = await usageService.snapshot(caller.tenantId);

  return NextResponse.json({
    tenant: { id: caller.tenantId, name: t?.name ?? null },
    key: { id: caller.keyId, scopes: caller.scopes },
    plan: snap.isPlatform ? 'unlimited' : snap.plan,
    usage: {
      period: snap.period,
      messages: snap.messages,
      messagesLimit: snap.limits.messagesPerMonth === Infinity ? null : snap.limits.messagesPerMonth,
    },
  });
});
