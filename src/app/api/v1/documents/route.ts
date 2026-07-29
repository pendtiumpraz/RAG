import { NextResponse, after } from 'next/server';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { withTenant } from '@/modules/core/db/tenant-context';
import { knowledgeService } from '@/modules/knowledge/knowledge.service';
import { jobsSettled } from '@/modules/core/jobs';
import { apiRoute } from '../_guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** Ingest = potong + embed; beri waktu setelah respons terkirim. */
export const maxDuration = 60;

/**
 * Di dalam basis data, satu baris `documents` adalah satu POTONGAN — sebuah
 * PDF bisa jadi ratusan baris. Mengembalikan itu apa adanya bukan daftar yang
 * berguna bagi integrator, jadi di sini potongan dikelompokkan kembali menjadi
 * dokumen logis dengan satu rujukan (`ref`):
 *
 *   ref = external_id (berkas dari Drive/SharePoint)  ── kalau ada
 *       = title       (teks yang dimasukkan lewat API)
 *
 * `ref` itu pula yang dipakai DELETE, sehingga satu berkas bisa dicabut utuh
 * tanpa pemanggil perlu tahu ia terpecah jadi berapa potongan.
 */
export const GET = apiRoute('read', async (req, _ctx, caller) => {
  const kbId = new URL(req.url).searchParams.get('knowledgeBaseId');
  const rows = await withTenant(caller.tenantId, (tx) => tx.execute(sql`
    select coalesce(external_id, title, id::text) as ref,
           max(title)                             as title,
           max(external_version)                  as version,
           count(*)::int                          as chunks,
           max(updated_at)                        as updated_at,
           max(knowledge_base_id::text)           as knowledge_base_id
    from documents
    where deleted_at is null
      ${kbId ? sql`and knowledge_base_id = ${kbId}::uuid` : sql``}
    group by coalesce(external_id, title, id::text)
    order by max(updated_at) desc
    limit 500`));

  return NextResponse.json({
    documents: (rows as unknown as Array<Record<string, unknown>>).map((r) => ({
      ref: String(r.ref),
      title: r.title ?? null,
      version: r.version ?? null,
      chunks: Number(r.chunks),
      knowledgeBaseId: r.knowledge_base_id,
      updatedAt: r.updated_at,
    })),
  });
});

const Body = z.object({
  knowledgeBaseId: z.string().uuid(),
  text: z.string().min(1).max(2_000_000),
  title: z.string().max(500).optional(),
  metadata: z.record(z.unknown()).optional(),
  /** Identitas di sistem asal — memungkinkan pembaruan idempotent. */
  externalId: z.string().max(300).optional(),
  externalVersion: z.string().max(300).optional(),
});

/** POST /api/v1/documents — masukkan teks ke sebuah knowledge base. */
export const POST = apiRoute('write', async (req, _ctx, caller) => {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Input tidak valid' }, { status: 400 });
  }
  const chunks = await knowledgeService.ingest(caller.tenantId, parsed.data);
  // Vercel membekukan lambda begitu respons terkirim; tanpa ini pekerjaan
  // susulan (agen memory) mati di tengah — jebakan yang sama sudah pernah
  // menggigit jalur sync.
  after(jobsSettled);
  return NextResponse.json({ ok: true, chunks }, { status: 201 });
});

/** DELETE /api/v1/documents?ref=… — cabut satu dokumen logis beserta potongannya. */
export const DELETE = apiRoute('write', async (req, _ctx, caller) => {
  const ref = new URL(req.url).searchParams.get('ref');
  if (!ref) return NextResponse.json({ error: 'ref wajib' }, { status: 400 });

  const rows = await withTenant(caller.tenantId, (tx) => tx.execute(sql`
    update documents set deleted_at = now(), updated_at = now()
    where deleted_at is null
      and coalesce(external_id, title, id::text) = ${ref}
    returning id`));
  const removed = (rows as unknown as Array<unknown>).length;
  if (!removed) return NextResponse.json({ error: 'Dokumen tak ditemukan' }, { status: 404 });
  return NextResponse.json({ ok: true, removedChunks: removed });
});
