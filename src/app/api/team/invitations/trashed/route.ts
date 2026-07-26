import { NextResponse } from 'next/server';
import { requireRole } from '@/modules/core/auth';
import { invitationService } from '@/modules/auth/invitation.service';

export const runtime = 'nodejs';

/** GET /api/team/invitations/trashed — undangan yang dicabut (Rule #3). */
export async function GET() {
  const user = await requireRole('superadmin', 'admin');
  return NextResponse.json(await invitationService.listTrashed(user.tenantId));
}
