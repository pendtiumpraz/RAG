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
  // Filter dibaca dengan aturan yang sama seperti jalur tenant: `to` = akhir
  // hari, kalau tidak rentang satu hari selalu kosong.
  const term = q.get('q')?.trim();
  const fromRaw = q.get('from');
  const toRaw = q.get('to');
  const filter: { q?: string; from?: Date; to?: Date } = {};
  if (term) filter.q = term.slice(0, 200);
  if (fromRaw) { const d = new Date(fromRaw); if (!Number.isNaN(+d)) filter.from = d; }
  if (toRaw) { const d = new Date(toRaw); if (!Number.isNaN(+d)) { d.setHours(23, 59, 59, 999); filter.to = d; } }

  if (q.get('export') === 'csv') {
    const csv = await adminConversationsService.exportCsv(tenantId, q.get('chatbotId') || null, filter);
    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(`﻿${csv}`, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="percakapan-${stamp}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  return NextResponse.json(await adminConversationsService.conversations(
    tenantId,
    q.get('chatbotId') || null,
    Number(q.get('page')) || 1,
    Number(q.get('pageSize')) || 25,
    filter,
  ));
});
