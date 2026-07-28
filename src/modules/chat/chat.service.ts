import { eq } from 'drizzle-orm';
import { tenantSettings, chatbots } from '@/modules/core/db';
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
import {
  BLOCK_FORMAT_INSTRUCTIONS, createBlockStreamParser, blocksToPlainText,
  type AnswerBlock,
} from './blocks';

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
    // Keputusan produk: jawaban TERSTRUKTUR (JSON blok — lihat chat/blocks.ts);
    // frontend merendernya jadi bubble/daftar/kartu/chart dan memegang penuh
    // styling. Model yang mengabaikan format tetap tertangani fallback parser.
    BLOCK_FORMAT_INSTRUCTIONS,
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

/** Guardrail L4 utk blok: redaksi secret pada SEMUA string di dalam blok
 *  sebelum blok meninggalkan server. */
function redactBlockStrings(b: AnswerBlock, onRedacted: () => void): AnswerBlock {
  const r = (s: string): string => {
    const { text, redacted } = redactSecrets(s);
    if (redacted) onRedacted();
    return text;
  };
  if (b.type === 'text') return { ...b, text: r(b.text) };
  if (b.type === 'list') return { ...b, items: b.items.map(r) };
  if (b.type === 'cards') {
    return { ...b, items: b.items.map((c) => ({ ...c, title: r(c.title), value: r(c.value), ...(c.desc ? { desc: r(c.desc) } : {}) })) };
  }
  return { ...b, labels: b.labels.map(r), ...(b.title ? { title: r(b.title) } : {}) };
}

export interface ChatTurnCallbacks {
  onSources?: (sources: ChatSource[]) => void;
  /**
   * Dipanggil begitu percakapan resolved (dibuat baru ATAU dilanjutkan).
   * Client WAJIB menerima id ini dan mengirimkannya balik di giliran
   * berikutnya — tanpa itu tiap pesan jadi 1 conversation baru dan riwayat
   * di halaman Conversations terpecah per-pesan.
   */
  onConversation?: (conversationId: string) => void;
  /** Satu blok jawaban UTUH & sudah tervalidasi — dikirim client sebagai
   *  SSE `event: block` begitu tiba (jawaban muncul komponen demi komponen). */
  onBlock?: (block: AnswerBlock) => void;
}

export async function chatTurn(
  input: ChatTurnInput,
  cb: ChatTurnCallbacks = {},
): Promise<void> {
  const { onSources, onConversation, onBlock } = cb;
  // Guardrail L1: sanitasi input (rate/kuota sudah di route).
  input.question = guardInput(input.question);

  const getApiKey = apiKeyResolver(input.tenantId);

  const { settings, botContext, history, conversationId } = await withTenant(input.tenantId, async (tx) => {
    const s = (await tx.select().from(tenantSettings)
      .where(eq(tenantSettings.tenantId, input.tenantId)).limit(1))[0];
    // D11: konteks kepemilikan/persona chatbot (divisi) — bagian dari
    // system prompt CHATBOT INI SAJA, di atas system prompt tenant.
    const bot = (await tx.select({ context: chatbots.context }).from(chatbots)
      .where(eq(chatbots.id, input.chatbotId)).limit(1))[0];
    const convId = await convo.findOrCreate(tx, input.tenantId, input.chatbotId, input.conversationId, input.visitorId);
    const prior = await convo.history(tx, input.tenantId, convId);
    return {
      settings: s,
      botContext: bot?.context?.trim() || null,
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
  // system efektif = konteks divisi chatbot (bila ada) + system prompt tenant
  const systemParts = [botContext, settings?.systemPrompt].filter(Boolean) as string[];
  const { messages: prompt, injectionFlagged } = buildPrompt(
    systemParts.length ? systemParts.join('\n') : null, context, history, input.question);

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
  let truncated = false;
  let redactedAny = false;

  // Model diminta membalas JSON blok; parser memancarkan tiap blok yang sudah
  // UTUH. Guardrail L4 (redaksi secret) diterapkan per-STRING di dalam blok
  // sebelum blok keluar dari server.
  const blocks: AnswerBlock[] = [];
  const emit = (raw: AnswerBlock) => {
    const block = redactBlockStrings(raw, () => { redactedAny = true; });
    blocks.push(block);
    onBlock?.(block);
  };
  const parser = createBlockStreamParser(emit);

  // `apiKey` null hanya mungkin untuk provider 'selfhosted', yang mengambil
  // kredensialnya dari pendaftaran server — bukan dari argumen ini.
  for await (const delta of streamChat(llmModel, prompt, apiKey ?? '')) {
    parser.push(delta);
    // Budget dihitung dari delta MENTAH — model tetap menghasilkan token
    // walau parser masih menahan blok yang belum lengkap.
    if (!budgetAllows(budget, delta.length)) { truncated = true; break; }
  }
  // Model yang mengabaikan format JSON jatuh ke fallback: prosa dipecah jadi
  // blok text/list — pengguna tetap menerima jawaban terstruktur.
  const { fallback } = parser.finalize();

  // Guardrail L4 (teks penuh) + enforcement sitasi pada padanan teks polos.
  let full = blocksToPlainText(blocks);
  const finalPass = redactSecrets(full);
  full = finalPass.text;
  redactedAny = redactedAny || finalPass.redacted;
  const cite = checkCitations(full, context.length > 0);

  await withTenant(input.tenantId, (tx) =>
    convo.appendMessage(tx, {
      tenantId: input.tenantId,
      conversationId,
      role: 'assistant',
      content: full,                      // teks polos — analytics, riwayat prompt
      blocks: blocks as unknown[],        // struktur — dirender frontend
      citations: context.map((c) => ({ documentId: c.documentId, score: c.score, title: c.title })),
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
      // model mengabaikan format JSON → jawaban lewat fallback prosa→blok;
      // kalau sering terjadi utk satu model, pertimbangkan matikan blok baginya
      blockFallback: fallback,
      blocks: blocks.length,
    });

  await dispatch('conversation.turn', {
    tenantId: input.tenantId, chatbotId: input.chatbotId, conversationId,
  });
}
