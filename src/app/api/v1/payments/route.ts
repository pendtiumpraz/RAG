import { NextResponse } from 'next/server';
import { z } from 'zod';
import { paymentService } from '@/modules/payments/payment.service';
import { ValidationError } from '@/modules/chatbot/chatbot.service';
import { apiRoute } from '../_guard';
import { tenantOwner } from '../_actor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  plan: z.enum(['pro', 'enterprise']),
  months: z.number().int().min(1).max(12).default(1),
  interval: z.enum(['monthly', 'yearly']).optional(),
  method: z.string().regex(/^[A-Z0-9]{2,20}$/).optional(),
});

/**
 * POST /api/v1/payments — buat tagihan QRIS (scope write) dan LANGSUNG balikan
 * {id, qrString, qrImageUrl} dalam satu respons (B6). Beda dari POST
 * /api/payments session yang cuma balik {id}; di sini createQris sudah
 * mengembalikan QR sekaligus.
 */
export const POST = apiRoute('write', async (req, _ctx, caller) => {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'plan & months tidak valid' }, { status: 400 });
  }
  const owner = await tenantOwner(caller.tenantId);
  if (!owner) return NextResponse.json({ error: 'Tenant tak punya admin aktif.' }, { status: 409 });

  try {
    const r = await paymentService.createQris(
      caller.tenantId, owner.id, owner.email,
      parsed.data.plan, parsed.data.months, parsed.data.interval, parsed.data.method);
    return NextResponse.json(r, { status: 201 });
  } catch (e) {
    // Mode on-premise = pembayaran mati → 409, bukan 422 generik apiRoute.
    if (e instanceof ValidationError && e.message.includes('on-premise')) {
      return NextResponse.json({ error: e.message }, { status: 409 });
    }
    throw e;
  }
});
