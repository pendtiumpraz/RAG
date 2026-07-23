import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/modules/core/auth';
import { knowledgeService } from '@/modules/knowledge/knowledge.service';

export const runtime = 'nodejs';

/** GET /api/documents/trashed?chatbotId=… — dokumen ter-soft-delete. */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  const chatbotId = req.nextUrl.searchParams.get('chatbotId');
  if (!chatbotId) return NextResponse.json({ error: 'chatbotId wajib' }, { status: 400 });
  const rows = await knowledgeService.listTrashed(user.tenantId, chatbotId);
  return NextResponse.json(rows);
}
