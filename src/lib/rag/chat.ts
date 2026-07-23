import { eq, and, asc } from 'drizzle-orm';
import { db, tenantSettings, conversations, messages } from '@/lib/db';
import { withTenant } from '@/lib/db/tenant';
import { retrieve, type RetrievedChunk } from './retrieve';
import { streamChat, type ChatMessage } from '@/lib/llm';
import { apiKeyResolver } from '@/lib/credentials';
import { getLlmModel } from '@/lib/models/registry';

function buildPrompt(system: string | null, context: RetrievedChunk[], history: ChatMessage[], question: string): ChatMessage[] {
  const contextBlock = context.length
    ? context.map((c, i) => `[[${i + 1}]] ${c.title ?? ''}\n${c.content}`).join('\n\n')
    : '(no relevant documents found)';

  const sys = [
    system ?? 'You are a helpful assistant that answers using ONLY the provided context.',
    'Answer strictly from the CONTEXT below. If the answer is not in the context, say you don\'t know.',
    'Cite sources inline as [1], [2] matching the context blocks.',
    '\n=== CONTEXT ===\n' + contextBlock,
  ].join('\n');

  return [{ role: 'system', content: sys }, ...history, { role: 'user', content: question }];
}

export interface ChatTurnInput {
  tenantId: string;
  chatbotId: string;
  conversationId?: string;
  visitorId?: string;
  question: string;
}

/**
 * One RAG chat turn:
 *   1. load/create the conversation (history persisted per chatbot)
 *   2. retrieve context from THIS chatbot's KB
 *   3. stream the answer from the tenant's active LLM
 *   4. persist both user + assistant messages (full history)
 *
 * Returns an async generator of text deltas plus a promise that resolves
 * once the assistant message has been saved (with citations).
 */
export async function* chatTurn(input: ChatTurnInput): AsyncGenerator<string, void> {
  const getApiKey = apiKeyResolver(input.tenantId);

  const { settings, history, conversationId } = await withTenant(input.tenantId, async (tx) => {
    const s = (await tx.select().from(tenantSettings)
      .where(eq(tenantSettings.tenantId, input.tenantId)).limit(1))[0];

    let convId = input.conversationId;
    if (!convId) {
      const created = await tx.insert(conversations).values({
        tenantId: input.tenantId,
        chatbotId: input.chatbotId,
        visitorId: input.visitorId,
      }).returning({ id: conversations.id });
      convId = created[0].id;
    }

    const prior = await tx.select().from(messages)
      .where(and(eq(messages.conversationId, convId), eq(messages.tenantId, input.tenantId)))
      .orderBy(asc(messages.createdAt));

    return {
      settings: s,
      conversationId: convId,
      history: prior.map((m) => ({ role: m.role as ChatMessage['role'], content: m.content })),
    };
  });

  const embeddingModel = settings?.activeEmbeddingModel ?? 'all-MiniLM-L6-v2';
  const llmModel = settings?.activeLlmModel ?? 'claude-sonnet-5';

  const context = await retrieve(input.tenantId, input.chatbotId, embeddingModel, input.question);
  const prompt = buildPrompt(settings?.systemPrompt ?? null, context, history, input.question);

  const provider = getLlmModel(llmModel)?.provider;
  const apiKey = provider ? await getApiKey(provider) : null;
  if (!apiKey) throw new Error(`No API key configured for provider: ${provider}`);

  // persist the user message first
  await withTenant(input.tenantId, async (tx) => {
    await tx.insert(messages).values({
      tenantId: input.tenantId, conversationId, role: 'user', content: input.question,
    });
  });

  let full = '';
  for await (const delta of streamChat(llmModel, prompt, apiKey)) {
    full += delta;
    yield delta;
  }

  // persist assistant message + citations after the stream completes
  await withTenant(input.tenantId, async (tx) => {
    await tx.insert(messages).values({
      tenantId: input.tenantId,
      conversationId,
      role: 'assistant',
      content: full,
      citations: context.map((c) => ({ documentId: c.documentId, score: c.score })),
    });
  });
}
