import { resolveEmbeddingModel } from './catalog';
import { embedApi } from './api';
// './local' (transformers.js, berat) di-import DINAMIS hanya saat model lokal
// dipakai — agar bundle fungsi serverless (Vercel) tetap ramping saat pakai
// embedding API. Untuk on-prem/VPS, jalur lokal tetap tersedia penuh.

/**
 * Batas ATAS dimensi yang boleh didaftarkan — bukan lagi dimensi kolom.
 *
 * Sejak migrasi 0035 kolomnya `halfvec` TANPA batasan dimensi, jadi tiap
 * baris menyimpan dimensi aslinya: 384 untuk MiniLM, bukan 1.536 berpadding.
 * Angka ini tinggal menjaga satu hal: HNSW pgvector menolak dimensi di atas
 * 2.000, jadi model yang lebih besar dari itu tak boleh masuk registry.
 */
export const VECTOR_DIM = 1536;

/**
 * Potong vektor yang melebihi batas. TIDAK lagi memberi padding.
 *
 * Padding nol dulu diperlukan karena kolomnya `vector(1536)` — satu kolom
 * pgvector hanya bisa satu dimensi, jadi model 384 dimensi harus dipanjangkan.
 * Biayanya besar dan tersembunyi: tiga perempat setiap vektor adalah NOL yang
 * tetap dibayar penuh di disk dan RAM — 6.148 byte untuk yang sebenarnya
 * cukup 776.
 *
 * Kolom halfvec tanpa batasan menghapus keharusan itu. Baris LAMA yang
 * terlanjur berpadding tetap terbaca: kueri memakai subvector(x, 1, N), yang
 * mengambil bagian sama persis entah sisanya nol atau memang tak ada.
 */
export function padVector(v: number[], dim = VECTOR_DIM): number[] {
  // Penjaga, bukan jalur normal: model di atas batas tak didaftarkan sama
  // sekali. Kalau toh lolos, dipotong daripada menolak seluruh ingest.
  return v.length > dim ? v.slice(0, dim) : v;
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
  // Katalog = registry statis + model yang ditemukan di server VPS, jadi
  // model baru di VPS bisa dipakai tanpa deploy ulang.
  const model = await resolveEmbeddingModel(modelId);
  if (!model) throw new Error(`Unknown embedding model: ${modelId}`);

  let vectors: number[][];
  if (model.kind === 'local') {
    const { embedLocal } = await import('./local');
    vectors = await embedLocal(model, texts);
  } else if (model.kind === 'selfhosted') {
    // Bobot tinggal di VPS; tak ada model berat yang dimuat di proses ini.
    const { embedSelfhosted } = await import('./selfhosted');
    vectors = await embedSelfhosted(model, texts);
  } else {
    const apiKey = await ctx.getApiKey(model.provider!);
    if (!apiKey) throw new Error(`No API key configured for ${model.provider}`);
    vectors = await embedApi(model, texts, apiKey);
  }
  // Dimensi ASLI dipertahankan (migrasi 0035). Hanya yang melebihi batas
  // HNSW yang dipotong — dan model semacam itu memang tak didaftarkan.
  return vectors.map((v) => padVector(v));
}

/**
 * Dimensi ASLI model, sebelum zero-padding.
 *
 * Disimpan bersama tiap potongan (documents.embedding_dims) supaya indeks
 * parsial berdimensi asli tahu baris mana miliknya. Memakai nama model di SQL
 * akan menyimpang begitu registry bertambah; angka tak bisa menyimpang.
 */
export async function embeddingDims(modelId: string): Promise<number | null> {
  const model = await resolveEmbeddingModel(modelId);
  return model?.dimensions ?? null;
}
