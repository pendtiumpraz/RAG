import { NextResponse } from 'next/server';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { chatbotKnowledgeBases, documents, knowledgeBases } from '@/modules/core/db';
import { withTenant } from '@/modules/core/db/tenant-context';
import { getCurrentUser } from '@/modules/core/auth';
import { chatbotService } from '@/modules/chatbot/chatbot.service';
import { divisionService } from '@/modules/settings/division.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/graf — simpul & sisi peta pengetahuan tenant ini.
 *
 * Tak MENYIMPULKAN hubungan apa pun: sisinya adalah baris
 * `chatbot_knowledge_bases` apa adanya. Graf yang menyimpulkan hubungan akan
 * memajang garis yang tak pernah ada, dan orang mempercayainya justru karena
 * ia digambar.
 *
 * DISARING DIVISI. Chatbot yang tak boleh dilihat pemanggil tak boleh muncul
 * di peta — kalau tidak, graf jadi jalan memutar paling mudah untuk melihat
 * seluruh chatbot tenant, lengkap dengan nama dan pengetahuannya, tepat
 * setelah divisi dibangun untuk mencegah itu.
 */
export async function GET() {
  const user = await getCurrentUser();
  const aktor = await divisionService.aktor(user);
  const bolehLihat = await chatbotService.list(user.tenantId, aktor);
  const idBoleh = new Set(bolehLihat.map((c) => c.id));

  const data = await withTenant(user.tenantId, async (tx) => {
    const kb = await tx.select({
      id: knowledgeBases.id,
      nama: knowledgeBases.name,
      potongan: sql<number>`count(${documents.id})::int`,
    }).from(knowledgeBases)
      .leftJoin(documents, and(
        eq(documents.knowledgeBaseId, knowledgeBases.id),
        isNull(documents.deletedAt),
      ))
      .where(and(eq(knowledgeBases.tenantId, user.tenantId), isNull(knowledgeBases.deletedAt)))
      .groupBy(knowledgeBases.id, knowledgeBases.name);

    const sisi = await tx.select({
      chatbotId: chatbotKnowledgeBases.chatbotId,
      kbId: chatbotKnowledgeBases.knowledgeBaseId,
    }).from(chatbotKnowledgeBases)
      .where(and(
        eq(chatbotKnowledgeBases.tenantId, user.tenantId),
        isNull(chatbotKnowledgeBases.deletedAt),
      ));

    return { kb, sisi };
  });

  return NextResponse.json({
    chatbot: bolehLihat.map((c) => ({ id: c.id, nama: c.name })),
    kb: data.kb,
    /* Sisi milik chatbot yang tak boleh dilihat ikut dibuang di sini, bukan
       hanya simpulnya: sisi yang tersisa akan menunjuk id yang tak ada di
       daftar, dan dari situ jumlah chatbot tenant tetap bisa dihitung. */
    sisi: data.sisi.filter((s) => idBoleh.has(s.chatbotId)),
  });
}
