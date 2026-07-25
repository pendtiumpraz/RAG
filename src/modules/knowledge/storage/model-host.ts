import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { EmbeddingModel } from '@/modules/core/registry';
import { downloadSuperadminDriveFile } from './gdrive';
import { downloadSuperadminSharepointFile } from './sharepoint';
import { blobBaseUrl } from './blob-host';

/**
 * Menentukan DARI MANA transformers.js memuat bobot model embedding.
 *
 * Model itu infrastruktur BERSAMA: satu salinan dipakai semua tenant.
 * Yang tidak pernah dibagi adalah vektor hasilnya — itu per-tenant
 * (lihat db/tenant-context.ts).
 *
 * EMBEDDING_MODEL_SOURCE:
 *  • blob       — Vercel Blob publik (rekomendasi). Tak ada unduhan manual:
 *                 transformers.js menarik berkas langsung dari blob lewat
 *                 remoteHost yang disetel di embeddings/local.ts, lalu
 *                 menyimpannya di cache lokal.
 *  • http/local — biarkan transformers.js memakai cache/HF hub-nya sendiri.
 *  • gdrive     — folder Drive superadmin (butuh service account).
 *  • sharepoint — drive SharePoint superadmin.
 *
 * Mengembalikan apa yang harus dioper ke `pipeline()`: repo id (biar
 * transformers yang mengambil) atau direktori lokal berisi bobot.
 */
export async function ensureModelFile(model: EmbeddingModel): Promise<string> {
  const source = process.env.EMBEDDING_MODEL_SOURCE || 'gdrive';
  const repoId = model.hfRepo ?? model.id;

  if (source === 'blob') {
    // Gagal cepat & jelas: tanpa base URL, transformers akan diam-diam
    // jatuh ke Hugging Face dan blob-nya jadi sia-sia.
    if (!blobBaseUrl()) {
      throw new Error(
        'EMBEDDING_MODEL_SOURCE=blob tapi EMBEDDING_MODEL_BLOB_URL belum diisi. ' +
        'Isi dengan base URL publik blob store, mis. https://xxxx.public.blob.vercel-storage.com',
      );
    }
    return repoId; // path lengkap dibentuk lewat remoteHost/remotePathTemplate
  }

  // Sumber 'http'/'local' ATAU model tanpa modelFile → biarkan transformers.js
  // memakai cache HF-nya sendiri; kembalikan repo id (JANGAN folder lokal kosong).
  if (source === 'http' || source === 'local' || !model.modelFile) {
    return repoId;
  }

  const cacheDir = process.env.MODEL_CACHE_DIR || './.model-cache';
  const modelDir = path.join(cacheDir, model.id);
  const marker = path.join(modelDir, '.ready');

  // Sudah diunduh dari Drive/SharePoint superadmin?
  try {
    await fs.access(marker);
    return modelDir;
  } catch { /* perlu fetch */ }

  await fs.mkdir(modelDir, { recursive: true });
  if (source === 'gdrive') await downloadSuperadminDriveFile(model.modelFile, modelDir);
  else if (source === 'sharepoint') await downloadSuperadminSharepointFile(model.modelFile, modelDir);
  await fs.writeFile(marker, new Date().toISOString());
  return modelDir;
}
