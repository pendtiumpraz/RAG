import { NextResponse } from 'next/server';
import { adminConversationsService } from '@/modules/chat/admin-conversations.service';
import { superadminRoute } from '../_guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/conversations?tenantId=…&chatbotId=…&page=… — SUPERADMIN:
 * sesi percakapan tenant mana pun (lintas-tenant via GUC 0017).
 * `chatbots=1` mengembalikan daftar chatbot tenant itu saja (utk selector).
 */
export const GET = superadminRoute(async (req) => {
  const q = req.nextUrl.searchParams;
  const tenantId = q.get('tenantId');
  if (!tenantId) return NextResponse.json({ error: 'tenantId wajib' }, { status: 400 });

  if (q.get('chatbots') === '1') {
    return NextResponse.json(await adminConversationsService.chatbots(tenantId));
  }
  return NextResponse.json(await adminConversationsService.conversations(
    tenantId,
    q.get('chatbotId') || null,
    Number(q.get('page')) || 1,
    Number(q.get('pageSize')) || 25,
  ));
});
