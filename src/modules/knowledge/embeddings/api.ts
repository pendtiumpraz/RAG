import OpenAI from 'openai';
import type { EmbeddingModel } from '@/modules/core/registry';

/**
 * Remote embedding APIs. OpenAI is native; Cohere and other
 * OpenAI-compatible endpoints reuse the same client with a baseURL.
 */
export async function embedApi(
  model: EmbeddingModel,
  texts: string[],
  apiKey: string,
): Promise<number[][]> {
  switch (model.provider) {
    case 'openai': {
      const client = new OpenAI({ apiKey });
      const res = await client.embeddings.create({ model: model.id, input: texts });
      return res.data.map((d) => d.embedding);
    }
    case 'cohere': {
      const res = await fetch('https://api.cohere.com/v2/embed', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: model.id,
          texts,
          input_type: 'search_document',
          embedding_types: ['float'],
        }),
      });
      if (!res.ok) throw new Error(`Cohere embed failed: ${res.status}`);
      const json = await res.json();
      return json.embeddings.float as number[][];
    }
    default:
      throw new Error(`Unsupported embedding API provider: ${model.provider}`);
  }
}
