import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/modules/core/auth';
import { knowledgeService } from '@/modules/knowledge/knowledge.service';

export const runtime = 'nodejs';

/** GET /api/documents/trashed?knowledgeBaseId=… — dokumen ter-soft-delete. */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  const knowledgeBaseId = req.nextUrl.searchParams.get('knowledgeBaseId');
  if (!knowledgeBaseId) return NextResponse.json({ error: 'knowledgeBaseId wajib' }, { status: 400 });
  const rows = await knowledgeService.listTrashed(user.tenantId, knowledgeBaseId);
  return NextResponse.json(rows);
}
