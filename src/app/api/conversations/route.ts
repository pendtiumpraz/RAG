import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/modules/core/auth';
import { conversationService } from '@/modules/chat/conversation.service';
import type { ConvoFilter } from '@/modules/chat/conversation.repository';
import { parsePaging } from '@/modules/core/pagination';

export const runtime = 'nodejs';
/** Ekspor menarik transkrip banyak percakapan — beri waktu lebih. */
export const maxDuration = 60;

/**
 * Filter dari query string.
 *
 * Tanggal `to` dibaca sebagai batas AKHIR HARI, bukan awalnya. Tanpa
 * penyesuaian itu, memilih rentang satu hari yang sama (from = to) selalu
 * mengembalikan kosong — kekeliruan yang tampak seperti data yang hilang.
 */
function parseFilter(q: URLSearchParams): ConvoFilter {
  const f: ConvoFilter = {};
  const term = q.get('q')?.trim();
  if (term) f.q = term.slice(0, 200);
  const from = q.get('from');
  const to = q.get('to');
  if (from) { const d = new Date(from); if (!Number.isNaN(+d)) f.from = d; }
  if (to) {
    const d = new Date(to);
    if (!Number.isNaN(+d)) { d.setHours(23, 59, 59, 999); f.to = d; }
  }
  return f;
}

/**
 * GET /api/conversations?chatbotId=…&q=…&from=…&to=…&page=1&pageSize=25
 *     /api/conversations?export=csv&…   → unduhan CSV
 *
 * Berhalaman: daftar percakapan tumbuh seiring pemakaian. Sebelumnya dipatok
 * `limit 50` tanpa memberi tahu ada sisanya, jadi percakapan lama tak pernah
 * bisa dilihat.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  const q = req.nextUrl.searchParams;
  const chatbotId = q.get('chatbotId');
  const filter = parseFilter(q);

  if (q.get('export') === 'csv') {
    const csv = await conversationService.exportCsv(user.tenantId, chatbotId || null, filter);
    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(
      // BOM UTF-8: tanpa ini Excel di Windows membaca CSV sebagai ANSI, dan
      // huruf beraksen serta emoji di transkrip jadi rusak.
      `﻿${csv}`,
      {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="percakapan-${stamp}.csv"`,
          'Cache-Control': 'no-store',
        },
      },
    );
  }

  const paging = parsePaging(q, { defaultSize: 25, maxSize: 100 });
  return NextResponse.json(
    await conversationService.list(user.tenantId, chatbotId || null, paging, filter));
}
