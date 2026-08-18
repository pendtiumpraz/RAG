import { createHash, createHmac, randomUUID } from 'node:crypto';
import { and, eq, isNull, desc, sql } from 'drizzle-orm';
import { db, payments, tenants } from '@/modules/core/db';
import { withTenant } from '@/modules/core/db/tenant-context';
import { audit } from '@/modules/core/guardrails';
import { ValidationError } from '@/modules/chatbot/chatbot.service';
import { platformSettingsService, yearlyPlanPrice } from './platform-settings.service';
import { paymentGatewayService, type GatewayConfig, type PaymentProvider } from './payment-gateway.service';

/**
 * ALUR PEMBAYARAN QRIS (D12) — create → tampil di halaman KITA → callback
 * ter-verifikasi signature → plan aktif.
 *
 * Halaman bayar milik sendiri: adapter mengembalikan `qrString` (payload
 * QRIS) yang digambar di /billing/pay/[id] — TIDAK redirect ke gateway.
 * Webhook = endpoint publik; otentikasinya signature per provider, BUKAN
 * sesi. Setelah lolos, penulisan lintas-tenant lewat GUC platform_admin
 * (policy payments_platform_admin_all, migrasi 0019).
 */

const QR_EXPIRY_MIN = 30;

interface ChargeResult {
  providerRef: string;
  qrString: string | null;
  qrImageUrl: string | null;
  expiresAt: Date;
}

function withPlatformAdmin<T>(fn: (tx: typeof db) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.admin_context', 'platform_admin', true)`);
    return fn(tx as unknown as typeof db);
  });
}

/* ── adapter per provider ─────────────────────────────────────────── */

async function chargeMidtrans(gw: GatewayConfig, ref: string, amount: number): Promise<ChargeResult> {
  const base = gw.publicConfig.sandbox ? 'https://api.sandbox.midtrans.com' : 'https://api.midtrans.com';
  const res = await fetch(`${base}/v2/charge`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json', Accept: 'application/json',
      Authorization: 'Basic ' + Buffer.from(`${gw.secrets.serverKey}:`).toString('base64'),
    },
    body: JSON.stringify({
      payment_type: 'qris',
      transaction_details: { order_id: ref, gross_amount: amount },
      qris: { acquirer: 'gopay' },
      custom_expiry: { expiry_duration: QR_EXPIRY_MIN, unit: 'minute' },
    }),
  });
  const j = await res.json();
  if (!res.ok || !['200', '201'].includes(String(j.status_code))) {
    throw new ValidationError(`Midtrans menolak: ${j.status_message ?? res.status}`);
  }
  const qrAction = (j.actions as Array<{ name: string; url: string }> | undefined)
    ?.find((a) => a.name === 'generate-qr-code');
  return {
    providerRef: ref,
    qrString: j.qr_string ?? null,
    qrImageUrl: qrAction?.url ?? null,
    expiresAt: new Date(Date.now() + QR_EXPIRY_MIN * 60_000),
  };
}

async function chargeTripay(gw: GatewayConfig, ref: string, amount: number, plan: string, email: string): Promise<ChargeResult> {
  const path = gw.publicConfig.sandbox ? '/api-sandbox' : '/api';
  // proxyUrl opsional: teruskan lewat VPS ber-IP statis agar TriPay melihat IP
  // tetap, bukan IP dinamis Vercel. Proxy meneruskan path yang sama ke TriPay.
  const proxyUrl = typeof gw.publicConfig.proxyUrl === 'string' ? gw.publicConfig.proxyUrl.trim() : '';
  const base = proxyUrl ? proxyUrl.replace(/\/+$/, '') + path : `https://tripay.co.id${path}`;
  const merchantCode = String(gw.publicConfig.merchantCode ?? '');
  const signature = createHmac('sha256', gw.secrets.privateKey ?? '')
    .update(merchantCode + ref + amount).digest('hex');
  const res = await fetch(`${base}/transaction/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${gw.secrets.apiKey}` },
    body: JSON.stringify({
      method: 'QRIS', merchant_ref: ref, amount,
      customer_name: 'Tenant Nalar', customer_email: email,
      order_items: [{ name: `Nalar plan ${plan}`, price: amount, quantity: 1 }],
      expired_time: Math.floor(Date.now() / 1000) + QR_EXPIRY_MIN * 60,
      signature,
    }),
  });
  const j = await res.json();
  if (!res.ok || !j.success) throw new ValidationError(`Tripay menolak: ${j.message ?? res.status}`);
  return {
    providerRef: ref,
    qrString: j.data.qr_string ?? null,
    qrImageUrl: j.data.qr_url ?? null,
    expiresAt: new Date((j.data.expired_time ?? 0) * 1000 || Date.now() + QR_EXPIRY_MIN * 60_000),
  };
}

async function chargeXendit(gw: GatewayConfig, ref: string, amount: number): Promise<ChargeResult> {
  const res = await fetch('https://api.xendit.co/qr_codes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json', 'api-version': '2022-07-31',
      Authorization: 'Basic ' + Buffer.from(`${gw.secrets.secretKey}:`).toString('base64'),
    },
    body: JSON.stringify({
      reference_id: ref, type: 'DYNAMIC', currency: 'IDR', amount,
      expires_at: new Date(Date.now() + QR_EXPIRY_MIN * 60_000).toISOString(),
    }),
  });
  const j = await res.json();
  if (!res.ok) throw new ValidationError(`Xendit menolak: ${j.message ?? res.status}`);
  return {
    providerRef: ref,
    qrString: j.qr_string ?? null,
    qrImageUrl: null,
    expiresAt: new Date(Date.now() + QR_EXPIRY_MIN * 60_000),
  };
}

/* ── aktivasi plan ────────────────────────────────────────────────── */

/** Idempotent: dipanggil webhook (bisa dobel) & poll — hanya transisi
 *  pending→paid yang mengaktifkan plan. Masa aktif MEMPERPANJANG sisa
 *  langganan berjalan, bukan menimpanya. */
async function markPaid(provider: PaymentProvider, providerRef: string, raw: unknown): Promise<boolean> {
  return withPlatformAdmin(async (tx) => {
    const p = (await tx.select().from(payments).where(and(
      eq(payments.provider, provider), eq(payments.providerRef, providerRef),
      isNull(payments.deletedAt))).limit(1))[0];
    if (!p || p.status === 'paid') return false;

    await tx.update(payments).set({
      status: 'paid', paidAt: new Date(), rawCallback: raw as Record<string, unknown>,
      updatedAt: new Date(),
    }).where(eq(payments.id, p.id));

    const t = (await tx.select().from(tenants).where(eq(tenants.id, p.tenantId)).limit(1))[0];
    const from = t?.planExpiresAt && t.planExpiresAt > new Date() && t.plan === p.plan
      ? t.planExpiresAt : new Date();
    const until = new Date(from.getTime() + p.months * 30 * 86_400_000);
    await tx.update(tenants).set({ plan: p.plan, planExpiresAt: until, updatedAt: new Date() })
      .where(eq(tenants.id, p.tenantId));

    await audit(p.tenantId, 'system', 'payment.paid', p.id,
      { provider, plan: p.plan, months: p.months, amount: p.amount, activeUntil: until.toISOString() });
    return true;
  });
}

async function markStatus(provider: PaymentProvider, providerRef: string, status: 'expired' | 'failed', raw: unknown): Promise<void> {
  await withPlatformAdmin(async (tx) => {
    await tx.update(payments).set({ status, rawCallback: raw as Record<string, unknown>, updatedAt: new Date() })
      .where(and(eq(payments.provider, provider), eq(payments.providerRef, providerRef),
        eq(payments.status, 'pending'), isNull(payments.deletedAt)));
  });
}

/* ── API service ──────────────────────────────────────────────────── */

export const paymentService = {
  /**
   * Buat tagihan QRIS. Mode onprem = pembayaran mati (409 di route).
   *
   * `interval` (opsional) menang atas `months`:
   *  'monthly' → 1 bulan, harga bulanan penuh.
   *  'yearly'  → 12 bulan, harga bulanan ×12 −20% (yearlyPlanPrice).
   * Tanpa `interval`, perilaku lama utuh: months bebas, amount = harga×months
   * (dipakai pemanggil lama `{plan, months}`).
   */
  async createQris(tenantId: string, userId: string, email: string, plan: string, months: number, interval?: 'monthly' | 'yearly') {
    const cfg = await platformSettingsService.get();
    if (cfg.deploymentMode !== 'saas') throw new ValidationError('Pembayaran nonaktif pada mode on-premise');
    const price = cfg.planPrices[plan];
    if (!price) throw new ValidationError(`Plan tidak dikenal: ${plan}`);
    let m = Math.min(Math.max(Math.trunc(months), 1), 12);
    let amount = price * m;
    if (interval === 'yearly') { m = 12; amount = yearlyPlanPrice(price); }
    else if (interval === 'monthly') { m = 1; amount = price; }

    const gw = await paymentGatewayService.getActive();
    if (!gw) throw new ValidationError('Belum ada gateway pembayaran aktif — hubungi pengelola');

    // Order id unik & pendek — dibuat LEBIH DULU dari uuid baru, bukan dari
    // row.id: mencegah tumbukan pada unique (provider, provider_ref).
    // Sebelumnya provider_ref diisi 'init' untuk SEMUA payment, lalu diganti
    // setelah charge — dan karena ada uq_payments_provider_ref (partial,
    // deleted_at IS NULL), dua percobaan bayar yang belum selesai bentrok
    // ('init' duplikat) → 23505 → HTTP 500.
    const ref = `NLR-${randomUUID().replace(/-/g, '').slice(0, 20)}`;

    const row = await withTenant(tenantId, async (tx) =>
      (await tx.insert(payments).values({
        tenantId, userId, plan, months: m, amount,
        provider: gw.provider, providerRef: ref,
      }).returning())[0]);
    let charge: ChargeResult;
    try {
      charge = gw.provider === 'midtrans' ? await chargeMidtrans(gw, ref, amount)
        : gw.provider === 'tripay' ? await chargeTripay(gw, ref, amount, plan, email)
        : await chargeXendit(gw, ref, amount);
    } catch (e) {
      await withTenant(tenantId, (tx) => tx.update(payments)
        .set({ status: 'failed', updatedAt: new Date() }).where(eq(payments.id, row.id)));
      throw e;
    }

    await withTenant(tenantId, (tx) => tx.update(payments).set({
      providerRef: charge.providerRef, qrString: charge.qrString,
      qrImageUrl: charge.qrImageUrl, expiresAt: charge.expiresAt, updatedAt: new Date(),
    }).where(eq(payments.id, row.id)));

    await audit(tenantId, userId, 'payment.created', row.id, { provider: gw.provider, plan, months: m, amount });
    return { id: row.id };
  },

  /** Status utk halaman bayar (poll). Bila masih pending & bukan xendit,
   *  tarik status langsung ke provider — pelindung saat webhook terlewat. */
  async get(tenantId: string, id: string) {
    const p = await withTenant(tenantId, async (tx) =>
      (await tx.select().from(payments).where(and(
        eq(payments.id, id), isNull(payments.deletedAt))).limit(1))[0] ?? null);
    if (!p) return null;

    if (p.status === 'pending' && p.expiresAt && p.expiresAt < new Date()) {
      await markStatus(p.provider as PaymentProvider, p.providerRef, 'expired', { reason: 'timeout' });
      p.status = 'expired';
    } else if (p.status === 'pending') {
      const fresh = await pullStatus(p.provider as PaymentProvider, p.providerRef);
      if (fresh === 'paid') { await markPaid(p.provider as PaymentProvider, p.providerRef, { via: 'poll' }); p.status = 'paid'; }
      else if (fresh) { await markStatus(p.provider as PaymentProvider, p.providerRef, fresh, { via: 'poll' }); p.status = fresh; }
    }
    return {
      id: p.id, plan: p.plan, months: p.months, amount: p.amount,
      provider: p.provider, status: p.status,
      qrString: p.qrString, qrImageUrl: p.qrImageUrl,
      expiresAt: p.expiresAt, paidAt: p.paidAt, createdAt: p.createdAt,
    };
  },

  list(tenantId: string) {
    return withTenant(tenantId, (tx) =>
      tx.select({
        id: payments.id, plan: payments.plan, months: payments.months,
        amount: payments.amount, provider: payments.provider,
        status: payments.status, createdAt: payments.createdAt, paidAt: payments.paidAt,
      }).from(payments).where(isNull(payments.deletedAt))
        .orderBy(desc(payments.createdAt)).limit(50));
  },

  /* — webhook per provider: verifikasi signature = otentikasinya — */

  async handleMidtransCallback(body: Record<string, unknown>): Promise<{ ok: boolean }> {
    const gw = await paymentGatewayService.get('midtrans');
    if (!gw) return { ok: false };
    const expect = createHash('sha512')
      .update(String(body.order_id) + String(body.status_code) + String(body.gross_amount) + (gw.secrets.serverKey ?? ''))
      .digest('hex');
    if (expect !== body.signature_key) return { ok: false };

    const st = String(body.transaction_status);
    const ref = String(body.order_id);
    if (st === 'settlement' || (st === 'capture' && body.fraud_status !== 'deny')) await markPaid('midtrans', ref, body);
    else if (st === 'expire') await markStatus('midtrans', ref, 'expired', body);
    else if (['deny', 'cancel', 'failure'].includes(st)) await markStatus('midtrans', ref, 'failed', body);
    return { ok: true };
  },

  async handleTripayCallback(rawBody: string, signatureHeader: string | null): Promise<{ ok: boolean }> {
    // TriPay sandbox & production punya privateKey berbeda; callback bisa dari
    // env manapun yang punya tagihan pending. Verifikasi terhadap SEMUA
    // privateKey non-kosong — key kosong dibuang agar tak jadi celah forge.
    const envs = await paymentGatewayService.getTripayEnvs();
    if (!envs) return { ok: false };
    const keys = [envs.envs.production.privateKey, envs.envs.sandbox.privateKey]
      .filter((k): k is string => !!k && k.length > 0);
    if (!signatureHeader || keys.length === 0) return { ok: false };
    const ok = keys.some((k) => createHmac('sha256', k).update(rawBody).digest('hex') === signatureHeader);
    if (!ok) return { ok: false };

    const body = JSON.parse(rawBody) as Record<string, unknown>;
    const ref = String(body.merchant_ref);
    const st = String(body.status);
    if (st === 'PAID') await markPaid('tripay', ref, body);
    else if (st === 'EXPIRED') await markStatus('tripay', ref, 'expired', body);
    else if (['FAILED', 'REFUND'].includes(st)) await markStatus('tripay', ref, 'failed', body);
    return { ok: true };
  },

  async handleXenditCallback(body: Record<string, unknown>, callbackToken: string | null): Promise<{ ok: boolean }> {
    const gw = await paymentGatewayService.get('xendit');
    if (!gw) return { ok: false };
    if (!callbackToken || callbackToken !== gw.secrets.callbackToken) return { ok: false };

    const data = (body.data ?? body) as Record<string, unknown>;
    const ref = String(data.reference_id ?? '');
    if (!ref) return { ok: true };
    if (body.event === 'qr.payment' || data.status === 'SUCCEEDED') await markPaid('xendit', ref, body);
    return { ok: true };
  },
};

/** Tarik status langsung ke provider (fallback bila webhook belum tiba). */
async function pullStatus(provider: PaymentProvider, ref: string): Promise<'paid' | 'expired' | 'failed' | null> {
  try {
    if (provider === 'midtrans') {
      const gw = await paymentGatewayService.get('midtrans');
      if (!gw) return null;
      const base = gw.publicConfig.sandbox ? 'https://api.sandbox.midtrans.com' : 'https://api.midtrans.com';
      const r = await fetch(`${base}/v2/${ref}/status`, {
        headers: { Accept: 'application/json', Authorization: 'Basic ' + Buffer.from(`${gw.secrets.serverKey}:`).toString('base64') },
      });
      const j = await r.json();
      const st = String(j.transaction_status);
      if (st === 'settlement' || st === 'capture') return 'paid';
      if (st === 'expire') return 'expired';
      if (['deny', 'cancel', 'failure'].includes(st)) return 'failed';
      return null;
    }
    // tripay & xendit: cek-status mereka butuh reference internal provider,
    // bukan merchant_ref kita — cukup webhook + kedaluwarsa lokal.
    return null;
  } catch { return null; }
}
