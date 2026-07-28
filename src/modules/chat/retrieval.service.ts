import { sql } from 'drizzle-orm';
import { withTenant } from '@/modules/core/db/tenant-context';
import { apiKeyResolver } from '@/modules/settings/credentials.repository';
import { embed } from '@/modules/knowledge/embeddings';

export interface RetrievedChunk {
  documentId: string;
  title: string | null;
  content: string;
  score: number;
}

/**
 * Vector search top-k utk satu chatbot — D11: konteks chatbot = UNION dokumen
 * semua KNOWLEDGE BASE yang di-assign padanya (chatbot_knowledge_bases).
 * withTenant() + filter kb + embedding_model + deleted_at IS NULL ⇒ tetap
 * terisolasi penuh per tenant; assignment-lah yang menentukan jangkauan.
 * Chatbot tanpa KB ter-assign = konteks kosong (jawab "tidak tahu"), bukan
 * error — keadaan sah saat chatbot baru dibuat.
 */
export const retrievalService = {
  async retrieve(
    tenantId: string,
    chatbotId: string,
    embeddingModel: string,
    query: string,
    k = 6,
  ): Promise<RetrievedChunk[]> {
    const getApiKey = apiKeyResolver(tenantId);
    const [qVec] = await embed(embeddingModel, [query], { tenantId, getApiKey });
    const vecLiteral = `[${qVec.join(',')}]`;

    return withTenant(tenantId, async (tx) => {
      const rows = await tx.execute(sql`
        select d.id, d.title, d.content,
               1 - (d.embedding <=> ${vecLiteral}::vector) as score
        from documents d
        where d.knowledge_base_id in (
            select a.knowledge_base_id from chatbot_knowledge_bases a
            where a.chatbot_id = ${chatbotId} and a.deleted_at is null)
          and d.embedding_model = ${embeddingModel}
          and d.deleted_at is null
        order by d.embedding <=> ${vecLiteral}::vector
        limit ${k}
      `);
      return (rows as unknown as Array<{ id: string; title: string | null; content: string; score: number }>)
        .map((r) => ({ documentId: r.id, title: r.title, content: r.content, score: Number(r.score) }));
    });
  },
};
