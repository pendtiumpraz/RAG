import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { EmbeddingModel } from '@/modules/core/registry';
import { downloadSuperadminDriveFile } from './gdrive';
import { downloadSuperadminSharepointFile } from './sharepoint';

/**
 * Ensures the local weight files for a LOCAL embedding model exist on
 * disk, pulling them from the superadmin's central Google Drive or
 * SharePoint folder the first time. Returns the local directory path
 * transformers.js should load from.
 *
 * "Embeddings pakai Google Drive superadmin" â†’ the MODEL is central,
 * downloaded once, cached, and shared by all tenants. The per-tenant
 * knowledge base (the vectors) is never shared â€” see db/tenant.ts.
 */
export async function ensureModelFile(model: EmbeddingModel): Promise<string> {
  const source = process.env.EMBEDDING_MODEL_SOURCE || 'gdrive';

  // Sumber 'http'/'local' ATAU model tanpa modelFile → biarkan transformers.js
  // memakai cache HF-nya sendiri; kembalikan repo id (JANGAN folder lokal kosong).
  if (source === 'http' || source === 'local' || !model.modelFile) {
    return model.hfRepo ?? model.id;
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
