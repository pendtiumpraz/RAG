/**
 * Central registry of every selectable model.
 *
 * Two independent axes the user configures in Settings:
 *   1. CHAT / LLM model  — which model answers the question (any provider).
 *   2. EMBEDDING model   — which model turns text into vectors.
 *
 * Only ONE chat model and ONE embedding model can be "active" per tenant
 * (enforced in Settings). API keys are stored per-tenant, encrypted.
 *
 * Data below is current as of 2026-07-23. Update `LLM_MODELS` when
 * providers ship new models — the app reads exclusively from this file,
 * so adding a model here makes it appear in the Settings dropdown.
 */

export type Provider =
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'mistral'
  | 'deepseek'
  | 'xai'
  | 'groq'
  | 'cohere';

export interface LlmModel {
  id: string;            // exact API model id
  provider: Provider;
  label: string;         // human-friendly name shown in the UI
  contextWindow: number; // tokens
  /** relative $ / 1M tokens {input, output} — informational for the UI */
  price?: { in: number; out: number };
  notes?: string;
}

/**
 * ── CHAT / LLM models (latest per provider, 2026-07-23) ──────────────
 * Sources verified via web search on 2026-07-23.
 */
export const LLM_MODELS: LlmModel[] = [
  // Anthropic — https://docs.anthropic.com
  { id: 'claude-fable-5',            provider: 'anthropic', label: 'Claude Fable 5 (flagship, Mythos-class)', contextWindow: 1_000_000, price: { in: 10, out: 50 } },
  { id: 'claude-opus-4-8',           provider: 'anthropic', label: 'Claude Opus 4.8',                          contextWindow: 1_000_000, price: { in: 5,  out: 25 } },
  { id: 'claude-sonnet-5',           provider: 'anthropic', label: 'Claude Sonnet 5',                          contextWindow: 1_000_000, price: { in: 3,  out: 15 } },
  { id: 'claude-haiku-4-5-20251001', provider: 'anthropic', label: 'Claude Haiku 4.5',                         contextWindow: 200_000,   price: { in: 1,  out: 5 } },

  // OpenAI — GPT-5.6 family (Sol / Terra / Luna), released Jul 2026
  { id: 'gpt-5.6-sol',   provider: 'openai', label: 'GPT-5.6 Sol (flagship)',        contextWindow: 400_000 },
  { id: 'gpt-5.6-terra', provider: 'openai', label: 'GPT-5.6 Terra (balanced)',      contextWindow: 400_000 },
  { id: 'gpt-5.6-luna',  provider: 'openai', label: 'GPT-5.6 Luna (cost-efficient)', contextWindow: 400_000 },
  { id: 'gpt-5.5',       provider: 'openai', label: 'GPT-5.5',                        contextWindow: 400_000 },
  { id: 'gpt-5.4',       provider: 'openai', label: 'GPT-5.4',                        contextWindow: 272_000 },

  // Google — Gemini 3.x (2026)
  { id: 'gemini-3.5-flash',    provider: 'google', label: 'Gemini 3.5 Flash (GA)',       contextWindow: 1_000_000 },
  { id: 'gemini-flash-latest', provider: 'google', label: 'Gemini Flash (latest alias)', contextWindow: 1_000_000 },
  { id: 'gemini-3-pro',        provider: 'google', label: 'Gemini 3 Pro',                contextWindow: 2_000_000 },

  // Other popular OpenAI-compatible providers (optional keys)
  { id: 'mistral-large-2-latest', provider: 'mistral',  label: 'Mistral Large 2',        contextWindow: 128_000 },
  { id: 'deepseek-chat',          provider: 'deepseek', label: 'DeepSeek V3.x Chat',      contextWindow: 128_000 },
  { id: 'grok-4',                 provider: 'xai',      label: 'xAI Grok 4',             contextWindow: 256_000 },
  { id: 'llama-3.3-70b-versatile',provider: 'groq',     label: 'Llama 3.3 70B (Groq)',   contextWindow: 128_000 },
  { id: 'command-r-plus',         provider: 'cohere',   label: 'Cohere Command R+',       contextWindow: 128_000 },
];

/**
 * ── EMBEDDING models ─────────────────────────────────────────────────
 * kind:
 *   'local'  — ONNX model run in-process via @xenova/transformers.
 *              The .onnx file is downloaded from the superadmin's
 *              Google Drive / SharePoint and cached on disk.
 *   'api'    — remote embedding API (OpenAI / Cohere / etc.).
 *
 * `sizeMB` lets the UI group them into the "~80MB / ~2GB / API" buckets
 * the user asked for.
 */
/**
 * local      — ONNX di proses yang sama (transformers.js)
 * api        — penyedia pihak ketiga (OpenAI/Cohere), kunci per-tenant
 * selfhosted — server embedding sendiri (VPS) lewat HTTP kompatibel OpenAI;
 *              satu-satunya cara memakai model besar tanpa membebani lambda
 */
export type EmbeddingKind = 'local' | 'api' | 'selfhosted';

export interface EmbeddingModel {
  id: string;
  label: string;
  kind: EmbeddingKind;
  dimensions: number;   // vector size — determines the pgvector column
  sizeMB?: number;      // approx download size for local models
  provider?: Provider;  // for api models
  /** filename inside the superadmin model folder, for local models */
  modelFile?: string;
  /** transformers.js repo id — juga tata letak berkas di model host (blob/HF) */
  hfRepo?: string;
  /**
   * Pakai bobot ONNX terkuantisasi (default transformers.js). `false` =
   * presisi penuh `onnx/model.onnx` — jauh lebih besar & butuh RAM lebih
   * banyak, tapi akurasi tertinggi. Menentukan berkas mana yang diunggah
   * ke model host DAN mana yang dimuat runtime — keduanya harus cocok.
   */
  quantized?: boolean;
  /**
   * Nama model yang dikirim ke server embedding sendiri, bila berbeda dari
   * `id`. Memisahkan id di registry (yang tersimpan di `tenant_settings` dan
   * di kolom `documents.embedding_model`) dari nama yang dikenal server.
   */
  servedModel?: string;
  bucket: 'small' | 'large' | 'api';
}

export const EMBEDDING_MODELS: EmbeddingModel[] = [
  // ~80MB bucket — fast, runs anywhere, good for edge / on-prem CPU
  {
    id: 'all-MiniLM-L6-v2',
    label: 'MiniLM L6 v2 (~22MB, cepat, ramah CPU)',
    // ukuran = berkas yang BENAR-BENAR dimuat (onnx/model_quantized.onnx
    // 21,9 MB); varian fp32 repo ini 86,2 MB. Diverifikasi 2026-07-26.
    kind: 'local', bucket: 'small', dimensions: 384, sizeMB: 22,
    modelFile: 'all-MiniLM-L6-v2.onnx', hfRepo: 'Xenova/all-MiniLM-L6-v2',
  },
  {
    id: 'nomic-embed-text-v1.5',
    label: 'Nomic Embed Text v1.5 (~131MB, 8k context)',
    kind: 'local', bucket: 'small', dimensions: 768, sizeMB: 131,
    // repo `Xenova/…` kini 401 (tergated); repo resmi nomic-ai punya ONNX
    // mandiri (quantized 131MB · fp32 522MB) — diverifikasi 2026-07-26.
    modelFile: 'nomic-embed-text-v1.5.onnx', hfRepo: 'nomic-ai/nomic-embed-text-v1.5',
  },

  // ~2GB bucket — higher accuracy, multilingual, needs more RAM
  {
    id: 'bge-m3',
    label: 'BGE-M3 (~543MB, multilingual, 100+ langs)',
    kind: 'local', bucket: 'large', dimensions: 1024, sizeMB: 543,
    modelFile: 'bge-m3.onnx', hfRepo: 'Xenova/bge-m3',
    // Sengaja terkuantisasi (543MB, berkas mandiri). Varian presisi penuh
    // repo ini adalah model.onnx 0,6MB + model.onnx_data 2,16GB (bobot
    // EKSTERNAL). transformers.js v2 membuat sesi dari buffer di memori
    // (InferenceSession.create(buffer)) dan tak mengenal berkas pendamping,
    // jadi varian 2GB itu TIDAK bisa dimuat di stack ini — lihat
    // docs/MODEL-HOSTING.md. Diverifikasi 2026-07-26.
  },
  // NB: dimensi embedding di-cap ≤1536 (kolom pgvector vector(1536), HNSW ≤2000).
  // Model >1536 dims (mis. Qwen3-8B 4096d) tidak didaftarkan agar index valid.

  /* ── server embedding sendiri (VPS) ──────────────────────────────────
     Bobot tinggal di VPS; aplikasi hanya memanggil HTTP. Inilah jalur untuk
     BGE-M3 PRESISI PENUH (~2,16 GB, bobot eksternal) yang tak bisa dimuat
     transformers.js v2 maupun dijalankan di lambda Vercel. Server-nya ada di
     `services/embedding-server/` (transformers v3). Endpoint & token diatur
     lewat EMBEDDING_SELFHOSTED_URL / _TOKEN. */
  {
    id: 'bge-m3-selfhosted',
    label: 'BGE-M3 presisi penuh — server sendiri (VPS)',
    kind: 'selfhosted', bucket: 'large', dimensions: 1024,
    hfRepo: 'Xenova/bge-m3', servedModel: 'bge-m3',
  },

  // API bucket — no local weights, best quality-per-effort
  {
    id: 'text-embedding-3-small',
    label: 'OpenAI text-embedding-3-small (API)',
    kind: 'api', bucket: 'api', dimensions: 1536, provider: 'openai',
  },
  {
    id: 'text-embedding-3-large',
    label: 'OpenAI text-embedding-3-large @1536d (API)',
    // di-request pada 1536 dims (didukung native OpenAI) agar muat kolom + index.
    kind: 'api', bucket: 'api', dimensions: 1536, provider: 'openai',
  },
  {
    id: 'embed-v4.0',
    label: 'Cohere Embed v4.0 (API, multilingual)',
    kind: 'api', bucket: 'api', dimensions: 1536, provider: 'cohere',
  },
];

export function getLlmModel(id: string): LlmModel | undefined {
  return LLM_MODELS.find((m) => m.id === id);
}

export function getEmbeddingModel(id: string): EmbeddingModel | undefined {
  return EMBEDDING_MODELS.find((m) => m.id === id);
}

/** Distinct providers referenced anywhere, for building the API-key form. */
export const ALL_PROVIDERS: Provider[] = Array.from(
  new Set<Provider>([
    ...LLM_MODELS.map((m) => m.provider),
    ...EMBEDDING_MODELS.map((m) => m.provider).filter(Boolean) as Provider[],
  ]),
);
