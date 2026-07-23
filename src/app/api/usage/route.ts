import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/modules/core/auth';
import { usageService } from '@/modules/usage/usage.service';

export const runtime = 'nodejs';

/** GET /api/usage — plan, limit, dan pemakaian periode berjalan (dashboard). */
export async function GET() {
  const user = await getCurrentUser();
  const s = await usageService.snapshot(user.tenantId);
  return NextResponse.json({
    plan: s.plan,
    period: s.period,
    messages: { used: s.messages, limit: s.limits.messagesPerMonth === Infinity ? null : s.limits.messagesPerMonth },
    tokens: { in: s.tokensIn, out: s.tokensOut },
    maxChatbots: s.limits.maxChatbots === Infinity ? null : s.limits.maxChatbots,
  });
}
