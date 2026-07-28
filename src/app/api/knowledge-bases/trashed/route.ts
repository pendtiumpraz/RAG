import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/modules/core/auth';
import { knowledgeBaseService } from '@/modules/knowledge/knowledge-base.service';

export const runtime = 'nodejs';

/** GET /api/knowledge-bases/trashed — KB ter-soft-delete (rules-of-the-game). */
export async function GET() {
  const user = await getCurrentUser();
  return NextResponse.json(await knowledgeBaseService.listTrashed(user.tenantId));
}
