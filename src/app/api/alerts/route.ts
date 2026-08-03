import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/modules/core/auth';
import { riwayatPeringatan } from '@/modules/core/alerts';
import { alertChannelService } from '@/modules/integrations/alert-channels.service';
import { ensureIntegrations } from '../_wire';

export const runtime = 'nodejs';

/**
 * GET  /api/alerts — saluran peringatan tenant + riwayat terakhir.
 * PATCH/POST — simpan saluran / kirim uji.
 *
 * RIWAYATNYA IKUT DI SINI, bukan endpoint terpisah. Peringatan yang hanya
 * lewat sebagai notifikasi tak bisa ditelusuri seminggu kemudian, saat orang
 * bertanya "sejak kapan ini rusak?" — dan pertanyaan itu selalu datang
 * bersama pertanyaan "kenapa aku tak diberi tahu?", yang dijawab bagian
 * saluran. Memisahkannya menjadi dua permintaan hanya memaksa UI menyatukan
 * kembali apa yang memang satu layar.
 */
export async function GET() {
  const user = await getCurrentUser();
  const [saluran, riwayat] = await Promise.all([
    alertChannelService.baca(user.tenantId),
    riwayatPeringatan(user.tenantId, 200),
  ]);
  return NextResponse.json({ saluran, riwayat });
}

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  const body = await req.json().catch(() => ({}));
  try {
    const saluran = await alertChannelService.simpan(
      { id: user.id, tenantId: user.tenantId },
      {
        email: body.email,
        /* `undefined` sengaja diteruskan apa adanya: ia berarti "jangan
           sentuh", sementara string kosong berarti "cabut". Menormalkannya
           jadi satu nilai di sini akan membuat setiap penyimpanan form tanpa
           mengetik ulang URL diam-diam mencabut Slack. */
        slackUrl: body.slackUrl,
        minLevel: body.minLevel,
      },
    );
    return NextResponse.json(saluran);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

/** POST = kirim peringatan uji lewat saluran yang tersimpan. */
export async function POST() {
  const user = await getCurrentUser();
  /* Uji harus melewati JALUR YANG SAMA dengan peringatan sungguhan, termasuk
     langganan bus-nya — kalau tidak, ia bisa lulus sementara jalur aslinya
     tak pernah terpasang. */
  ensureIntegrations();
  const hasil = await alertChannelService.uji(user.tenantId);
  return NextResponse.json(hasil);
}
