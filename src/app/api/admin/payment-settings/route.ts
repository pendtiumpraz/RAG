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
  /* Identitas penerbit kuitansi. Semua kolom opsional dan boleh dikosongkan
     kembali — perusahaan bisa berganti alamat, dan memaksa isinya tetap
     terisi berarti memaksa data lama yang salah tetap tercetak. */
  billingIdentity: z.object({
    legalName: z.string().max(200).optional(),
    address: z.string().max(400).optional(),
    npwp: z.string().max(40).optional(),
    email: z.string().max(200).optional(),
    phone: z.string().max(60).optional(),
  }).optional(),
  /** simpan kredensial satu provider (secrets kosong = pertahankan).
   *  tripay: `env` menargetkan sandbox/production; env lain tak tersentuh. */
  gateway: z.object({
    provider: z.enum(['midtrans', 'tripay', 'xendit']),
    secrets: z.record(z.string()).optional(),
    publicConfig: z.record(z.union([z.string(), z.boolean()])).optional(),
    env: z.enum(['sandbox', 'production']).optional(),
  }).optional(),
  /** aktifkan SATU provider (menonaktifkan lainnya) */
  activate: z.enum(['midtrans', 'tripay', 'xendit']).optional(),
  /** tripay: pilih env aktif (sandbox/production) lalu aktifkan tripay */
  activateTripayEnv: z.enum(['sandbox', 'production']).optional(),
});

export const PUT = superadminRoute(async (req, _ctx, actor) => {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Input tidak valid' }, { status: 400 });
  }
  const { deploymentMode, planPrices, gateway, activate, activateTripayEnv, billingIdentity } = parsed.data;
  if (deploymentMode || planPrices || billingIdentity) {
    await platformSettingsService.update(actor, { deploymentMode, planPrices, billingIdentity });
  }
  if (gateway) {
    await paymentGatewayService.upsert(actor, gateway.provider as PaymentProvider, {
      secrets: gateway.secrets, publicConfig: gateway.publicConfig, env: gateway.env,
    });
  }
  if (activateTripayEnv) await paymentGatewayService.setTripayActiveEnv(actor, activateTripayEnv);
  else if (activate) await paymentGatewayService.setActive(actor, activate as PaymentProvider);
  return NextResponse.json({ ok: true });
});
