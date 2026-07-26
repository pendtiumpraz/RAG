import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/modules/core/auth';
import { invitationService } from '@/modules/auth/invitation.service';
import { ValidationError } from '@/modules/chatbot/chatbot.service';

export const runtime = 'nodejs';

/** PATCH /api/team/invitations/:id/restore — kembalikan dari Sampah (Rule #3). */
export async function PATCH(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireRole('superadmin', 'admin');
  const { id } = await ctx.params;
  try {
    return NextResponse.json(await invitationService.restore(user.tenantId, id));
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 404 });
    throw e;
  }
}
