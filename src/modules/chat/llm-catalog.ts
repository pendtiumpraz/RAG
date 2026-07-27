import { LLM_MODELS, type LlmModel } from '@/modules/core/registry';
import { llmServerService } from './llm-server.service';

/**
 * KATALOG MODEL CHAT = registry statis (penyedia cloud) + model yang
 * DITEMUKAN di server LLM sendiri (Ollama/vLLM/LM Studio/…).
 *
 * Polanya sengaja sama dengan katalog embedding: menambah model di server
 * sendiri cukup "Test koneksi", tanpa deploy ulang aplikasi.
 *
 * Id model yang ditemukan diberi awalan `vps:` supaya tak pernah bentrok
 * dengan id penyedia cloud. Id inilah yang tersimpan di
 * `tenant_settings.active_llm_model`, jadi bentuknya harus stabil.
 */

export const VPS_LLM_PREFIX = 'vps:';

function toLlmModel(serverName: string, modelId: string): LlmModel {
  return {
    id: `${VPS_LLM_PREFIX}${modelId}`,
    provider: 'selfhosted',
    label: `${modelId} — ${serverName}`,
    // Jendela konteks server sendiri ditentukan oleh model & konfigurasi
    // runtime-nya; tak ada cara membacanya lewat API OpenAI, jadi jangan
    // mengarang angka. Nilai ini hanya informasional.
    contextWindow: 0,
    servedModel: modelId,
  };
}

/** Seluruh model chat yang bisa dipilih saat ini. */
export async function listLlmModels(): Promise<LlmModel[]> {
  const discovered: LlmModel[] = [];
  try {
    for (const s of await llmServerService.list()) {
      if (!s.enabled) continue;
      for (const m of s.models ?? []) discovered.push(toLlmModel(s.name, m.id));
    }
  } catch (err) {
    // Katalog tak boleh menjatuhkan halaman Settings kalau DB bermasalah;
    // model cloud tetap bisa dipakai.
    console.error('[llm-catalog] gagal membaca server LLM:', err);
  }

  const seen = new Set<string>();
  const unique = discovered.filter((m) => !seen.has(m.id) && seen.add(m.id));
  return [...LLM_MODELS, ...unique];
}

/** Cari satu model chat menurut id, cloud maupun hasil deteksi. */
export async function resolveLlmModel(id: string): Promise<LlmModel | undefined> {
  if (!id.startsWith(VPS_LLM_PREFIX)) return LLM_MODELS.find((m) => m.id === id);
  return (await listLlmModels()).find((m) => m.id === id);
}
