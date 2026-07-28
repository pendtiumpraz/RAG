import { NextResponse } from 'next/server';
import { count, isNull } from 'drizzle-orm';
import { getCurrentUser } from '@/modules/core/auth';
import { usageService } from '@/modules/usage/usage.service';
import { withTenant } from '@/modules/core/db/tenant-context';
import { chatbots } from '@/modules/core/db';
import { platformSettingsService } from '@/modules/payments/platform-settings.service';
import { paymentGatewayService } from '@/modules/payments/payment-gateway.service';
import { PLAN_FEATURES, FEATURE_MIN_PLAN } from '@/modules/core/limits';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/entitlements — SATU sumber kebenaran "boleh apa" (D14).
 *
 * Dipakai sidebar (gembok pada menu), guard tiap halaman premium, dan
 * layar onboarding. Ditaruh di satu endpoint supaya UI tak pernah
 * menebak-nebak dari plan sendiri — penegakan sebenarnya tetap di server
 * pada tiap service.
 *
 * Mode on-premise: SEMUA fitur terbuka & pembayaran mati (D12).
 */
export async function GET() {
  const user = await getCurrentUser();
  const [snap, cfg] = await Promise.all([
    usageService.snapshot(user.tenantId),
    platformSettingsService.get(),
  ]);
  const onprem = cfg.deploymentMode === 'onprem';
  const plan = onprem ? 'onprem' : snap.plan;
  const gw = onprem ? null : await paymentGatewayService.getActive();

  // Layar pilih-paket hanya untuk yang BENAR-BENAR baru: masih Free dan
  // belum punya satu chatbot pun. Orang yang sudah mulai bekerja tak
  // diganggu tiap login (dan on-prem tak pernah melihatnya sama sekali).
  const botCount = onprem ? 1 : Number((await withTenant(user.tenantId, (tx) =>
    tx.select({ n: count() }).from(chatbots).where(isNull(chatbots.deletedAt))))[0]?.n ?? 0);

  return NextResponse.json({
    shouldOnboard: !onprem && plan === 'free' && botCount === 0,
    plan,
    planOnPaper: snap.planOnPaper,
    expired: snap.expired,
    planExpiresAt: snap.planExpiresAt,
    features: PLAN_FEATURES[plan] ?? [],
    featureMinPlan: FEATURE_MIN_PLAN,
    /** true = ada yang bisa dibeli (SaaS + gateway aktif) */
    canUpgrade: !onprem && !!gw,
    mode: cfg.deploymentMode,
    planPrices: cfg.planPrices,
    usage: {
      messages: snap.messages,
      messagesLimit: snap.limits.messagesPerMonth === Infinity ? null : snap.limits.messagesPerMonth,
    },
  });
}
