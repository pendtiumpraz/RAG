import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, tenantSettings, providerCredentials } from '@/lib/db';
import { withTenant } from '@/lib/db/tenant';
import { encryptSecret } from '@/lib/crypto';
import { getCurrentTenantId } from '@/lib/auth';
import { LLM_MODELS, EMBEDDING_MODELS, ALL_PROVIDERS } from '@/lib/models/registry';

export const runtime = 'nodejs';

// Expose the catalog so the Settings UI can render the dropdowns.
export async function GET() {
  const tenantId = await getCurrentTenantId();
  const settings = await withTenant(tenantId, async (tx) =>
    (await tx.select().from(tenantSettings).where(eq(tenantSettings.tenantId, tenantId)).limit(1))[0],
  );
  return NextResponse.json({
    llmModels: LLM_MODELS,
    embeddingModels: EMBEDDING_MODELS,
    providers: ALL_PROVIDERS,
    active: settings ?? null,
  });
}

const Body = z.object({
  activeLlmModel: z.string().optional(),
  activeEmbeddingModel: z.string().optional(),
  systemPrompt: z.string().optional(),
  // provider → API key. Empty string clears; undefined leaves unchanged.
  apiKeys: z.record(z.string()).optional(),
});

export async function POST(req: NextRequest) {
  const tenantId = await getCurrentTenantId();
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  const { activeLlmModel, activeEmbeddingModel, systemPrompt, apiKeys } = parsed.data;

  await withTenant(tenantId, async (tx) => {
    // Upsert the single active model selection.
    await tx.insert(tenantSettings)
      .values({ tenantId, activeLlmModel, activeEmbeddingModel, systemPrompt })
      .onConflictDoUpdate({
        target: tenantSettings.tenantId,
        set: {
          ...(activeLlmModel ? { activeLlmModel } : {}),
          ...(activeEmbeddingModel ? { activeEmbeddingModel } : {}),
          ...(systemPrompt !== undefined ? { systemPrompt } : {}),
          updatedAt: new Date(),
        },
      });

    // Save/replace encrypted API keys per provider.
    if (apiKeys) {
      for (const [provider, key] of Object.entries(apiKeys)) {
        if (!key) continue;
        await tx.delete(providerCredentials).where(eq(providerCredentials.provider, provider));
        await tx.insert(providerCredentials).values({
          tenantId, provider, encryptedKey: encryptSecret(key),
        });
      }
    }
  });

  return NextResponse.json({ ok: true });
}
