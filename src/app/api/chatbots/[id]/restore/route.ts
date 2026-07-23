import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/modules/core/auth';
import { chatbotService, ValidationError } from '@/modules/chatbot/chatbot.service';

export const runtime = 'nodejs';

/** PATCH /api/chatbots/:id/restore — pulihkan dari Sampah (Rule #3). */
export async function PATCH(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  const { id } = await ctx.params;
  try {
    const restored = await chatbotService.restore(user.tenantId, id);
    return NextResponse.json(restored);
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 404 });
    throw e;
  }
}
