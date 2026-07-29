import { NextResponse } from 'next/server';
import { desc, isNull, sql } from 'drizzle-orm';
import { knowledgeBases } from '@/modules/core/db';
import { withTenant } from '@/modules/core/db/tenant-context';
import { apiRoute } from '../_guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/v1/knowledge-bases — daftar KB + jumlah potongan terindeks. */
export const GET = apiRoute('read', async (_req, _ctx, caller) => {
  const rows = await withTenant(caller.tenantId, async (tx) => {
    const kbs = await tx.select().from(knowledgeBases)
      .where(isNull(knowledgeBases.deletedAt))
      .orderBy(desc(knowledgeBases.createdAt));
    // Satu agregat untuk semua KB — bukan satu query per KB, karena daftar ini
    // ikut tumbuh seiring pemakaian pelanggan.
    const counts = await tx.execute<{ knowledge_base_id: string; n: number }>(sql`
      select knowledge_base_id, count(*)::int as n
      from documents where deleted_at is null
      group by knowledge_base_id`);
    const byKb = new Map(
      (counts as unknown as Array<{ knowledge_base_id: string; n: number }>)
        .map((c) => [c.knowledge_base_id, Number(c.n)]));
    return kbs.map((k) => ({
      id: k.id, name: k.name, description: k.description,
      chunks: byKb.get(k.id) ?? 0,
      createdAt: k.createdAt, updatedAt: k.updatedAt,
    }));
  });
  return NextResponse.json({ knowledgeBases: rows });
});
