import { NextResponse } from 'next/server';
import { z } from 'zod';
import { superadminRoute } from '../../_guard';
import { testTripayConnection } from '@/modules/payments/payment.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Uji koneksi TriPay per-env (SUPERADMIN). Mengecek kredensial + channel QRIS
 * lewat GET /merchant/payment-channel — tanpa membuat transaksi. Yang diuji
 * adalah env yang SUDAH tersimpan; rahasia tak pernah dikirim ke browser.
 */
const Body = z.object({ env: z.enum(['sandbox', 'production']) });

export const POST = superadminRoute(async (req) => {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Input tidak valid' }, { status: 400 });
  }
  return NextResponse.json(await testTripayConnection(parsed.data.env));
});
