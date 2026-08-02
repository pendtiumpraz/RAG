import { eq } from 'drizzle-orm';
import { cariRerank } from '@/modules/chat/rerank-penyedia';
import { tenantSettings, type ThemeConfig } from '@/modules/core/db';
import { withTenant } from '@/modules/core/db/tenant-context';
import { resolveLlmModel } from '@/modules/chat/llm-catalog';
import { resolveEmbeddingModel } from '@/modules/knowledge/embeddings/catalog';
import { saveApiKey } from './credentials.repository';
import { ValidationError } from '@/modules/chatbot/chatbot.service';

export const settingsService = {
  get(tenantId: string) {
    return withTenant(tenantId, async (tx) =>
      (await tx.select().from(tenantSettings)
        .where(eq(tenantSettings.tenantId, tenantId)).limit(1))[0] ?? null,
    );
  },

  /** Update model aktif (validasi terhadap registry), prompt, theme; upsert. */
  async update(tenantId: string, input: Partial<{
    activeLlmModel: string; activeEmbeddingModel: string;
    /** null = MATIKAN reranker. Bedakan dari undefined = jangan diubah. */
    activeRerankModel: string | null;
    systemPrompt: string; themeConfig: ThemeConfig;
    apiKeys: Record<string, string>;
  }>) {
    // Divalidasi terhadap KATALOG (cloud + model server sendiri).
    if (input.activeLlmModel && !(await resolveLlmModel(input.activeLlmModel)))
      throw new ValidationError(`Model LLM tidak dikenal: ${input.activeLlmModel}`);
    // Divalidasi terhadap KATALOG (registry + model VPS terdeteksi), bukan
    // registry statis saja — kalau tidak, model dari VPS akan selalu ditolak.
    if (input.activeEmbeddingModel && !(await resolveEmbeddingModel(input.activeEmbeddingModel)))
      throw new ValidationError(`Model embedding tidak dikenal: ${input.activeEmbeddingModel}`);
    /* null sengaja LOLOS pemeriksaan ini: ia berarti "matikan", bukan "model
       bernama null". Memakai `input.activeRerankModel &&` sudah cukup karena
       string kosong pun bukan model yang sah. */
    if (input.activeRerankModel && !cariRerank(input.activeRerankModel))
      throw new ValidationError(`Reranker tidak dikenal: ${input.activeRerankModel}`);

    await withTenant(tenantId, async (tx) => {
      await tx.insert(tenantSettings)
        .values({
          tenantId,
          activeLlmModel: input.activeLlmModel,
          activeEmbeddingModel: input.activeEmbeddingModel,
          activeRerankModel: input.activeRerankModel ?? null,
          systemPrompt: input.systemPrompt,
          themeConfig: input.themeConfig,
        })
        .onConflictDoUpdate({
          target: tenantSettings.tenantId,
          set: {
            ...(input.activeLlmModel ? { activeLlmModel: input.activeLlmModel } : {}),
            ...(input.activeEmbeddingModel ? { activeEmbeddingModel: input.activeEmbeddingModel } : {}),
            ...(input.activeRerankModel !== undefined ? { activeRerankModel: input.activeRerankModel } : {}),
            ...(input.systemPrompt !== undefined ? { systemPrompt: input.systemPrompt } : {}),
            ...(input.themeConfig !== undefined ? { themeConfig: input.themeConfig } : {}),
            updatedAt: new Date(),
          },
        });
    });

    if (input.apiKeys) {
      for (const [provider, key] of Object.entries(input.apiKeys)) {
        if (key) await saveApiKey(tenantId, provider, key);
      }
    }
  },
};
