import { NextResponse } from 'next/server';
import { requireRole } from '@/modules/core/auth';
import { divisionService } from '@/modules/settings/division.service';

export const runtime = 'nodejs';

/** GET /api/divisions/trashed — divisi ter-soft-delete (Rule #3). */
export async function GET() {
  const user = await requireRole('superadmin', 'admin');
  return NextResponse.json(await divisionService.listTrashed(user.tenantId));
}
