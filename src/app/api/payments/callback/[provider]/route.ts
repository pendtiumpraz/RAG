import { NextRequest, NextResponse } from 'next/server';
import { paymentService } from '@/modules/payments/payment.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/payments/callback/{midtrans|tripay|xendit} — webhook gateway.
 *
 * PUBLIK tanpa sesi: otentikasinya VERIFIKASI SIGNATURE per provider di
 * service (Midtrans sha512 order+status+amount+serverKey · Tripay HMAC raw
 * body dgn private key · Xendit x-callback-token). Signature gagal = 403 —
 * body TIDAK diproses sedikit pun. Balasan selalu cepat & idempotent
 * (gateway mengirim ulang bila non-2xx).
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  const raw = await req.text();

  let result: { ok: boolean };
  try {
    if (provider === 'midtrans') {
      result = await paymentService.handleMidtransCallback(JSON.parse(raw));
    } else if (provider === 'tripay') {
      result = await paymentService.handleTripayCallback(raw, req.headers.get('x-callback-signature'));
    } else if (provider === 'xendit') {
      result = await paymentService.handleXenditCallback(JSON.parse(raw), req.headers.get('x-callback-token'));
    } else {
      return NextResponse.json({ error: 'provider tidak dikenal' }, { status: 404 });
    }
  } catch {
    return NextResponse.json({ error: 'payload tidak valid' }, { status: 400 });
  }

  if (!result.ok) return NextResponse.json({ error: 'signature tidak valid' }, { status: 403 });
  return NextResponse.json({ ok: true });
}
