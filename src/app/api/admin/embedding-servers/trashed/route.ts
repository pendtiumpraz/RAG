import { NextResponse } from 'next/server';
import { embeddingServerService } from '@/modules/settings/embedding-server.service';
import { superadminRoute } from '../../_guard';

export const runtime = 'nodejs';

/** GET /api/admin/embedding-servers/trashed — server yang di-soft-delete (Rule #3). */
export const GET = superadminRoute(async () =>
  NextResponse.json(await embeddingServerService.listTrashed()));
