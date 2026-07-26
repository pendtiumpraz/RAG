import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/modules/core/auth';
import { invitationService } from '@/modules/auth/invitation.service';

export const runtime = 'nodejs';

/** GET /api/team/members — anggota tenant saat ini (dibatasi RLS). */
export async function GET() {
  const user = await getCurrentUser();
  return NextResponse.json(await invitationService.listMembers(user.tenantId));
}
