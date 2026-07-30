import { sql } from 'drizzle-orm';
import { withTenant } from '@/modules/core/db/tenant-context';

/**
 * LAPISAN PERTAMA retrieval bertingkat — satu vektor per DOKUMEN.
 *
 * Centroid dihitung DI DATABASE dengan `avg(embedding)`: menarik jutaan
 * vektor ke Node hanya untuk merata-ratakannya akan memindahkan ratusan MB
 * lewat jaringan untuk pekerjaan yang Postgres bisa lakukan di tempat.
 *
 * Dijalankan SEKALI setiap dokumen berubah, bukan pada tiap kueri. Kalau
 * dihitung saat menjawab, ia justru jadi beban baru di jalur terpanas —
 * kebalikan dari tujuannya.
 *
 * Rerata mentah, tanpa normalisasi manual: operator `<=>` pgvector menghitung
 * jarak kosinus yang sudah menormalkan kedua sisi, jadi panjang vektornya tak
 * berpengaruh pada peringkat.
 */
export const documentVectorsService = {
  /**
   * Bangun ulang centroid untuk dokumen tertentu di sebuah knowledge base.
   *
   * `docRefs` kosong = seluruh dokumen di KB itu (dipakai saat menyalakan mode
   * bertingkat pertama kali pada korpus yang sudah ada).
   */
  async rebuild(
    tenantId: string,
    knowledgeBaseId: string,
    embeddingModel: string,
    docRefs: string[] = [],
  ): Promise<number> {
    const scope = docRefs.length
      ? sql`and d.doc_ref = any(${sql`array[${sql.join(docRefs.map((r) => sql`${r}`), sql`, `)}]::text[]`})`
      : sql``;

    const rows = await withTenant(tenantId, (tx) => tx.execute(sql`
      insert into document_vectors
        (tenant_id, knowledge_base_id, doc_ref, title, embedding_model, embedding_dims, centroid, chunks)
      select d.tenant_id, d.knowledge_base_id, d.doc_ref,
             max(d.title), d.embedding_model, max(d.embedding_dims),
             avg(d.embedding), count(*)::int
      from documents d
      where d.knowledge_base_id = ${knowledgeBaseId}
        and d.embedding_model = ${embeddingModel}
        and d.deleted_at is null
        and d.embedding is not null
        ${scope}
      group by d.tenant_id, d.knowledge_base_id, d.doc_ref, d.embedding_model
      on conflict (knowledge_base_id, doc_ref, embedding_model) where deleted_at is null
      do update set
        centroid = excluded.centroid,
        chunks = excluded.chunks,
        title = excluded.title,
        embedding_dims = excluded.embedding_dims,
        updated_at = now()
      returning id
    `));
    const n = (rows as unknown as Array<unknown>).length;

    // Dokumen yang seluruh potongannya terhapus tak lagi muncul di hasil
    // agregat di atas, jadi barisnya harus dibuang terpisah — kalau tidak,
    // lapisan pertama akan terus menawarkan dokumen yang isinya sudah tak ada.
    await withTenant(tenantId, (tx) => tx.execute(sql`
      update document_vectors v set deleted_at = now(), updated_at = now()
      where v.knowledge_base_id = ${knowledgeBaseId}
        and v.embedding_model = ${embeddingModel}
        and v.deleted_at is null
        and not exists (
          select 1 from documents d
          where d.knowledge_base_id = v.knowledge_base_id
            and d.doc_ref = v.doc_ref
            and d.embedding_model = v.embedding_model
            and d.deleted_at is null)
    `));

    return n;
  },

  /** Berapa dokumen yang sudah punya vektor lapisan pertama. */
  async count(tenantId: string, knowledgeBaseId: string): Promise<number> {
    const r = await withTenant(tenantId, (tx) => tx.execute(sql`
      select count(*)::int n from document_vectors
      where knowledge_base_id = ${knowledgeBaseId} and deleted_at is null`));
    return Number((r as unknown as Array<{ n: number }>)[0]?.n ?? 0);
  },
};
