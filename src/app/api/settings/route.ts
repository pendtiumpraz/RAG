import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser, requireRole } from '@/modules/core/auth';
import { settingsService } from '@/modules/settings/settings.service';
import { ValidationError } from '@/modules/chatbot/chatbot.service';
import { ALL_PROVIDERS } from '@/modules/core/registry';
import { listLlmModels } from '@/modules/chat/llm-catalog';
import { listEmbeddingModels } from '@/modules/knowledge/embeddings/catalog';
import { listSavedProviders } from '@/modules/settings/credentials.repository';
import { MODEL_RERANK } from '@/modules/chat/rerank-penyedia';

export const runtime = 'nodejs';

/** GET /api/settings — katalog model + setelan aktif tenant. */
export async function GET() {
  const user = await getCurrentUser();
  const [active, embeddingModels, savedKeys, llmModels] = await Promise.all([
    settingsService.get(user.tenantId),
    listEmbeddingModels(), // registry statis + model dari server VPS terdaftar
    listSavedProviders(user.tenantId),
    listLlmModels(), // registry cloud + model dari server LLM sendiri
  ]);
  return NextResponse.json({
    llmModels,
    embeddingModels,
    /* Katalog reranker. Dikirim SELALU, termasuk saat tak ada satu pun yang
       aktif — kalau tidak, satu-satunya cara pengguna tahu fitur ini ada
       adalah membaca kode. */
    rerankModels: MODEL_RERANK,
    providers: ALL_PROVIDERS,
    // hanya NAMA provider yang punya kunci — nilainya tak pernah keluar.
    // Tanpa ini UI tak bisa memberi tahu bahwa penyimpanan berhasil, karena
    // input sengaja dikosongkan setelah simpan.
    savedKeys,
    active,
    // dipakai UI untuk memutuskan menampilkan panel kelola server VPS
    role: user.role,
  });
}

const Body = z.object({
  activeLlmModel: z.string().optional(),
  activeEmbeddingModel: z.string().optional(),
  /* .nullable() WAJIB di samping .optional(): null berarti "matikan
     reranker", undefined berarti "jangan sentuh". Skema yang hanya optional
     menolak null dengan galat validasi mentah — cacat yang persis pernah
     terjadi pada kolom `context` chatbot dan muncul di layar sebagai
     "[object Object]". */
  activeRerankModel: z.string().nullable().optional(),
  systemPrompt: z.string().optional(),
  themeConfig: z.record(z.unknown()).optional(),
  apiKeys: z.record(z.string()).optional(),
});

/** POST /api/settings — simpan model aktif / prompt / theme / API keys. */
export async function POST(req: NextRequest) {
  const user = await requireRole('superadmin', 'admin');
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
