import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';
import { getLlmModel, type Provider } from '@/modules/core/registry';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** OpenAI-compatible base URLs for providers that speak the OpenAI wire. */
const OPENAI_COMPAT_BASE: Partial<Record<Provider, string>> = {
  openai: undefined, // native default
  deepseek: 'https://api.deepseek.com',
  xai: 'https://api.x.ai/v1',
  groq: 'https://api.groq.com/openai/v1',
  mistral: 'https://api.mistral.ai/v1',
};

/**
 * Streams a chat completion from whichever provider owns `modelId`.
 * Yields text deltas. The caller (chat route) forwards these as SSE to
 * the embedded widget, so responses arrive token-by-token.
 */
export async function* streamChat(
  modelId: string,
  messages: ChatMessage[],
  apiKey: string,
): AsyncGenerator<string> {
  const model = getLlmModel(modelId);
  if (!model) throw new Error(`Unknown LLM model: ${modelId}`);

  switch (model.provider) {
    case 'anthropic': {
      const client = new Anthropic({ apiKey });
      const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
      const stream = await client.messages.stream({
        model: modelId,
        max_tokens: 2048,
        system: system || undefined,
        messages: messages
          .filter((m) => m.role !== 'system')
          .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      });
      for await (const evt of stream) {
        if (evt.type === 'content_block_delta' && evt.delta.type === 'text_delta') {
          yield evt.delta.text;
        }
      }
      return;
    }

    case 'google': {
      const client = new GoogleGenAI({ apiKey });
      const stream = await client.models.generateContentStream({
        model: modelId,
        contents: messages.map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        })),
      });
      for await (const chunk of stream) {
        if (chunk.text) yield chunk.text;
      }
      return;
    }

    default: {
      // OpenAI + all OpenAI-compatible providers.
      const client = new OpenAI({ apiKey, baseURL: OPENAI_COMPAT_BASE[model.provider] });
      const stream = await client.chat.completions.create({
        model: modelId,
        messages,
        stream: true,
      });
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) yield delta;
      }
    }
  }
}
