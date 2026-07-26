import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/modules/core/auth';
import { embeddingServerService } from '@/modules/settings/embedding-server.service';
import { ValidationError } from '@/modules/chatbot/chatbot.service';

export const runtime = 'nodejs';

/** PATCH /api/admin/embedding-servers/:id/restore — kembalikan dari Sampah (Rule #3). */
export async function PATCH(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await requireRole('superadmin');
  const { id } = await ctx.params;
  try {
    return NextResponse.json(await embeddingServerService.restore(id));
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 404 });
    throw e;
  }
}
