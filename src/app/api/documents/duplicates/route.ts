import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/modules/core/auth';
import { knowledgeService } from '@/modules/knowledge/knowledge.service';

export const runtime = 'nodejs';

/**
 * GET /api/documents/duplicates — berkas kembar yang DILEWATI saat ingest.
 *
 * Ada supaya berkas kembar tak lenyap diam-diam: kalau sebuah berkas hilang
 * begitu saja dari knowledge base, pemiliknya akan mengira sync-nya gagal —
 * dan tak ada cara mengetahui bedanya.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  const kb = req.nextUrl.searchParams.get('knowledgeBaseId') ?? undefined;
  return NextResponse.json(await knowledgeService.listDuplicates(user.tenantId, kb));
}
