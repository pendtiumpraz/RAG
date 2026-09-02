import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { withTenant } from '@/modules/core/db/tenant-context';
import { apiRoute } from '../../_guard';
import { bacaPaging, balasanDaftar } from '../../_paging';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/v1/documents/chunks?ref=…&knowledgeBaseId=… — ISI dokumen.
 *
 * ── KENAPA ENDPOINT TERSENDIRI ──────────────────────────────────────────────
 *
 * `/api/v1/documents` sengaja mengembalikan METADATA saja: ref, judul, jumlah
 * potongan. Itu keputusan yang benar untuk sebuah daftar — satu PDF bisa jadi
 * ratusan potongan, dan menyertakan isinya membuat daftar 50 dokumen berbobot
 * belasan megabyte.
 *
 * Tapi akibatnya pemilik KB tak punya cara apa pun melihat APA yang sebenarnya
 * terbaca chatbotnya. Ia hanya melihat "22 potongan" dan harus percaya. Ketika
 * jawaban chatbot terasa salah, tak ada satu pun tempat untuk memeriksanya —
 * dan itulah pertanyaan pertama yang selalu muncul.
 *
 * Jadi isinya dibuka di sini, per dokumen, dan BERHALAMAN sendiri: satu PDF
 * besar tak boleh menjadi satu balasan raksasa hanya karena seseorang menekan
 * "lihat".
 *
 * ── KENAPA `ref` LEWAT QUERY, BUKAN SEGMEN PATH ─────────────────────────────
 *
 * `ref` adalah `external_id` — untuk unggahan manual itu NAMA BERKAS, lengkap
 * dengan titik, spasi, dan kadang garis miring. Menaruhnya di segmen path
 * berarti setiap nama berkas jadi urusan penyandian URL, dan satu berkas
 * bernama "SOP 5/5.pdf" akan memecah rutenya. Query string tak punya masalah
 * itu.
 */
export const GET = apiRoute('read', async (req, _ctx, caller) => {
  const q = new URL(req.url).searchParams;
  const ref = (q.get('ref') ?? '').trim();
  const kbId = q.get('knowledgeBaseId');
  if (!ref) {
    return NextResponse.json({ error: '`ref` wajib — ambil dari /api/v1/documents' }, { status: 400 });
  }
  const paging = bacaPaging(req, 10);

  // Penyaring tenant EKSPLISIT di samping RLS — lihat catatan di rute daftar.
  // `ref` dicocokkan dengan ekspresi yang SAMA dengan yang membentuknya di sana,
  // supaya nilai yang dikembalikan daftar selalu bisa dipakai kembali di sini.
  const saring = sql`
    tenant_id = ${caller.tenantId}::uuid
      and deleted_at is null
      and coalesce(external_id, title, id::text) = ${ref}
      ${kbId ? sql`and knowledge_base_id = ${kbId}::uuid` : sql``}`;

  const { rows, total, judul } = await withTenant(caller.tenantId, async (tx) => {
    const daftar = await tx.execute(sql`
      select id, title, content, metadata, updated_at
      from documents
      where ${saring}
      order by created_at asc, id asc
      limit ${paging.limit} offset ${paging.offset}`);
    const c = await tx.execute(sql`select count(*)::int as n from documents where ${saring}`);
    const t = await tx.execute(sql`select max(title) as t from documents where ${saring}`);
    return {
      rows: daftar as unknown as Array<Record<string, unknown>>,
      total: Number((c as unknown as Array<{ n: number }>)[0]?.n ?? 0),
      judul: (t as unknown as Array<{ t: string | null }>)[0]?.t ?? null,
    };
  });

  if (!total) {
    // 404, bukan daftar kosong: "dokumen ini tak ada" dan "dokumen ini kosong"
    // adalah dua keadaan berbeda, dan yang memanggil perlu bisa membedakannya.
    return NextResponse.json({ error: 'Dokumen tidak ditemukan' }, { status: 404 });
  }

  return NextResponse.json({
    ref,
    title: judul,
    ...balasanDaftar(
      'chunks',
      rows.map((r, i) => ({
        id: String(r.id),
        // Nomor urut yang dilihat manusia — dihitung dari offset supaya
        // "potongan 12 dari 22" tetap benar di halaman kedua.
        index: paging.offset + i + 1,
        content: String(r.content ?? ''),
        metadata: r.metadata ?? null,
        updatedAt: r.updated_at,
      })),
      total,
      paging,
    ),
  });
});
