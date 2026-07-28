import { eq } from 'drizzle-orm';
import { tenantSettings } from '@/modules/core/db';
import { withTenant } from '@/modules/core/db/tenant-context';
import { dispatch } from '@/modules/core/events';
import { resolveLlmModel } from './llm-catalog';
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
import { stripMarkdown, createStreamStripper } from './plaintext';

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
    // Keputusan produk: frontend memegang penuh styling — teks jawaban tidak
    // boleh membawa sintaks format. Server tetap menyaring sisanya
    // (plaintext.ts), tapi menghentikannya di sumber jauh lebih murah.
    'OUTPUT FORMAT: plain text ONLY — never use Markdown. No **bold**, no _italics_, '
    + 'no # headings, no backticks or code fences, no bullet markers (-, *), no [text](url) links. '
    + 'Write plain sentences; for lists use lines starting with "1.", "2." or "• ". '
    + 'Keep inline citations exactly as [1], [2].',
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
  /**
   * Dipanggil begitu percakapan resolved (dibuat baru ATAU dilanjutkan).
   * Client WAJIB menerima id ini dan mengirimkannya balik di giliran
   * berikutnya — tanpa itu tiap pesan jadi 1 conversation baru dan riwayat
   * di halaman Conversations terpecah per-pesan (bug nyata di embed.js:
   * variabel conversationId-nya null selamanya karena tak pernah dikirimi).
   */
  onConversation?: (conversationId: string) => void,
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

  onConversation?.(conversationId);

  const embeddingModel = settings?.activeEmbeddingModel ?? 'all-MiniLM-L6-v2';
  const llmModel = settings?.activeLlmModel ?? 'claude-sonnet-5';

  const context = await retrievalService.retrieve(input.tenantId, input.chatbotId, embeddingModel, input.question);
  // Beri tahu pemanggil sumber yang ditemukan (utk panel Citations) SEBELUM streaming.
  onSources?.(context.map((c) => ({ documentId: c.documentId, title: c.title, score: c.score, content: c.content.slice(0, 240) })));
  // Guardrail L2: konteks dikeraskan (dokumen = data, injeksi disaring).
  const { messages: prompt, injectionFlagged } = buildPrompt(settings?.systemPrompt ?? null, context, history, input.question);

  const provider = (await resolveLlmModel(llmModel))?.provider;
  // Server LLM sendiri memakai kredensial dari pendaftaran servernya, bukan
  // kunci provider per-tenant — jadi jangan menuntut apiKey di sini.
  const apiKey = provider && provider !== 'selfhosted' ? await getApiKey(provider) : null;
  if (!apiKey && provider !== 'selfhosted') throw new Error(`No API key configured for provider: ${provider}`);

  await withTenant(input.tenantId, (tx) =>
    convo.appendMessage(tx, {
      tenantId: input.tenantId, conversationId, role: 'user', content: input.question,
    }));

  // Guardrail L3: budget eksekusi (timeout + cap output) mengontrol stream.
  // Guardrail L4: redaksi secret per-delta (pola lintas-delta ditangkap ulang
  // pada teks penuh sebelum disimpan).
  const budget = newBudget();
  // Teks polos dijaga DI SERVER (bukan per-frontend) supaya halaman Chat,
  // widget embed, dan pemanggil API sama-sama menerima teks bersih.
  const stripper = createStreamStripper();
  let full = '';
  let truncated = false;
  let redactedAny = false;
  // `apiKey` null hanya mungkin untuk provider 'selfhosted', yang mengambil
  // kredensialnya dari pendaftaran server — bukan dari argumen ini.
  for await (const delta of streamChat(llmModel, prompt, apiKey ?? '')) {
    const plain = stripper.push(delta);
    if (plain) {
      const { text: safeDelta, redacted } = redactSecrets(plain);
      if (redacted) redactedAny = true;
      full += safeDelta;
      yield safeDelta;
    }
    // Budget dihitung dari delta MENTAH — penyaring boleh menahan sebagian,
    // tapi model tetap menghasilkan token dan itulah yang dibatasi.
    if (!budgetAllows(budget, delta.length)) { truncated = true; break; }
  }
  const tail = stripper.flush();
  if (tail) {
    const { text: safeTail, redacted } = redactSecrets(tail);
    if (redacted) redactedAny = true;
    full += safeTail;
    yield safeTail;
  }

  // Guardrail L4 (teks penuh): redaksi ulang + enforcement sitasi; sekaligus
  // full-pass Markdown (menangkap pola yang terbelah antar delta, mis.
  // *miring* satu bintang) — yang tersimpan di DB dijamin polos.
  const finalPass = redactSecrets(full);
  full = stripMarkdown(finalPass.text);
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
