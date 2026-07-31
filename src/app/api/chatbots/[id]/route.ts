import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/modules/core/auth';
import { AksesDitolakError, chatbotService, ValidationError } from '@/modules/chatbot/chatbot.service';
import { divisionService } from '@/modules/settings/division.service';

export const runtime = 'nodejs';

const PatchBody = z.object({
  name: z.string().min(1).optional(),
  allowedOrigins: z.array(z.string()).optional(),
  greeting: z.string().optional(),
  enabled: z.boolean().optional(),
  themeConfig: z.record(z.unknown()).optional(),
  context: z.string().max(2000).nullable().optional(),
  /* Kebijakan jawaban (D14). Batas nyata ditegakkan `normalizePolicy` di
     service + CHECK constraint migrasi 0030; zod di sini hanya menolak
     bentuk yang jelas salah supaya galatnya jelas di 400, bukan di 500. */
  temperature: z.number().min(0).max(1).optional(),
  maxTokens: z.number().int().min(256).max(8192).optional(),
  languageMode: z.enum(['auto', 'id', 'en']).optional(),
  tone: z.enum(['netral', 'formal', 'ramah', 'ringkas', 'teknis']).optional(),
  grounding: z.enum(['strict', 'balanced', 'open']).optional(),
  answerRules: z.string().max(2000).nullable().optional(),
  /** Pindah divisi (migrasi 0040) — diabaikan bila pemanggilnya bukan lintas divisi. */
  divisionId: z.string().uuid().nullable().optional(),
});

/** PATCH /api/chatbots/:id — update. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireRole('superadmin', 'admin');
  const { id } = await ctx.params;
  const parsed = PatchBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  try {
    const updated = await chatbotService.update(
      user.tenantId, await divisionService.aktor(user), id, parsed.data as never);
    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof AksesDitolakError) return NextResponse.json({ error: e.message }, { status: 403 });
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 404 });
    throw e;
  }
}

/** DELETE /api/chatbots/:id — SOFT delete + kaskade app-level (Rule #3). */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireRole('superadmin', 'admin');
  const { id } = await ctx.params;
  try {
    await chatbotService.softDelete(user.tenantId, await divisionService.aktor(user), id);
    return NextResponse.json({ ok: true, softDeleted: id });
  } catch (e) {
    if (e instanceof AksesDitolakError) return NextResponse.json({ error: e.message }, { status: 403 });
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 404 });
    throw e;
  }
}
