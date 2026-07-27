import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/modules/core/auth';
import { conversationService } from '@/modules/chat/conversation.service';
import { parsePaging } from '@/modules/core/pagination';

export const runtime = 'nodejs';

/**
 * GET /api/conversations?chatbotId=…&page=1&pageSize=25
 *
 * Berhalaman: daftar percakapan tumbuh seiring pemakaian. Sebelumnya dipatok
 * `limit 50` tanpa memberi tahu ada sisanya, jadi percakapan lama tak pernah
 * bisa dilihat.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  const chatbotId = req.nextUrl.searchParams.get('chatbotId');
  const paging = parsePaging(req.nextUrl.searchParams, { defaultSize: 25, maxSize: 100 });
  return NextResponse.json(await conversationService.list(user.tenantId, chatbotId || null, paging));
}
