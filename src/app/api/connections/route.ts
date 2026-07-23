import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/modules/core/auth';
import { connectionService } from '@/modules/connections/connection.service';

export const runtime = 'nodejs';

/** GET /api/connections — status koneksi storage user (tanpa token). */
export async function GET() {
  const user = await getCurrentUser();
  const rows = await connectionService.status(user.tenantId, user.id);
  return NextResponse.json(rows);
}
