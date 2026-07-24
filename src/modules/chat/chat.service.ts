import { eq } from 'drizzle-orm';
import { tenantSettings } from '@/modules/core/db';
import { withTenant } from '@/modules/core/db/tenant-context';
import { dispatch } from '@/modules/core/events';
import { getLlmModel } from '@/modules/core/registry';
import { apiKeyResolver } from '@/modules/settings/credentials.repository';
import { conversationRepository as convo } from './conversation.repository';
import { retrievalService, type RetrievedChunk } from './retrieval.service';
import { streamChat, type ChatMessage } from './llm';
import { estimateTokens } from '@/modules/core/limits';
import { usageService } from '@/modules/usage/usage.service';
import {
  guardInput, sanitizeChunk, CONTEXT_HARDENING, EXEC_LIMITS,
  newBudget, budgetAllows, redactSecrets, checkCitations, audit,
} from '@/modules/core/guardrails';

function buildPrompt(
  system: string | null,
  context: RetrievedChunk[],
  history: ChatMessage[],
  question: string,
): { messages: ChatMessage[]; injectionFlagged: boolean } {
  // Guardrail L2+L3: cap jumlah & panjang chunk, sanitasi injeksi per chunk.
  let injectionFlagged = false;
  const capped = context.slice(0, EXEC_LIMITS.maxContextChunks).map((c, i) => {
    const clipped = c.content.slice(0, EXEC_LIMITS.maxContextCharsPerChunk);
    const { text, flagged } = sanitizeChunk(clipped);
    if (flagged) injectionFlagged = true;
    return `<doc id="${i + 1}" title="${(c.title ?? '').replace(/"/g, '')}">\n${text}\n</doc>`;
  });
  const contextBlock = capped.length ? capped.join('\n\n') : '(no relevant documents found)';

  const sys = [
    system ?? 'You are a helpful assistant that answers using ONLY the provided context.',
    CONTEXT_HARDENING,
    'Answer strictly from the CONTEXT below. If the answer is not in the context, say you don\'t know.',
    'Cite sources inline as [1], [2] matching the <doc id> numbers.',
    '\n=== CONTEXT ===\n' + contextBlock,
  ].join('\n');

  const messages: ChatMessage[] = [{ role: 'system', content: sys }, ...history, { role: 'user', content: question }];
  return { messages, injectionFlagged };
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
export interface ChatSource { documentId: string; title: string | null; score: number; content: string }

export async function* chatTurn(
  input: ChatTurnInput,
  onSources?: (sources: ChatSource[]) => void,
): AsyncGenerator<string, void> {
  // Guardrail L1: sanitasi input (rate/kuota sudah di route).
  input.question = guardInput(input.question);

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
  // Beri tahu pemanggil sumber yang ditemukan (utk panel Citations) SEBELUM streaming.
  onSources?.(context.map((c) => ({ documentId: c.documentId, title: c.title, score: c.score, content: c.content.slice(0, 240) })));
  // Guardrail L2: konteks dikeraskan (dokumen = data, injeksi disaring).
  const { messages: prompt, injectionFlagged } = buildPrompt(settings?.systemPrompt ?? null, context, history, input.question);

  const provider = getLlmModel(llmModel)?.provider;
  const apiKey = provider ? await getApiKey(provider) : null;
  if (!apiKey) throw new Error(`No API key configured for provider: ${provider}`);

  await withTenant(input.tenantId, (tx) =>
    convo.appendMessage(tx, {
      tenantId: input.tenantId, conversationId, role: 'user', content: input.question,
    }));

  // Guardrail L3: budget eksekusi (timeout + cap output) mengontrol stream.
  // Guardrail L4: redaksi secret per-delta (pola lintas-delta ditangkap ulang
  // pada teks penuh sebelum disimpan).
  const budget = newBudget();
  let full = '';
  let truncated = false;
  let redactedAny = false;
  for await (const delta of streamChat(llmModel, prompt, apiKey)) {
    const { text: safeDelta, redacted } = redactSecrets(delta);
    if (redacted) redactedAny = true;
    full += safeDelta;
    yield safeDelta;
    if (!budgetAllows(budget, safeDelta.length)) { truncated = true; break; }
  }

  // Guardrail L4 (teks penuh): redaksi ulang + enforcement sitasi.
  const finalPass = redactSecrets(full);
  full = finalPass.text;
  redactedAny = redactedAny || finalPass.redacted;
  const cite = checkCitations(full, context.length > 0);

  await withTenant(input.tenantId, (tx) =>
    convo.appendMessage(tx, {
      tenantId: input.tenantId,
      conversationId,
      role: 'assistant',
      content: full,
      citations: context.map((c) => ({ documentId: c.documentId, score: c.score })),
    }));

  const tokensIn = estimateTokens(prompt.map((m) => m.content).join('\n'));
  const tokensOut = estimateTokens(full);
  await usageService.recordTurn(input.tenantId, tokensIn, tokensOut);

  // Guardrail L5: audit setiap giliran + flag pelanggaran lapis mana pun.
  await audit(input.tenantId, input.visitorId ? `visitor:${input.visitorId}` : 'anonymous',
    'chat.turn', input.chatbotId, {
      conversationId, model: llmModel, tokensIn, tokensOut,
      chunks: context.length,
      topScore: context[0]?.score ?? null,
      guardrails: {
        l2InjectionFiltered: injectionFlagged,
        l3Truncated: truncated,
        l4SecretRedacted: redactedAny,
        l4CitationsOk: cite.ok,
      },
    });

  await dispatch('conversation.turn', {
    tenantId: input.tenantId, chatbotId: input.chatbotId, conversationId,
  });
}
