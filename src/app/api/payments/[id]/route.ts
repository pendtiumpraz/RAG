import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/modules/core/auth';
import { paymentService } from '@/modules/payments/payment.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/payments/:id — status utk halaman bayar (poll ±3 dtk).
 *  Saat pending juga menarik status ke provider (pelindung webhook telat). */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  const { id } = await ctx.params;
  const p = await paymentService.get(user.tenantId, id);
  if (!p) return NextResponse.json({ error: 'Transaksi tidak ditemukan' }, { status: 404 });
  return NextResponse.json(p);
}
