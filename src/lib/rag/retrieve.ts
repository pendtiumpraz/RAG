import { sql } from 'drizzle-orm';
import { withTenant } from '@/lib/db/tenant';
import { embed } from '@/lib/embeddings';
import { apiKeyResolver } from '@/lib/credentials';

export interface RetrievedChunk {
  documentId: string;
  title: string | null;
  content: string;
  score: number;
}

/**
 * Vector search for the top-k most similar chunks to `query`, scoped to
 * ONE chatbot (⇒ one knowledge base) inside ONE tenant. Because the query
 * runs under withTenant() + RLS AND filters on chatbot_id + embedding_model,
 * results can only ever come from this chatbot's own documents. Different
 * chatbot id ⇒ different, isolated knowledge base.
 */
export async function retrieve(
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
      order by embedding <=> ${vecLiteral}::vector
      limit ${k}
    `);
    return (rows as unknown as Array<{ id: string; title: string | null; content: string; score: number }>)
      .map((r) => ({ documentId: r.id, title: r.title, content: r.content, score: Number(r.score) }));
  });
}
