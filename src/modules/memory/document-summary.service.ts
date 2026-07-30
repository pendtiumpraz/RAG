import { sql } from 'drizzle-orm';
import { withTenant } from '@/modules/core/db/tenant-context';
import { ValidationError } from '@/modules/chatbot/chatbot.service';

/**
 * DAFTAR DOKUMEN + RINGKASANNYA — pandangan setingkat DOKUMEN di atas tabel
 * potongan.
 *
 * Kenapa ini perlu ada sendiri: `documents` menyimpan potongan 800 karakter,
 * jadi tak ada satu baris pun yang mewakili "sebuah dokumen". Agregasi per
 * `doc_ref` memulihkan identitas dokumen logis — definisi yang SAMA dengan
 * yang dipakai retrieval bertingkat dan /api/v1/documents.
 *
 * Ringkasannya datang dari catatan agen Memory, di-JOIN lewat `doc_ref`
 * (bukan kecocokan judul, yang rapuh). Dokumen yang belum pernah disentuh
 * agen tetap muncul — dengan ringkasan kosong dan ditandai apa adanya, bukan
 * disembunyikan.
 */

export interface DocSummaryRow {
  docRef: string;
  title: string | null;
  knowledgeBaseId: string;
  knowledgeBaseName: string | null;
  chunks: number;
  updatedAt: string | null;
  /** Ringkasan dari catatan Memory; null bila agen belum menyentuhnya. */
  summary: string | null;
  category: string | null;
  /** 'active' | 'pending' | 'rejected' — status catatan ringkasannya. */
  noteStatus: string | null;
  noteId: string | null;
}

const PAGE = 30;

export const documentSummaryService = {
  /**
   * Cari dokumen di knowledge base.
   *
   * Pencarian menyentuh JUDUL, ISI, dan RINGKASAN sekaligus. Ketiganya perlu:
   * judul untuk orang yang tahu nama berkasnya, isi untuk yang ingat sepotong
   * kalimat, ringkasan untuk yang cuma ingat dokumen itu "tentang apa".
   */
  async search(tenantId: string, opts: {
    q?: string; knowledgeBaseId?: string; category?: string; page?: number;
  } = {}) {
    const page = Math.max(0, opts.page ?? 0);
    const q = opts.q?.trim();

    const kbFilter = opts.knowledgeBaseId
      ? sql`and d.knowledge_base_id = ${opts.knowledgeBaseId}::uuid` : sql``;
    const catFilter = opts.category ? sql`and n.category = ${opts.category}` : sql``;
    /* Pencarian teks memakai indeks FTS yang sudah ada di `documents.fts`
       untuk kaki isi, dan ILIKE untuk judul & ringkasan — keduanya kolom
       pendek, jadi pemindaiannya murah dan tak perlu indeks sendiri. */
    const qFilter = q
      ? sql`and (
            d.title ilike ${'%' + q + '%'}
            or n.content_md ilike ${'%' + q + '%'}
            or d.fts @@ plainto_tsquery('simple', ${q})
          )`
      : sql``;

    return withTenant(tenantId, async (tx) => {
      const rows = await tx.execute(sql`
        select d.doc_ref                       as "docRef",
               max(d.title)                    as title,
               d.knowledge_base_id             as "knowledgeBaseId",
               max(kb.name)                    as "knowledgeBaseName",
               count(*)::int                   as chunks,
               max(d.updated_at)               as "updatedAt",
               max(n.content_md)               as summary,
               max(n.category)                 as category,
               max(n.status)                   as "noteStatus",
               max(n.id::text)                 as "noteId"
        from documents d
        left join knowledge_bases kb
               on kb.id = d.knowledge_base_id and kb.deleted_at is null
        left join memory_notes n
               on n.doc_ref = d.doc_ref and n.deleted_at is null
        where d.deleted_at is null
          ${kbFilter} ${catFilter} ${qFilter}
        group by d.doc_ref, d.knowledge_base_id
        order by max(d.updated_at) desc nulls last
        limit ${PAGE + 1} offset ${page * PAGE}
      `) as unknown as DocSummaryRow[];

      // Satu baris lebih diambil semata untuk tahu ADA halaman berikutnya —
      // jauh lebih murah daripada COUNT(*) atas seluruh korpus tiap ketikan.
      const more = rows.length > PAGE;
      return { rows: more ? rows.slice(0, PAGE) : rows, more, page };
    });
  },

  /** Ringkasan lengkap satu dokumen + tautan wikilink-nya. */
  async detail(tenantId: string, docRef: string) {
    return withTenant(tenantId, async (tx) => {
      const rows = await tx.execute(sql`
        select n.id, n.title, n.content_md as "contentMd", n.category,
               n.status, n.links_to as "linksTo", n.updated_at as "updatedAt"
        from memory_notes n
        where n.doc_ref = ${docRef} and n.deleted_at is null
        limit 1
      `) as unknown as Array<Record<string, unknown>>;
      return rows[0] ?? null;
    });
  },

  /** Catatan yang menunggu tinjauan — antrean persetujuan. */
  async pending(tenantId: string, chatbotId?: string) {
    const botFilter = chatbotId ? sql`and n.chatbot_id = ${chatbotId}::uuid` : sql``;
    return withTenant(tenantId, (tx) => tx.execute(sql`
      select n.id, n.title, n.slug, n.category, n.doc_ref as "docRef",
             n.content_md as "contentMd", n.chatbot_id as "chatbotId",
             n.created_at as "createdAt"
      from memory_notes n
      where n.status = 'pending' and n.deleted_at is null ${botFilter}
      order by n.created_at asc
      limit 200
    `)) as unknown as Promise<Array<Record<string, unknown>>>;
  },

  /** Setujui / tolak satu ringkasan. */
  async review(tenantId: string, noteId: string, status: 'active' | 'rejected') {
    const rows = await withTenant(tenantId, (tx) => tx.execute(sql`
      update memory_notes set status = ${status}, updated_at = now()
      where id = ${noteId}::uuid and deleted_at is null
      returning id, status
    `)) as unknown as Array<{ id: string; status: string }>;
    if (!rows[0]) throw new ValidationError('Ringkasan tidak ditemukan');
    return rows[0];
  },

  /** Setujui seluruh antrean sekaligus (opsional dibatasi ke satu chatbot). */
  async approveAll(tenantId: string, chatbotId?: string): Promise<number> {
    const botFilter = chatbotId ? sql`and chatbot_id = ${chatbotId}::uuid` : sql``;
    const rows = await withTenant(tenantId, (tx) => tx.execute(sql`
      update memory_notes set status = 'active', updated_at = now()
      where status = 'pending' and deleted_at is null ${botFilter}
      returning id
    `)) as unknown as Array<unknown>;
    return rows.length;
  },
};
