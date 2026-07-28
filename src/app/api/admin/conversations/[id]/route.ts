import { NextResponse } from 'next/server';
import { adminConversationsService } from '@/modules/chat/admin-conversations.service';
import { superadminRoute } from '../../_guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/admin/conversations/:id?tenantId=… — transkrip sesi (superadmin). */
export const GET = superadminRoute(async (req, ctx) => {
  const { id } = await (ctx as { params: Promise<{ id: string }> }).params;
  const tenantId = req.nextUrl.searchParams.get('tenantId');
  if (!tenantId) return NextResponse.json({ error: 'tenantId wajib' }, { status: 400 });
  return NextResponse.json(await adminConversationsService.messages(tenantId, id));
});
