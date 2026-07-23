import { getEmbeddingModel } from '@/modules/core/registry';
import { embedApi } from './api';
// './local' (transformers.js, berat) di-import DINAMIS hanya saat model lokal
// dipakai — agar bundle fungsi serverless (Vercel) tetap ramping saat pakai
// embedding API. Untuk on-prem/VPS, jalur lokal tetap tersedia penuh.

/**
 * Dimensi kolom pgvector (documents/memory_notes). Dipilih 1536 karena:
 *  • cukup untuk semua model aktif (≤1536 dims),
 *  • ≤2000 → HNSW index valid.
 * Semua vektor di-zero-pad ke ukuran ini sebelum masuk DB; padding nol
 * TIDAK mengubah dot-product / norma, jadi peringkat cosine tetap sama.
 */
export const VECTOR_DIM = 1536;

export function padVector(v: number[], dim = VECTOR_DIM): number[] {
  if (v.length === dim) return v;
  if (v.length > dim) return v.slice(0, dim); // guard; model >dim tak didaftarkan
  const out = v.slice();
  while (out.length < dim) out.push(0);
  return out;
}

export interface EmbedContext {
  tenantId: string;
  /** resolver for the tenant's provider API key (for api embedders) */
  getApiKey: (provider: string) => Promise<string | null>;
}

/**
 * Embed one or more texts with the given model id. Dispatches to the
 * local ONNX runtime or a remote embedding API based on the registry.
 * Returns one vector per input text.
 */
export async function embed(
  modelId: string,
  texts: string[],
  ctx: EmbedContext,
): Promise<number[][]> {
  const model = getEmbeddingModel(modelId);
  if (!model) throw new Error(`Unknown embedding model: ${modelId}`);

  let vectors: number[][];
  if (model.kind === 'local') {
    const { embedLocal } = await import('./local');
    vectors = await embedLocal(model, texts);
  } else {
    const apiKey = await ctx.getApiKey(model.provider!);
    if (!apiKey) throw new Error(`No API key configured for ${model.provider}`);
    vectors = await embedApi(model, texts, apiKey);
  }
  // Samakan ke dimensi kolom pgvector (zero-pad) — konsisten insert & query.
  return vectors.map((v) => padVector(v));
}
