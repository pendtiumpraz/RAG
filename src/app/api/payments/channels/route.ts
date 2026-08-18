import { NextResponse } from 'next/server';
import { requireRole } from '@/modules/core/auth';
import { paymentGatewayService } from '@/modules/payments/payment-gateway.service';
import { fetchTripayChannels } from '@/modules/payments/payment.service';

export const runtime = 'nodejs';

/**
 * GET /api/payments/channels — daftar channel/metode pembayaran AKTIF dari
 * gateway aktif (TriPay), untuk modal "Metode pembayaran" di UI. Admin/
 * superadmin tenant. Bentuk mengikuti spesifikasi: { code, name, group,
 * icon_url, fee_customer }. Gateway non-tripay → daftar kosong (UI jatuh ke
 * QRIS default); belum ada gateway aktif → 503 jujur.
 */
export async function GET() {
  await requireRole('superadmin', 'admin');
  const gw = await paymentGatewayService.getActive();
  if (!gw) {
    return NextResponse.json(
      { success: false, error: 'Belum ada gateway pembayaran aktif', channels: [] },
      { status: 503 });
  }
  const channels = await fetchTripayChannels(gw);
  return NextResponse.json({ success: true, channels });
}
