import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/modules/core/auth';
import { memoryService } from '@/modules/memory/memory.service';

export const runtime = 'nodejs';

/** GET /api/memory/graph?chatbotId=… — nodes+edges utk halaman Memory. */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  const chatbotId = req.nextUrl.searchParams.get('chatbotId');
  if (!chatbotId) return NextResponse.json({ error: 'chatbotId wajib' }, { status: 400 });
  const graph = await memoryService.graph(user.tenantId, chatbotId);
  return NextResponse.json(graph);
}
