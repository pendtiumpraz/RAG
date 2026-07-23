import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/modules/core/auth';
import { knowledgeService } from '@/modules/knowledge/knowledge.service';
import { ValidationError } from '@/modules/chatbot/chatbot.service';

export const runtime = 'nodejs';

/** DELETE /api/documents/:id — soft delete dokumen (Rule #3). */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  const { id } = await ctx.params;
  try {
    await knowledgeService.softDeleteDocument(user.tenantId, id);
    return NextResponse.json({ ok: true, softDeleted: id });
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 404 });
    throw e;
  }
}
