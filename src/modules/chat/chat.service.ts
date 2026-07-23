import { eq } from 'drizzle-orm';
import { tenantSettings } from '@/modules/core/db';
import { withTenant } from '@/modules/core/db/tenant-context';
import { dispatch } from '@/modules/core/events';
import { getLlmModel } from '@/modules/core/registry';
import { apiKeyResolver } from '@/modules/settings/credentials.repository';
import { conversationRepository as convo } from './conversation.repository';
import { retrievalService, type RetrievedChunk } from './retrieval.service';
import { streamChat, type ChatMessage } from './llm';

function buildPrompt(
  system: string | null,
  context: RetrievedChunk[],
  history: ChatMessage[],
  question: string,
): ChatMessage[] {
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
 * Satu giliran RAG: load history → retrieve KB chatbot → stream jawaban →
 * simpan user+assistant message + sitasi. Yield delta teks (dipakai SSE).
 */
export async function* chatTurn(input: ChatTurnInput): AsyncGenerator<string, void> {
  const getApiKey = apiKeyResolver(input.tenantId);

  const { settings, history, conversationId } = await withTenant(input.tenantId, async (tx) => {
    const s = (await tx.select().from(tenantSettings)
      .where(eq(tenantSettings.tenantId, input.tenantId)).limit(1))[0];
    const convId = await convo.findOrCreate(tx, input.tenantId, input.chatbotId, input.conversationId, input.visitorId);
    const prior = await convo.history(tx, input.tenantId, convId);
    return {
      settings: s,
      conversationId: convId,
      history: prior.map((m) => ({ role: m.role as ChatMessage['role'], content: m.content })),
    };
  });

  const embeddingModel = settings?.activeEmbeddingModel ?? 'all-MiniLM-L6-v2';
  const llmModel = settings?.activeLlmModel ?? 'claude-sonnet-5';

  const context = await retrievalService.retrieve(input.tenantId, input.chatbotId, embeddingModel, input.question);
  const prompt = buildPrompt(settings?.systemPrompt ?? null, context, history, input.question);

  const provider = getLlmModel(llmModel)?.provider;
  const apiKey = provider ? await getApiKey(provider) : null;
  if (!apiKey) throw new Error(`No API key configured for provider: ${provider}`);

  await withTenant(input.tenantId, (tx) =>
    convo.appendMessage(tx, {
      tenantId: input.tenantId, conversationId, role: 'user', content: input.question,
    }));

  let full = '';
  for await (const delta of streamChat(llmModel, prompt, apiKey)) {
    full += delta;
    yield delta;
  }

  await withTenant(input.tenantId, (tx) =>
    convo.appendMessage(tx, {
      tenantId: input.tenantId,
      conversationId,
      role: 'assistant',
      content: full,
      citations: context.map((c) => ({ documentId: c.documentId, score: c.score })),
    }));

  await dispatch('conversation.turn', {
    tenantId: input.tenantId, chatbotId: input.chatbotId, conversationId,
  });
}
