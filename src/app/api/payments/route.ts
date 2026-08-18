import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole, getCurrentUser } from '@/modules/core/auth';
import { paymentService } from '@/modules/payments/payment.service';
import { ValidationError } from '@/modules/chatbot/chatbot.service';

export const runtime = 'nodejs';

/** GET /api/payments — riwayat transaksi tenant (RLS). */
export async function GET() {
  const user = await getCurrentUser();
  return NextResponse.json(await paymentService.list(user.tenantId));
}

const Body = z.object({
  plan: z.enum(['pro', 'enterprise']),
  months: z.number().int().min(1).max(12).default(1),
  /** Menang atas months bila diisi: monthly=1 bln, yearly=12 bln −20%. */
  interval: z.enum(['monthly', 'yearly']).optional(),
});

/** POST /api/payments — buat tagihan QRIS (admin tenant). 409 saat on-prem. */
export async function POST(req: NextRequest) {
  const user = await requireRole('superadmin', 'admin');
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'plan & months tidak valid' }, { status: 400 });
  try {
    // email hanya dipakai Tripay sbg identitas pelanggan di dashboard mereka
    const r = await paymentService.createQris(
      user.tenantId, user.id, 'billing@nalar.tenant', parsed.data.plan, parsed.data.months, parsed.data.interval);
    return NextResponse.json(r, { status: 201 });
  } catch (e) {
    if (e instanceof ValidationError) {
      const s = e.message.includes('on-premise') ? 409 : 422;
      return NextResponse.json({ error: e.message }, { status: s });
    }
    throw e;
  }
}
