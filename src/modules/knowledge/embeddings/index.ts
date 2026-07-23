import { getEmbeddingModel } from '@/modules/core/registry';
import { embedLocal } from './local';
import { embedApi } from './api';

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

  if (model.kind === 'local') {
    return embedLocal(model, texts);
  }
  const apiKey = await ctx.getApiKey(model.provider!);
  if (!apiKey) throw new Error(`No API key configured for ${model.provider}`);
  return embedApi(model, texts, apiKey);
}
