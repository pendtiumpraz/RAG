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
 * Vector search top-k, terkurung SATU chatbot (⇒ satu knowledge base) di
 * SATU tenant. withTenant() + filter chatbot_id + embedding_model +
 * deleted_at IS NULL ⇒ beda ID = beda KB, terisolasi penuh.
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
        select id, title, content,
               1 - (embedding <=> ${vecLiteral}::vector) as score
        from documents
        where chatbot_id = ${chatbotId}
          and embedding_model = ${embeddingModel}
          and deleted_at is null
        order by embedding <=> ${vecLiteral}::vector
        limit ${k}
      `);
      return (rows as unknown as Array<{ id: string; title: string | null; content: string; score: number }>)
        .map((r) => ({ documentId: r.id, title: r.title, content: r.content, score: Number(r.score) }));
    });
  },
};
