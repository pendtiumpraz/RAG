import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/modules/core/auth';
import { billingService, planCatalog } from '@/modules/usage/billing.service';
import { platformSettingsService } from '@/modules/payments/platform-settings.service';
import { paymentGatewayService } from '@/modules/payments/payment-gateway.service';

export const runtime = 'nodejs';

/**
 * GET /api/billing — plan tenant saat ini, pemakaian nyata vs kuota, dan
 * katalog plan. Dipakai halaman Billing tenant.
 */
export async function GET() {
  const user = await getCurrentUser();
  const b = await billingService.forTenant(user.tenantId);
  const num = (n: number) => (n === Infinity ? null : n);
  return NextResponse.json({
    plan: b.plan,
    planOnPaper: b.planOnPaper,
    planExpiresAt: b.planExpiresAt,
    expired: b.expired,
    isPlatform: b.isPlatform,
    usage: {
      messages: b.messages, tokensIn: b.tokensIn, tokensOut: b.tokensOut,
      members: b.members, chatbots: b.chatbots,
    },
    limits: {
      messagesPerMonth: num(b.limits.messagesPerMonth),
      maxChatbots: num(b.limits.maxChatbots),
      maxMembers: num(b.limits.maxMembers),
    },
    plans: planCatalog(),
    // D12 — dipakai UI: on-prem = seluruh bagian pembayaran disembunyikan.
    payment: await (async () => {
      const cfg = await platformSettingsService.get();
      const gw = cfg.deploymentMode === 'saas' ? await paymentGatewayService.getActive() : null;
      return {
        enabled: cfg.deploymentMode === 'saas' && !!gw,
        mode: cfg.deploymentMode,
        planPrices: cfg.planPrices,
      };
    })(),
  });
}
