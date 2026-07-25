import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/modules/core/auth';
import { conversationService } from '@/modules/chat/conversation.service';

export const runtime = 'nodejs';

/** GET /api/conversations/:id — transcript (pesan + sitasi). */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  const { id } = await ctx.params;
  const msgs = await conversationService.messages(user.tenantId, id);
  return NextResponse.json(msgs);
}
