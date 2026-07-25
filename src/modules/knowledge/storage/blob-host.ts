import type { EmbeddingModel } from '@/modules/core/registry';

/**
 * MODEL HOST — Vercel Blob (publik).
 *
 * Peran blob di sistem ini SAMA dengan folder Drive/SharePoint superadmin:
 * menyimpan BOBOT MODEL embedding (~80MB s/d ~2GB) yang dipakai bersama
 * semua tenant. Ini infrastruktur bersama — vektor hasil embedding tetap
 * per-tenant dan tidak pernah bercampur (lihat db/tenant-context.ts).
 *
 * Tata letak di blob mengikuti struktur repo Hugging Face, supaya
 * transformers.js bisa menariknya langsung tanpa kode unduh khusus:
 *
 *   <BLOB_PUBLIC_URL>/models/<hfRepo>/config.json
 *   <BLOB_PUBLIC_URL>/models/<hfRepo>/tokenizer.json
 *   <BLOB_PUBLIC_URL>/models/<hfRepo>/onnx/model_quantized.onnx
 *
 * Sisi baca cukup mengarahkan env.remoteHost + env.remotePathTemplate
 * (lihat embeddings/local.ts); sisi unggah dikerjakan superadmin lewat
 * `npm run models:push` (scripts/push-model.ts).
 */

/** Prefix folder di dalam blob store. */
export const BLOB_MODEL_PREFIX = 'models';

/**
 * Base URL publik blob store, tanpa slash di ujung.
 * Contoh: https://ab12cd34.public.blob.vercel-storage.com
 */
export function blobBaseUrl(): string | null {
  const raw = process.env.EMBEDDING_MODEL_BLOB_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, '');
}

/** Path objek di dalam blob store untuk satu berkas model. */
export function modelBlobPath(hfRepo: string, file: string): string {
  return `${BLOB_MODEL_PREFIX}/${hfRepo}/${file.replace(/^\/+/, '')}`;
}

/** URL publik lengkap satu berkas model. */
export function modelBlobUrl(base: string, hfRepo: string, file: string): string {
  return `${base.replace(/\/+$/, '')}/${modelBlobPath(hfRepo, file)}`;
}

/**
 * Berkas ONNX yang benar-benar dimuat transformers.js untuk model ini.
 * Default v2 adalah varian terkuantisasi; model yang ditandai
 * `quantized: false` (mis. BGE-M3 ~2.2GB) memakai bobot presisi penuh.
 * Yang diunggah HARUS sama dengan yang dimuat — kalau tidak, runtime
 * akan meleset ke berkas yang tak ada di blob.
 */
export function onnxFileFor(model: Pick<EmbeddingModel, 'quantized'>): string {
  return model.quantized === false ? 'onnx/model.onnx' : 'onnx/model_quantized.onnx';
}

/**
 * Berkas pendamping (tokenizer/config) yang mungkin ada di sebuah repo.
 * Tidak semua model punya semuanya — pengunggah melewati yang 404, tapi
 * `config.json` + `tokenizer.json` wajib ada, kalau tidak model tak bisa dimuat.
 */
export const MODEL_REQUIRED_FILES = ['config.json', 'tokenizer.json'] as const;

export const MODEL_OPTIONAL_FILES = [
  'tokenizer_config.json',
  'special_tokens_map.json',
  'preprocessor_config.json',
  'generation_config.json',
  'vocab.txt',
  'vocab.json',
  'merges.txt',
  'sentencepiece.bpe.model',
  'spiece.model',
] as const;

/**
 * Berkas pendamping bobot EKSTERNAL. Model ONNX >2GB memecah bobotnya ke
 * `<nama>.onnx_data` karena protobuf dibatasi 2GB; berkas `.onnx`-nya sendiri
 * lalu hanya berisi graf (ratusan KB).
 *
 * PERINGATAN: transformers.js v2 membuat sesi dari buffer di memori dan TIDAK
 * mengenal berkas pendamping ini, jadi model semacam itu tak bisa dimuat di
 * stack sekarang. Pengunggah tetap ikut me-mirror-nya bila ada supaya isi blob
 * lengkap dan siap saat runtime di-upgrade (lihat docs/MODEL-HOSTING.md).
 */
export function onnxDataFileFor(model: Pick<EmbeddingModel, 'quantized'>): string {
  return `${onnxFileFor(model)}_data`;
}

/** Semua berkas yang perlu di-mirror untuk satu model, ONNX di urutan terakhir. */
export function modelFileManifest(model: Pick<EmbeddingModel, 'quantized'>): {
  required: string[]; optional: string[]; onnx: string; onnxData: string;
} {
  return {
    required: [...MODEL_REQUIRED_FILES],
    optional: [...MODEL_OPTIONAL_FILES],
    onnx: onnxFileFor(model),
    onnxData: onnxDataFileFor(model),
  };
}
