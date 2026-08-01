import { NextResponse } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { db, chatbots } from '@/modules/core/db';
import { demoService } from '@/modules/core/demo.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/demo — PUBLIK: apakah landing boleh menampilkan demo sekarang?
 *
 * Dipanggil halaman depan tanpa sesi. Yang dikembalikan cuma kunci publik
 * chatbot demo dan boleh-tidaknya ia dipakai — kunci itu memang dirancang
 * untuk disebar. Sisa kuota, jumlah terpakai, dan tenant pemiliknya TIDAK
 * ikut: pengunjung tak bisa berbuat apa-apa dengan angka itu, sementara
 * menyebutkannya memberi tahu penyerang persis berapa permintaan yang
 * diperlukan untuk mematikan demo bulan berikutnya.
 */
export async function GET() {
  const p = await demoService.pengaturan();
  if (!p.chatbotId) return NextResponse.json({ aktif: false });

  const rows = await db.select({ publicKey: chatbots.publicKey, tenantId: chatbots.tenantId })
    .from(chatbots)
    .where(and(eq(chatbots.id, p.chatbotId), eq(chatbots.enabled, true), isNull(chatbots.deletedAt)))
    .limit(1);
  const bot = rows[0];
  if (!bot) return NextResponse.json({ aktif: false });

  const status = await demoService.status(bot.tenantId);
  return NextResponse.json(
    status.boleh
      ? { aktif: true, publicKey: bot.publicKey }
      : { aktif: false, pesan: status.pesan },
    { headers: { 'Cache-Control': 'public, max-age=60' } },
  );
}
