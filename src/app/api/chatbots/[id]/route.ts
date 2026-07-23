import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/modules/core/auth';
import { chatbotService, ValidationError } from '@/modules/chatbot/chatbot.service';

export const runtime = 'nodejs';

const PatchBody = z.object({
  name: z.string().min(1).optional(),
  allowedOrigins: z.array(z.string()).optional(),
  greeting: z.string().optional(),
  enabled: z.boolean().optional(),
  themeConfig: z.record(z.unknown()).optional(),
});

/** PATCH /api/chatbots/:id — update. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  const { id } = await ctx.params;
  const parsed = PatchBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  try {
    const updated = await chatbotService.update(user.tenantId, id, parsed.data as never);
    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 404 });
    throw e;
  }
}

/** DELETE /api/chatbots/:id — SOFT delete + kaskade app-level (Rule #3). */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  const { id } = await ctx.params;
  try {
    await chatbotService.softDelete(user.tenantId, id);
    return NextResponse.json({ ok: true, softDeleted: id });
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 404 });
    throw e;
  }
}
