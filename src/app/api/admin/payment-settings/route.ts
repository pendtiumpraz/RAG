import { NextResponse } from 'next/server';
import { z } from 'zod';
import { superadminRoute } from '../_guard';
import { platformSettingsService } from '@/modules/payments/platform-settings.service';
import { paymentGatewayService, PAYMENT_PROVIDERS, type PaymentProvider } from '@/modules/payments/payment-gateway.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Pengaturan pembayaran & mode deploy — SUPERADMIN, semua di DATABASE (D12).
 * GET: mode + harga + status 3 gateway (tanpa secret) + URL callback yang
 * harus didaftarkan di dashboard masing-masing provider.
 */
export const GET = superadminRoute(async () => {
  const [cfg, gateways] = await Promise.all([
    platformSettingsService.get(), paymentGatewayService.list(),
  ]);
  const base = process.env.NEXTAUTH_URL ?? '';
  return NextResponse.json({
    ...cfg, gateways,
    callbackUrls: Object.fromEntries(PAYMENT_PROVIDERS.map((p) => [p, `${base}/api/payments/callback/${p}`])),
  });
});

const Body = z.object({
  deploymentMode: z.enum(['saas', 'onprem']).optional(),
  planPrices: z.record(z.number().int().positive()).optional(),
  /** simpan kredensial satu provider (secrets kosong = pertahankan) */
  gateway: z.object({
    provider: z.enum(['midtrans', 'tripay', 'xendit']),
    secrets: z.record(z.string()).optional(),
    publicConfig: z.record(z.union([z.string(), z.boolean()])).optional(),
  }).optional(),
  /** aktifkan SATU provider (menonaktifkan lainnya) */
  activate: z.enum(['midtrans', 'tripay', 'xendit']).optional(),
});

export const PUT = superadminRoute(async (req, _ctx, actor) => {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Input tidak valid' }, { status: 400 });
  }
  const { deploymentMode, planPrices, gateway, activate } = parsed.data;
  if (deploymentMode || planPrices) {
    await platformSettingsService.update(actor, { deploymentMode, planPrices });
  }
  if (gateway) {
    await paymentGatewayService.upsert(actor, gateway.provider as PaymentProvider, {
      secrets: gateway.secrets, publicConfig: gateway.publicConfig,
    });
  }
  if (activate) await paymentGatewayService.setActive(actor, activate as PaymentProvider);
  return NextResponse.json({ ok: true });
});
