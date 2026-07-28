import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/modules/core/auth';
import { usageService } from '@/modules/usage/usage.service';
import { withTenant } from '@/modules/core/db/tenant-context';
import { tenantSettings } from '@/modules/core/db';
import { eq } from 'drizzle-orm';
import { getLlmModel } from '@/modules/core/registry';

export const runtime = 'nodejs';

/**
 * GET /api/usage/breakdown?days=30 — dashboard monitoring pemakaian:
 * rincian PER CHATBOT + tren harian (sumber: audit_logs chat.turn, RLS
 * tenant). `price` = harga model LLM aktif dari registry (USD/1M token)
 * bila tersedia — utk estimasi biaya di UI; null bila registry tak
 * mencantumkan harga provider itu.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  const days = Math.min(Math.max(Number(req.nextUrl.searchParams.get('days')) || 30, 1), 90);

  const [breakdown, settings] = await Promise.all([
    usageService.breakdown(user.tenantId, days),
    withTenant(user.tenantId, async (tx) =>
      (await tx.select({ model: tenantSettings.activeLlmModel })
        .from(tenantSettings).where(eq(tenantSettings.tenantId, user.tenantId)).limit(1))[0] ?? null),
  ]);

  const model = settings?.model ?? null;
  const price = model ? getLlmModel(model)?.price ?? null : null;
  return NextResponse.json({ days, model, price, ...breakdown });
}
