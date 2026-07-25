import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/modules/core/auth';
import { conversationService } from '@/modules/chat/conversation.service';

export const runtime = 'nodejs';

/** GET /api/conversations?chatbotId=… — daftar percakapan (opsional filter). */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  const chatbotId = req.nextUrl.searchParams.get('chatbotId');
  const rows = await conversationService.list(user.tenantId, chatbotId || null);
  return NextResponse.json(rows);
}
