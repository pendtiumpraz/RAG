import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/modules/core/auth';
import { paymentService } from '@/modules/payments/payment.service';
import { platformSettingsService } from '@/modules/payments/platform-settings.service';
import { bisaDicetak, nomorKuitansi, uraian } from '@/modules/payments/kuitansi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/payments/:id/kuitansi — data kuitansi satu transaksi.
 *
 * Transaksi diambil lewat `paymentService.get()` yang berjalan di dalam
 * withTenant(), jadi transaksi tenant lain tak terbaca sekalipun id-nya
 * ditebak dengan benar.
 *
 * Menolak transaksi yang BELUM lunas dengan 409, bukan menerbitkan kuitansi
 * bertuliskan "pending": kuitansi adalah bukti terima uang, dan pelanggan
 * akan memakainya persis sebagai itu.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  const { id } = await ctx.params;

  const p = await paymentService.get(user.tenantId, id);
  if (!p) return NextResponse.json({ error: 'Transaksi tidak ditemukan' }, { status: 404 });
  if (!bisaDicetak(p.status)) {
    return NextResponse.json(
      { error: 'Kuitansi hanya terbit untuk transaksi yang sudah lunas.', status: p.status },
      { status: 409 },
    );
  }

  const cfg = await platformSettingsService.get();
  return NextResponse.json({
    nomor: nomorKuitansi(p),
    uraian: uraian(p.plan, p.months),
    amount: p.amount,
    plan: p.plan,
    months: p.months,
    provider: p.provider,
    paidAt: p.paidAt,
    // null = superadmin belum mengisinya. Halaman kuitansi mengatakannya apa
    // adanya alih-alih mencetak baris kosong yang terlihat seperti kerusakan.
    penerbit: cfg.billingIdentity,
  });
}
