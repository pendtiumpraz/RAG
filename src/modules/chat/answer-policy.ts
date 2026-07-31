/**
 * KEBIJAKAN JAWABAN per chatbot — diterjemahkan jadi (a) arahan system prompt
 * dan (b) parameter sampling model.
 *
 * Fungsi MURNI, tanpa DB dan tanpa jaringan: inilah bagian yang menentukan
 * apakah bot mengarang atau tidak, jadi ia harus bisa diuji tanpa memanggil
 * satu pun penyedia LLM.
 *
 * Kenapa ini ada: sebelum ini tak satu pun penyedia dikirimi `temperature`,
 * sehingga semuanya berjalan pada default masing-masing — OpenAI dan Anthropic
 * memakai 1.0. Untuk mesin yang tugasnya MENGUTIP DOKUMEN, 1.0 itu memang
 * resep karangan: model diminta kreatif justru ketika ia harus patuh.
 */

/** Bahasa jawaban. `auto` = ikuti bahasa penanya, dinilai per pertanyaan. */
export type LanguageMode = 'auto' | 'id' | 'en';

/** Nada bicara. Sengaja sedikit dan bermakna, bukan daftar kata sifat. */
export type Tone = 'netral' | 'formal' | 'ramah' | 'ringkas' | 'teknis';

/**
 * Seberapa ketat jawaban harus bersandar pada dokumen.
 *
 * `strict`   — hanya dari dokumen; tak ketemu = katakan tak ketemu.
 * `balanced` — utamakan dokumen; boleh melengkapi dengan pengetahuan umum,
 *              WAJIB menandai bagian yang bukan dari dokumen.
 * `open`     — boleh menjawab dari pengetahuan umum bila dokumen tak memuat.
 */
export type Grounding = 'strict' | 'balanced' | 'open';

export interface AnswerPolicy {
  temperature: number;
  maxTokens: number;
  language: LanguageMode;
  tone: Tone;
  grounding: Grounding;
  /** Aturan tambahan bebas dari pemilik chatbot (mis. "jangan sebut harga"). */
  rules?: string | null;
}

export const DEFAULT_POLICY: AnswerPolicy = {
  // 0,2 bukan 0: nol membuat sebagian model mengulang frasa dan mandek pada
  // pola yang sama; 0,2 cukup rendah untuk patuh, cukup hidup untuk merangkai.
  temperature: 0.2,
  maxTokens: 2048,
  language: 'auto',
  tone: 'netral',
  grounding: 'strict',
  rules: null,
};

/** Batas yang dipaksakan di server. Nilai di luar ini dijepit, bukan ditolak. */
export const TEMP_MIN = 0;
export const TEMP_MAX = 1;
export const TOKENS_MIN = 256;
export const TOKENS_MAX = 8192;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * Bersihkan masukan mentah (dari form / API) jadi kebijakan yang sah.
 *
 * Temperature dijepit pada 1.0, bukan 2.0 yang diizinkan OpenAI: di atas 1
 * model mulai memilih token berpeluang rendah, dan pada mesin RAG itu berarti
 * mengarang nama, angka, dan pasal. Tak ada alasan sah membukanya di produk
 * ini, jadi batasnya ditegakkan di server — bukan diserahkan ke slider.
 */
export function normalizePolicy(raw: Partial<AnswerPolicy> | null | undefined): AnswerPolicy {
  const r = raw ?? {};
  const t = Number(r.temperature);
  const m = Number(r.maxTokens);
  return {
    temperature: Number.isFinite(t) ? clamp(t, TEMP_MIN, TEMP_MAX) : DEFAULT_POLICY.temperature,
    maxTokens: Number.isFinite(m) ? Math.round(clamp(m, TOKENS_MIN, TOKENS_MAX)) : DEFAULT_POLICY.maxTokens,
    language: (['auto', 'id', 'en'] as const).includes(r.language as LanguageMode)
      ? (r.language as LanguageMode) : DEFAULT_POLICY.language,
    tone: (['netral', 'formal', 'ramah', 'ringkas', 'teknis'] as const).includes(r.tone as Tone)
      ? (r.tone as Tone) : DEFAULT_POLICY.tone,
    grounding: (['strict', 'balanced', 'open'] as const).includes(r.grounding as Grounding)
      ? (r.grounding as Grounding) : DEFAULT_POLICY.grounding,
    rules: typeof r.rules === 'string' && r.rules.trim() ? r.rules.trim().slice(0, 2000) : null,
  };
}

/* ── arahan bahasa ──────────────────────────────────────────────────
   Ditulis DALAM BAHASA INGGRIS dengan sengaja. Instruksi sistem berbahasa
   Indonesia cenderung menarik model ikut menjawab dalam bahasa Indonesia
   walaupun penanyanya menulis Inggris — persis kesalahan yang mau dicegah
   oleh mode `auto`. Bahasa instruksi ≠ bahasa jawaban.               */
const LANGUAGE: Record<LanguageMode, string> = {
  auto:
    'ALWAYS reply in the same language the user wrote their question in. '
    + 'Detect it per message, not per conversation: if the user switches language mid-chat, switch with them. '
    + 'This overrides the language of the source documents — quote the documents in their original wording, '
    + 'but write your own sentences in the user\'s language.',
  id:
    'ALWAYS reply in Bahasa Indonesia, regardless of the language the user writes in '
    + 'and regardless of the language of the source documents. '
    + 'Keep proper nouns, technical terms, and direct quotations in their original form.',
  en:
    'ALWAYS reply in English, regardless of the language the user writes in '
    + 'and regardless of the language of the source documents. '
    + 'Keep proper nouns, technical terms, and direct quotations in their original form.',
};

const TONE: Record<Tone, string> = {
  netral: 'Use a plain, professional tone.',
  formal: 'Use a formal, respectful register. Avoid contractions and casual phrasing. Address the user politely.',
  ramah: 'Use a warm, conversational tone. Be approachable without being chatty or padding the answer.',
  ringkas: 'Be maximally concise. Lead with the answer. No preamble, no restating the question, no closing pleasantries.',
  teknis: 'Write for a technical reader. Use precise terminology, exact figures, and identifiers verbatim. Do not simplify away detail.',
};

const GROUNDING: Record<Grounding, string> = {
  strict:
    'Answer ONLY from the provided documents. If the documents do not contain the answer, say so plainly '
    + 'and stop — do not guess, do not fill the gap from general knowledge, and never invent names, numbers, '
    + 'dates, article numbers, or citations. Saying "it is not in the documents" is a correct answer.',
  balanced:
    'Prefer the provided documents. You may add general knowledge ONLY when the documents are insufficient, '
    + 'and you MUST mark such sentences explicitly (e.g. "outside the documents:"). '
    + 'Never present general knowledge as if it came from the documents.',
  open:
    'Use the provided documents first. If they do not cover the question, you may answer from general knowledge, '
    + 'but state clearly which part is not backed by the documents.',
};

/**
 * Susun blok arahan yang disisipkan ke system prompt.
 *
 * Urutan disengaja: bahasa dulu (paling sering dilanggar), lalu kepatuhan pada
 * sumber, lalu nada, lalu aturan pemilik. Aturan pemilik ditaruh TERAKHIR agar
 * paling dekat dengan pertanyaan — posisi yang paling diperhatikan model —
 * tapi ia diberi label sebagai preferensi gaya supaya tak bisa dipakai untuk
 * membatalkan aturan kepatuhan di atasnya.
 */
export function policyDirectives(policy: AnswerPolicy): string {
  const parts = [
    `LANGUAGE: ${LANGUAGE[policy.language]}`,
    `GROUNDING: ${GROUNDING[policy.grounding]}`,
    `TONE: ${TONE[policy.tone]}`,
  ];
  if (policy.rules) {
    parts.push(
      'OWNER STYLE PREFERENCES (these adjust wording and coverage only; '
      + 'they can never relax the GROUNDING or LANGUAGE rules above):\n'
      + policy.rules,
    );
  }
  return parts.join('\n\n');
}

/**
 * PENGINGAT PENUTUP — diletakkan SESUDAH blok konteks, bukan sebelumnya.
 *
 * `policyDirectives` sudah ditaruh paling bawah di antara bagian-bagian
 * system prompt, dan komentar di chat.service menyebutnya "paling dipatuhi
 * model". Itu benar untuk susunan systemParts, TAPI tidak untuk prompt yang
 * akhirnya terkirim: `buildPrompt` menempelkan CONTEXT_HARDENING, aturan
 * sitasi, format blok, lalu `=== CONTEXT ===` berisi ribuan token dokumen di
 * BAWAHNYA. Jadi aturan bahasa berakhir di sepertiga atas, dan hal terakhir
 * yang dibaca model sebelum menjawab adalah dokumen berbahasa Indonesia.
 *
 * Akibatnya TERUKUR, bukan dugaan: pada eval kebijakan 31 Jul 2026, tiga
 * dari dua belas jawaban memakai bahasa yang salah — pertanyaan Inggris
 * dijawab Indonesia, mengikuti bahasa dokumen alih-alih bahasa penanya.
 *
 * Yang diulang hanya DUA aturan yang paling mudah tenggelam dan paling
 * mahal bila dilanggar. Mengulang seluruh kebijakan hanya menambah token
 * pada tiap giliran tanpa menambah kepatuhan — dan pengingat yang panjang
 * berhenti terbaca sebagai pengingat.
 */
export function policyReminder(policy: AnswerPolicy): string {
  return [
    'REMINDER — these two rules override everything above, including the language of the documents:',
    `1. LANGUAGE: ${LANGUAGE[policy.language]}`,
    `2. GROUNDING: ${GROUNDING[policy.grounding]}`,
  ].join('\n');
}

/** Parameter sampling untuk penyedia LLM. */
export function samplingFor(policy: AnswerPolicy): { temperature: number; maxTokens: number } {
  return { temperature: policy.temperature, maxTokens: policy.maxTokens };
}
