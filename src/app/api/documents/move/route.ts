import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/modules/core/auth';
import { knowledgeService } from '@/modules/knowledge/knowledge.service';
import { ValidationError } from '@/modules/chatbot/chatbot.service';

export const runtime = 'nodejs';

/**
 * POST /api/documents/move — pindahkan satu dokumen ke knowledge base lain.
 *
 * Body: { docRef, dariKbId, keKbId }.
 *
 * Menolak dokumen yang dimiliki sumber tersinkron BERULANG, dan alasannya
 * dijelaskan di layanannya: sync berikutnya akan menyerapnya kembali ke KB
 * asal, jadi pemindahan itu batal sendiri tanpa satu pun galat.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  const body = await req.json().catch(() => ({}));
  try {
    const hasil = await knowledgeService.pindahDokumen(
      { id: user.id, tenantId: user.tenantId },
      { docRef: body.docRef, dariKbId: body.dariKbId, keKbId: body.keKbId },
    );
    return NextResponse.json(hasil);
  } catch (e) {
    /* 422, bukan 500: seluruh penolakan di jalur ini adalah keadaan yang
       DIHARAPKAN (sumber berulang, nama bentrok, KB tujuan hilang), dan
       melaporkannya sebagai galat server akan membuatnya masuk ke pemantauan
       sebagai kerusakan — lalu ditelusuri orang yang mengira ada bug. */
    const status = e instanceof ValidationError ? 422 : 500;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}
