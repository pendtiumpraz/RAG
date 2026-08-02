import type { SaringDokumen } from '@/modules/knowledge/saring';
import { eq } from 'drizzle-orm';
import { tenantSettings, chatbots } from '@/modules/core/db';
import { withTenant } from '@/modules/core/db/tenant-context';
import { dispatch } from '@/modules/core/events';
import { resolveLlmModel } from './llm-catalog';
import { apiKeyResolver } from '@/modules/settings/credentials.repository';
import { conversationRepository as convo } from './conversation.repository';
import { retrievalService, type RetrievedChunk } from './retrieval.service';
import { streamChat, type ChatMessage } from './llm';
import {
  normalizePolicy, policyDirectives, policyReminder, samplingFor, type AnswerPolicy,
} from './answer-policy';
import { nilaiKeyakinan, penolakanTanpaKonteks, type Keyakinan } from './confidence';
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
  /**
   * Pengingat yang ditempel SESUDAH blok konteks.
   *
   * Tanpa ini, aturan bahasa & kepatuhan sumber berakhir di sepertiga atas
   * system prompt sementara ribuan token dokumen menyusul di bawahnya — dan
   * hal terakhir yang dibaca model sebelum menjawab adalah dokumen, bukan
   * aturannya. Terukur: tiga dari dua belas jawaban memakai bahasa yang
   * salah, mengikuti bahasa dokumen alih-alih bahasa penanya.
   */
  reminder?: string | null,
): { messages: ChatMessage[]; injectionFlagged: boolean } {
  // Guardrail L2+L3: cap jumlah & panjang chunk, sanitasi injeksi per chunk.
  let injectionFlagged = false;
  const capped = context.slice(0, EXEC_LIMITS.maxContextChunks).map((c, i) => {
    const clipped = c.content.slice(0, EXEC_LIMITS.maxContextCharsPerChunk);
    const { text, flagged } = sanitizeChunk(clipped);
    if (flagged) injectionFlagged = true;
    // Ringkasan buatan agen Memory DITANDAI. Tanpa penanda ini model melihat
    // parafrase LLM dengan label yang sama seperti kutipan asli, dan boleh
    // mengutipnya seolah itu bunyi dokumen — karangan yang lahir dari
    // pipeline kita sendiri, bukan dari model.
    const kind = c.kind === 'memory' ? ' type="summary"' : '';
    return `<doc id="${i + 1}"${kind} title="${(c.title ?? '').replace(/"/g, '')}">\n${text}\n</doc>`;
  });
  const adaRingkasan = context.slice(0, EXEC_LIMITS.maxContextChunks).some((c) => c.kind === 'memory');
  const contextBlock = capped.length ? capped.join('\n\n') : '(no relevant documents found)';

  const sys = [
    system ?? 'You are a helpful assistant that answers using ONLY the provided context.',
    CONTEXT_HARDENING,
    'Answer strictly from the CONTEXT below. If the answer is not in the context, say you don\'t know.',
    'Cite sources inline as [1], [2] matching the <doc id> numbers.',
    // Pertanyaan berversi ("RAB 2020") kerap tetap kebagian chunk tahun
    // tetangga di konteks — model WAJIB memilah berdasar judul dokumen,
    // bukan mencampur angka lintas versi.
    'DOCUMENT SCOPE: when the question targets a SPECIFIC document, year, or '
    + 'version (e.g. "RAB 2020"), use ONLY chunks whose <doc title> matches that '
    + 'target. NEVER mix figures from sibling documents (e.g. RAB 2021/2022) into '
    + 'the answer; if only non-matching documents are in context, say the '
    + 'requested document is not available.',
    // Keputusan produk: jawaban TERSTRUKTUR (JSON blok — lihat chat/blocks.ts);
    // frontend merendernya jadi bubble/daftar/kartu/chart dan memegang penuh
    // styling. Model yang mengabaikan format tetap tertangani fallback parser.
    ...(adaRingkasan ? [
      'DERIVED SUMMARIES: a <doc> marked type="summary" is an AI-written summary of a '
      + 'document, not the document\'s own wording. Use it for orientation — what a document '
      + 'covers, how topics relate, where to look. NEVER quote it as if it were the source '
      + 'text, and never take a specific figure, date, name, clause, or amount from it. '
      + 'For any specific fact, rely on an unmarked <doc>; if none carries that fact, say '
      + 'the detail is not in the retrieved documents.',
    ] : []),
    BLOCK_FORMAT_INSTRUCTIONS,
    '\n=== CONTEXT ===\n' + contextBlock,
    // SESUDAH konteks, bukan sebelumnya — itulah seluruh maksudnya.
    ...(reminder ? ['\n=== END OF CONTEXT ===\n' + reminder] : []),
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
  /**
   * Penyaring metadata (folder / ekstensi / rentang waktu ubah).
   *
   * Diisi HANYA oleh konsol internal. Endpoint widget publik sengaja tak
   * pernah mengisinya: pengunjung situs pelanggan tak punya dasar untuk
   * memilih folder, dan membukanya di sana berarti membuka cara memetakan
   * struktur folder pelanggan dari luar — satu permintaan per tebakan nama.
   */
  saring?: SaringDokumen;
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
  if (b.type === 'table') {
    return {
      ...b,
      headers: b.headers.map(r),
      rows: b.rows.map((row) => row.map(r)),
      ...(b.title ? { title: r(b.title) } : {}),
    };
  }
  return {
    ...b,
    labels: b.labels.map(r),
    series: b.series.map((s) => ({ ...s, name: r(s.name) })),
    ...(b.title ? { title: r(b.title) } : {}),
  };
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
  /**
   * Keadaan jawaban yang sudah jadi — dipakai UI memutuskan apakah sitasi
   * boleh ditampilkan sebagai PENDUKUNG. Dipanggil sekali di akhir giliran.
   */
  onKeyakinan?: (k: Keyakinan) => void;
}

export async function chatTurn(
  input: ChatTurnInput,
  cb: ChatTurnCallbacks = {},
): Promise<void> {
  const { onSources, onConversation, onBlock, onKeyakinan } = cb;
  // Guardrail L1: sanitasi input (rate/kuota sudah di route).
  input.question = guardInput(input.question);

  const getApiKey = apiKeyResolver(input.tenantId);

  const { settings, botContext, policy, history, conversationId } = await withTenant(input.tenantId, async (tx) => {
    const s = (await tx.select().from(tenantSettings)
      .where(eq(tenantSettings.tenantId, input.tenantId)).limit(1))[0];
    // D11: konteks kepemilikan/persona chatbot (divisi) — bagian dari
    // system prompt CHATBOT INI SAJA, di atas system prompt tenant.
    const bot = (await tx.select({
      context: chatbots.context,
      temperature: chatbots.temperature,
      maxTokens: chatbots.maxTokens,
      language: chatbots.languageMode,
      tone: chatbots.tone,
      grounding: chatbots.grounding,
      rules: chatbots.answerRules,
    }).from(chatbots).where(eq(chatbots.id, input.chatbotId)).limit(1))[0];
    const convId = await convo.findOrCreate(tx, input.tenantId, input.chatbotId, input.conversationId, input.visitorId);
    const prior = await convo.history(tx, input.tenantId, convId);
    return {
      settings: s,
      botContext: bot?.context?.trim() || null,
      // Baris chatbot lama (pra-migrasi 0030) tak punya kolom ini; normalize
      // mengisinya dengan default aman — bukan default penyedia yang 1.0.
      policy: normalizePolicy(bot as Partial<AnswerPolicy> | undefined),
      conversationId: convId,
      history: prior.map((m) => ({ role: m.role as ChatMessage['role'], content: m.content })),
    };
  });

  onConversation?.(conversationId);

  const embeddingModel = settings?.activeEmbeddingModel ?? 'all-MiniLM-L6-v2';
  const llmModel = settings?.activeLlmModel ?? 'claude-sonnet-5';

  const context = await retrievalService.retrieve(
    input.tenantId, input.chatbotId, embeddingModel, input.question, undefined, input.saring);
  // Beri tahu pemanggil sumber yang ditemukan (utk panel Citations) SEBELUM streaming.
  onSources?.(context.map((c) => ({ documentId: c.documentId, title: c.title, score: c.score, content: c.content.slice(0, 240) })));
  // Guardrail L2: konteks dikeraskan (dokumen = data, injeksi disaring).
  // system efektif = konteks divisi chatbot + system prompt tenant + KEBIJAKAN.
  // Kebijakan ditaruh PALING BAWAH: bagian akhir system prompt adalah yang
  // paling dipatuhi model, dan aturan bahasa + kepatuhan sumber justru yang
  // paling sering dilanggar kalau terkubur di tengah.
  const systemParts = [botContext, settings?.systemPrompt, policyDirectives(policy)]
    .filter(Boolean) as string[];
  const { messages: prompt, injectionFlagged } = buildPrompt(
    systemParts.length ? systemParts.join('\n') : null, context, history, input.question,
    policyReminder(policy));

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

  /* PINTAS — grounding KETAT dengan NOL potongan.
     Pada mode `strict` model diperintahkan hanya menjawab dari dokumen, jadi
     tanpa satu pun potongan keluarannya sudah pasti penolakan. Memanggilnya
     tetap membakar satu giliran penuh demi kalimat yang sudah diketahui
     sebelum panggilan dimulai — dan pertanyaan di luar korpus (puisi, kode,
     terjemahan) justru selalu jatuh ke jalur ini.

     HANYA `strict`. Mode `balanced` dan `open` MEMANG boleh menjawab tanpa
     dokumen — memintas keduanya akan mematikan fitur, bukan menghemat biaya.
     Dan hanya pada NOL potongan: "skor rendah" bukan alasan yang sah, karena
     skor kemiripan terbukti tidak memisahkan pertanyaan berjawab dari yang
     tidak (0,420–0,581 melawan 0,382–0,546, bertindih penuh). */
  const pintasTanpaKonteks = policy.grounding === 'strict' && context.length === 0;
  let fallback = false;

  if (pintasTanpaKonteks) {
    emit({ type: 'text', text: penolakanTanpaKonteks(input.question) });
  } else {
    // `apiKey` null hanya mungkin untuk provider 'selfhosted', yang mengambil
    // kredensialnya dari pendaftaran server — bukan dari argumen ini.
    for await (const delta of streamChat(llmModel, prompt, apiKey ?? '', samplingFor(policy))) {
      parser.push(delta);
      // Budget dihitung dari delta MENTAH — model tetap menghasilkan token
      // walau parser masih menahan blok yang belum lengkap.
      if (!budgetAllows(budget, delta.length)) { truncated = true; break; }
    }
    // Model yang mengabaikan format JSON jatuh ke fallback: prosa dipecah jadi
    // blok text/list — pengguna tetap menerima jawaban terstruktur.
    fallback = parser.finalize().fallback;
  }

  // Guardrail L4 (teks penuh) + enforcement sitasi pada padanan teks polos.
  let full = blocksToPlainText(blocks);
  const finalPass = redactSecrets(full);
  full = finalPass.text;
  redactedAny = redactedAny || finalPass.redacted;
  const cite = checkCitations(full, context.length > 0);

  /* KEADAAN jawaban, bukan angka keyakinan. Diukur pada korpus produksi:
     skor kemiripan TIDAK memisahkan pertanyaan berjawab dari yang jawabannya
     tak ada (0,420–0,581 melawan 0,382–0,546, bertindih penuh), jadi angka
     persen apa pun yang diturunkan darinya akan terlihat presisi sambil
     menampilkan derau. Yang memisahkan adalah penolakan model itu sendiri —
     dan itulah yang dipakai. Lihat chat/confidence.ts. */
  const keyakinan = nilaiKeyakinan(full, context.length);
  onKeyakinan?.(keyakinan);

  await withTenant(input.tenantId, (tx) =>
    convo.appendMessage(tx, {
      tenantId: input.tenantId,
      conversationId,
      role: 'assistant',
      content: full,                      // teks polos — analytics, riwayat prompt
      blocks: blocks as unknown[],        // struktur — dirender frontend
      citations: context.map((c) => ({ documentId: c.documentId, score: c.score, title: c.title })),
    }));

  /* Nol saat dipintas: prompt-nya dibangun tapi TAK PERNAH dikirim.
     Mencatatnya seolah terkirim membuat laporan biaya menagih token yang tak
     pernah ada — dan justru menyembunyikan penghematan yang baru dibuat. */
  const tokensIn = pintasTanpaKonteks ? 0 : estimateTokens(prompt.map((m) => m.content).join('\n'));
  /* Keluaran juga NOL saat dipintas: kalimat penolakannya kita sendiri yang
     menulis (chat/confidence.ts), tak ada satu token pun yang dibayar ke
     penyedia. Menghitungnya membuat laporan biaya menagih sesuatu yang tak
     pernah ditagih siapa pun — kecil per giliran, tapi justru pada
     penyalahgunaan yang berulang-ulang itulah selisihnya menumpuk, dan di
     situ pula angkanya paling sering dilihat orang. */
  const tokensOut = pintasTanpaKonteks ? 0 : estimateTokens(full);

  /* PESANNYA TETAP DIHITUNG, dan itu keputusan sadar (kartu a-abuse-cost,
     diputuskan pemilik produk 31 Jul 2026): permintaan di luar korpus tetap
     memakai embedding kueri, pencarian vektor, penyimpanan percakapan, dan
     satu giliran perhatian sistem. Menggratiskannya berarti penyalahgunaan
     yang berulang tak berbiaya apa pun bagi pelakunya — dan biaya yang tak
     ditanggung pelaku selalu berpindah ke orang lain. */
  await usageService.recordTurn(input.tenantId, tokensIn, tokensOut);

  // Guardrail L5: audit setiap giliran + flag pelanggaran lapis mana pun.
  await audit(input.tenantId, input.visitorId ? `visitor:${input.visitorId}` : 'anonymous',
    'chat.turn', input.chatbotId, {
      conversationId, model: llmModel, tokensIn, tokensOut,
      chunks: context.length,
      topScore: context[0]?.score ?? null,
      /* Keadaan jawaban ikut dicatat. Skor teratas TETAP disimpan, tapi ia
         terbukti TIDAK memisahkan berjawab dari tak-berjawab (0,420-0,581
         melawan 0,382-0,546) — jadi yang layak dibaca saat menelusuri
         keluhan adalah kolom ini, bukan skornya. */
      keyakinan: keyakinan.status,
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
