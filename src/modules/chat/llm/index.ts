import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';
import { type Provider } from '@/modules/core/registry';
import { resolveLlmModel } from '../llm-catalog';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Non-stream helper: kumpulkan seluruh stream jadi satu string (dipakai agent). */
export async function completeChat(
  modelId: string,
  messages: ChatMessage[],
  apiKey: string,
  maxChars = 8000,
): Promise<string> {
  let full = '';
  for await (const delta of streamChat(modelId, messages, apiKey)) {
    full += delta;
    if (full.length > maxChars) break;
  }
  return full;
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
  // Katalog = registry cloud + model dari server LLM sendiri, jadi async.
  const model = await resolveLlmModel(modelId);
  if (!model) throw new Error(`Unknown LLM model: ${modelId}`);

  // Server sendiri (Ollama/vLLM/LM Studio): protokol OpenAI, alamat & token
  // datang dari pendaftaran server — bukan dari kunci provider per-tenant.
  if (model.provider === 'selfhosted') {
    const served = model.servedModel ?? model.id;
    const { llmServerService } = await import('../llm-server.service');
    const srv = await llmServerService.resolveForModel(served);
    if (!srv) throw new Error(`Tak ada server LLM aktif yang melayani model "${served}"`);
    const client = new OpenAI({ apiKey: srv.token ?? 'not-needed', baseURL: srv.baseUrl });
    const stream = await client.chat.completions.create({
      model: served,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream: true,
    });
    for await (const chunk of stream) {
      const d = chunk.choices[0]?.delta?.content;
      if (d) yield d;
    }
    return;
  }

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
