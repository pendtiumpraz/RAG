import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/modules/core/auth';
import { AksesDitolakError, chatbotService, ValidationError } from '@/modules/chatbot/chatbot.service';
import { divisionService } from '@/modules/settings/division.service';
import { CONTOH_TANDA_TANGAN } from '@/modules/chat/contoh-tanda-tangan';

export const runtime = 'nodejs';

const Body = z.object({ nyala: z.boolean() });

/**
 * POST /api/chatbots/{id}/visitor-secret — nyalakan / putar / matikan rahasia
 * identitas pengunjung.
 *
 * Rahasianya dikembalikan SATU KALI di sini dan tak pernah bisa dibaca lagi;
 * sesudah ini ia hanya ada terenkripsi. Menyimpannya agar bisa dilihat ulang
 * berarti seluruh riwayat pelanggan bergantung pada satu layar dasbor yang
 * bisa dibuka siapa pun yang sempat duduk di kursi yang salah.
 *
 * Contoh kode ikut dikirim supaya orang yang baru menyalakannya tak perlu
 * mencari ke halaman lain sambil memegang rahasia yang cuma tampil sekali.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireRole('superadmin', 'admin');
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'nyala wajib boolean' }, { status: 400 });
  try {
    const hasil = await chatbotService.setRahasiaPengunjung(
      user.tenantId, await divisionService.aktor(user), id, parsed.data.nyala);
    return NextResponse.json({ ...hasil, contoh: CONTOH_TANDA_TANGAN });
  } catch (e) {
    if (e instanceof AksesDitolakError) return NextResponse.json({ error: e.message }, { status: 403 });
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 404 });
    throw e;
  }
}
