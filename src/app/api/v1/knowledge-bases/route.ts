import { NextResponse } from 'next/server';
import { z } from 'zod';
import { desc, isNull, sql } from 'drizzle-orm';
import { knowledgeBases } from '@/modules/core/db';
import { withTenant } from '@/modules/core/db/tenant-context';
import { knowledgeBaseService } from '@/modules/knowledge/knowledge-base.service';
import { QuotaError } from '@/modules/knowledge/knowledge.service';
import { apiRoute } from '../_guard';
import { tenantOwner } from '../_actor';

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

const Body = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
});

/** POST /api/v1/knowledge-bases — buat KB baru (scope write).
 *  Dokumen ditambah/hapus lewat /api/v1/documents (sudah ada). */
export const POST = apiRoute('write', async (req, _ctx, caller) => {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Input tidak valid' }, { status: 400 });
  }
  const owner = await tenantOwner(caller.tenantId);
  if (!owner) return NextResponse.json({ error: 'Tenant tak punya admin aktif.' }, { status: 409 });
  try {
    const kb = await knowledgeBaseService.create(caller.tenantId, owner.id, parsed.data);
    return NextResponse.json(kb, { status: 201 });
  } catch (e) {
    // 402 "jatah habis" ≠ 422 "permintaan salah" — samakan pola dashboard.
    if (e instanceof QuotaError) {
      return NextResponse.json({ error: e.message, quota: { used: e.used, limit: e.limit } }, { status: 402 });
    }
    throw e; // ValidationError → 422 di apiRoute
  }
});
