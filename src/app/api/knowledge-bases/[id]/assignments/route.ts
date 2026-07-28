import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/modules/core/auth';
import { knowledgeBaseService } from '@/modules/knowledge/knowledge-base.service';
import { ValidationError } from '@/modules/chatbot/chatbot.service';

export const runtime = 'nodejs';

const Body = z.object({ chatbotIds: z.array(z.string().uuid()).max(100) });

/**
 * PUT /api/knowledge-bases/:id/assignments — setel DAFTAR chatbot pemakai KB
 * ini (deklaratif & idempotent): yang hilang dilepas, yang baru dipasang.
 * Inilah inti D11 — 1 KB ↔ N chatbot.
 */
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  try {
    await knowledgeBaseService.setAssignments(user.tenantId, user.id, id, parsed.data.chatbotIds);
    return NextResponse.json({ ok: true, chatbotIds: [...new Set(parsed.data.chatbotIds)] });
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 422 });
    throw e;
  }
}
