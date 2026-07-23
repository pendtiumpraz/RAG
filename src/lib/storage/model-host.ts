import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { EmbeddingModel } from '@/lib/models/registry';
import { downloadSuperadminDriveFile } from './gdrive';
import { downloadSuperadminSharepointFile } from './sharepoint';

/**
 * Ensures the local weight files for a LOCAL embedding model exist on
 * disk, pulling them from the superadmin's central Google Drive or
 * SharePoint folder the first time. Returns the local directory path
 * transformers.js should load from.
 *
 * "Embeddings pakai Google Drive superadmin" → the MODEL is central,
 * downloaded once, cached, and shared by all tenants. The per-tenant
 * knowledge base (the vectors) is never shared — see db/tenant.ts.
 */
export async function ensureModelFile(model: EmbeddingModel): Promise<string> {
  const cacheDir = process.env.MODEL_CACHE_DIR || './.model-cache';
  const modelDir = path.join(cacheDir, model.id);
  const marker = path.join(modelDir, '.ready');

  // Already downloaded?
  try {
    await fs.access(marker);
    return modelDir;
  } catch { /* need to fetch */ }

  await fs.mkdir(modelDir, { recursive: true });

  const source = process.env.EMBEDDING_MODEL_SOURCE || 'gdrive';
  if (model.modelFile) {
    switch (source) {
      case 'gdrive':
        await downloadSuperadminDriveFile(model.modelFile, modelDir);
        break;
      case 'sharepoint':
        await downloadSuperadminSharepointFile(model.modelFile, modelDir);
        break;
      case 'http':
      case 'local':
        // transformers.js will fall back to its HF repo (env.allowRemoteModels)
        break;
    }
  }

  await fs.writeFile(marker, new Date().toISOString());
  // If nothing was downloaded, hand back the HF repo id so transformers.js
  // can resolve it from the hub as a fallback.
  const hasLocal = model.modelFile !== undefined && source !== 'local' && source !== 'http';
  return hasLocal ? modelDir : (model.hfRepo ?? model.id);
}
