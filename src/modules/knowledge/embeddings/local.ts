import { pipeline, env } from '@xenova/transformers';
import type { EmbeddingModel } from '@/modules/core/registry';
import { ensureModelFile } from '@/modules/knowledge/storage/model-host';

/**
 * Local ONNX embeddings via transformers.js.
 *
 * The model weights (the 80MB / 2GB files) are NOT bundled. On first use
 * ensureModelFile() pulls them from the superadmin's Google Drive /
 * SharePoint folder into the on-disk cache, then transformers.js loads
 * them from there. This is the "embedding model comes from Drive" flow â€”
 * and it is shared infrastructure: the MODEL is central, while the
 * VECTORS it produces are written per-tenant and never shared.
 */

// Cache downloaded weights under a persistent directory (mounted volume
// in docker-compose) so we download from Drive once per model, not per run.
env.cacheDir = process.env.MODEL_CACHE_DIR || './.model-cache';
env.allowRemoteModels = true; // fallback to HF hub if not on Drive

type Extractor = (texts: string[], opts: object) => Promise<{ data: Float32Array; dims: number[] }>;
const extractors = new Map<string, Promise<Extractor>>();

async function getExtractor(model: EmbeddingModel): Promise<Extractor> {
  let p = extractors.get(model.id);
  if (!p) {
    p = (async () => {
      // Make sure the weight file exists locally (from Drive/SharePoint).
      const localRepo = await ensureModelFile(model);
      const pipe = await pipeline('feature-extraction', localRepo);
      return (texts: string[], opts: object) =>
        pipe(texts, opts) as Promise<{ data: Float32Array; dims: number[] }>;
    })();
    extractors.set(model.id, p);
  }
  return p;
}

export async function embedLocal(
  model: EmbeddingModel,
  texts: string[],
): Promise<number[][]> {
  const extractor = await getExtractor(model);
  const out = await extractor(texts, { pooling: 'mean', normalize: true });
  // out.data is a flat Float32Array of shape [texts.length, dimensions]
  const dim = model.dimensions;
  const vectors: number[][] = [];
  for (let i = 0; i < texts.length; i++) {
    vectors.push(Array.from(out.data.slice(i * dim, (i + 1) * dim)));
  }
  return vectors;
}
