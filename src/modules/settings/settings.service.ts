import { eq } from 'drizzle-orm';
import { tenantSettings, type ThemeConfig } from '@/modules/core/db';
import { withTenant } from '@/modules/core/db/tenant-context';
import { getLlmModel, getEmbeddingModel } from '@/modules/core/registry';
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
    systemPrompt: string; themeConfig: ThemeConfig;
    apiKeys: Record<string, string>;
  }>) {
    if (input.activeLlmModel && !getLlmModel(input.activeLlmModel))
      throw new ValidationError(`Model LLM tidak dikenal: ${input.activeLlmModel}`);
    if (input.activeEmbeddingModel && !getEmbeddingModel(input.activeEmbeddingModel))
      throw new ValidationError(`Model embedding tidak dikenal: ${input.activeEmbeddingModel}`);

    await withTenant(tenantId, async (tx) => {
      await tx.insert(tenantSettings)
        .values({
          tenantId,
          activeLlmModel: input.activeLlmModel,
          activeEmbeddingModel: input.activeEmbeddingModel,
          systemPrompt: input.systemPrompt,
          themeConfig: input.themeConfig,
        })
        .onConflictDoUpdate({
          target: tenantSettings.tenantId,
          set: {
            ...(input.activeLlmModel ? { activeLlmModel: input.activeLlmModel } : {}),
            ...(input.activeEmbeddingModel ? { activeEmbeddingModel: input.activeEmbeddingModel } : {}),
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
