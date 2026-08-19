import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AksesDitolakError, chatbotService } from '@/modules/chatbot/chatbot.service';
import { apiRoute } from '../../_guard';
import { API_AKTOR } from '../../_actor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/* PUT diperlakukan sebagai PARTIAL update: chatbotService.update memang
   partial dan tak ada semantik "full replace" di service. Bentuk sama dengan
   PatchBody dashboard (chatbots/[id]/route.ts). */
const PatchBody = z.object({
  name: z.string().min(1).optional(),
  allowedOrigins: z.array(z.string()).optional(),
  greeting: z.string().optional(),
  enabled: z.boolean().optional(),
  themeConfig: z.record(z.unknown()).optional(),
  context: z.string().max(2000).nullable().optional(),
  temperature: z.number().min(0).max(1).optional(),
  maxTokens: z.number().int().min(256).max(8192).optional(),
  languageMode: z.enum(['auto', 'id', 'en']).optional(),
  tone: z.enum(['netral', 'formal', 'ramah', 'ringkas', 'teknis']).optional(),
  grounding: z.enum(['strict', 'balanced', 'open']).optional(),
  answerRules: z.string().max(2000).nullable().optional(),
  divisionId: z.string().uuid().nullable().optional(),
});

/** PUT /api/v1/chatbots/:id — update (scope write). */
export const PUT = apiRoute<Ctx>('write', async (req, ctx, caller) => {
  const { id } = await ctx.params;
  const parsed = PatchBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Input tidak valid' }, { status: 400 });
  }
  try {
    const updated = await chatbotService.update(caller.tenantId, API_AKTOR, id, parsed.data as never);
    return NextResponse.json({
      chatbot: chatbotService.tanpaRahasia(updated),
      snippet: chatbotService.embedSnippet(updated.publicKey),
    });
  } catch (e) {
    if (e instanceof AksesDitolakError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e; // ValidationError → 422 di apiRoute
  }
});

/** DELETE /api/v1/chatbots/:id — SOFT delete + kaskade app-level (scope write). */
export const DELETE = apiRoute<Ctx>('write', async (_req, ctx, caller) => {
  const { id } = await ctx.params;
  try {
    await chatbotService.softDelete(caller.tenantId, API_AKTOR, id);
    return NextResponse.json({ ok: true, softDeleted: id });
  } catch (e) {
    if (e instanceof AksesDitolakError) return NextResponse.json({ error: e.message }, { status: 403 });
    throw e;
  }
});
