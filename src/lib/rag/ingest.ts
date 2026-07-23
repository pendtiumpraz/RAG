import { and, eq } from 'drizzle-orm';
import { db, documents, tenantSettings } from '@/lib/db';
import { withTenant } from '@/lib/db/tenant';
import { embed } from '@/lib/embeddings';
import { apiKeyResolver } from '@/lib/credentials';

/** Naive but solid recursive chunker: ~800 chars with ~120 char overlap. */
export function chunkText(text: string, size = 800, overlap = 120): string[] {
  const clean = text.replace(/\r\n/g, '\n').trim();
  if (clean.length <= size) return clean ? [clean] : [];
  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + size, clean.length);
    // try to break on a paragraph / sentence boundary
    const slice = clean.slice(start, end);
    const brk = Math.max(slice.lastIndexOf('\n\n'), slice.lastIndexOf('. '));
    if (brk > size * 0.5 && end < clean.length) end = start + brk + 1;
    chunks.push(clean.slice(start, end).trim());
    start = end - overlap;
  }
  return chunks.filter(Boolean);
}

export interface IngestInput {
  tenantId: string;
  chatbotId: string;
  sourceId?: string;
  title?: string;
  text: string;
  metadata?: Record<string, unknown>;
}

/**
 * Chunk → embed → store, all inside the tenant's RLS scope so rows land
 * against the correct tenant and can never be written cross-tenant.
 */
export async function ingestDocument(input: IngestInput): Promise<number> {
  const getApiKey = apiKeyResolver(input.tenantId);

  const modelId = await withTenant(input.tenantId, async (tx) => {
    const s = await tx.select().from(tenantSettings)
      .where(eq(tenantSettings.tenantId, input.tenantId)).limit(1);
    return s[0]?.activeEmbeddingModel ?? 'all-MiniLM-L6-v2';
  });

  const chunks = chunkText(input.text);
  if (chunks.length === 0) return 0;

  const vectors = await embed(modelId, chunks, { tenantId: input.tenantId, getApiKey });

  await withTenant(input.tenantId, async (tx) => {
    await tx.insert(documents).values(chunks.map((content, i) => ({
      tenantId: input.tenantId,
      chatbotId: input.chatbotId,
      sourceId: input.sourceId,
      title: input.title,
      content,
      embeddingModel: modelId,
      embedding: vectors[i],
      metadata: { ...input.metadata, chunk: i },
    })));
  });

  return chunks.length;
}
