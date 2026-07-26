import { NextResponse } from 'next/server';
import { requireRole } from '@/modules/core/auth';
import { embeddingServerService } from '@/modules/settings/embedding-server.service';

export const runtime = 'nodejs';

/** GET /api/admin/embedding-servers/trashed — server yang di-soft-delete (Rule #3). */
export async function GET() {
  await requireRole('superadmin');
  return NextResponse.json(await embeddingServerService.listTrashed());
}
