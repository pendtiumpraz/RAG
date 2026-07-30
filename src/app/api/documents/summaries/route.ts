import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/modules/core/auth';
import { documentSummaryService } from '@/modules/memory/document-summary.service';

export const runtime = 'nodejs';

/**
 * GET /api/documents/summaries — cari dokumen di KB + ringkasannya.
 *
 * Pencarian menyentuh judul, isi, dan ringkasan sekaligus: orang mencari
 * dengan nama berkas, dengan sepotong kalimat yang diingat, atau dengan
 * "dokumen yang tentang ..." — dan ketiganya harus ketemu.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  const p = req.nextUrl.searchParams;
  return NextResponse.json(await documentSummaryService.search(user.tenantId, {
    q: p.get('q') ?? undefined,
    knowledgeBaseId: p.get('knowledgeBaseId') ?? undefined,
    category: p.get('category') ?? undefined,
    page: Number(p.get('page') ?? 0) || 0,
  }));
}
