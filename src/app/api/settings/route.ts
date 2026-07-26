import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/modules/core/auth';
import { settingsService } from '@/modules/settings/settings.service';
import { ValidationError } from '@/modules/chatbot/chatbot.service';
import { LLM_MODELS, ALL_PROVIDERS } from '@/modules/core/registry';
import { listEmbeddingModels } from '@/modules/knowledge/embeddings/catalog';

export const runtime = 'nodejs';

/** GET /api/settings — katalog model + setelan aktif tenant. */
export async function GET() {
  const user = await getCurrentUser();
  const [active, embeddingModels] = await Promise.all([
    settingsService.get(user.tenantId),
    listEmbeddingModels(), // registry statis + model dari server VPS terdaftar
  ]);
  return NextResponse.json({
    llmModels: LLM_MODELS,
    embeddingModels,
    providers: ALL_PROVIDERS,
    active,
    // dipakai UI untuk memutuskan menampilkan panel kelola server VPS
    role: user.role,
  });
}

const Body = z.object({
  activeLlmModel: z.string().optional(),
  activeEmbeddingModel: z.string().optional(),
  systemPrompt: z.string().optional(),
  themeConfig: z.record(z.unknown()).optional(),
  apiKeys: z.record(z.string()).optional(),
});

/** POST /api/settings — simpan model aktif / prompt / theme / API keys. */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });

  try {
    await settingsService.update(user.tenantId, parsed.data as never);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 422 });
    throw e;
  }
}
