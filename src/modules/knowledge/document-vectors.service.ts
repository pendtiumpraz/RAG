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
/**
 * Berapa potongan diwakili SATU vektor lapisan pertama.
 *
 * 50 dipilih supaya dokumen perkantoran biasa (±10 potongan) tetap menghasilkan
 * TEPAT SATU baris — tak ada biaya tambahan sama sekali untuk korpus yang tak
 * membutuhkannya. Yang berubah hanya dokumen tebal: kontrak 500 potongan kini
 * punya 10 wakil alih-alih satu rerata yang mewakili tema umumnya saja.
 *
 * Angkanya juga menjaga sifat yang jadi ALASAN lapisan ini ada: jumlah baris
 * tetap sepersekian jumlah potongan. Menurunkannya ke, katakanlah, 5 akan
 * membuat lapisan pertama tumbuh mendekati tabel potongan itu sendiri — dan
 * indeks yang sama besar dengan yang ia gantikan tak menghemat apa pun.
 */
export const POTONGAN_PER_BAGIAN = 50;

/**
 * Ekspresi nomor bagian — SATU definisi, dipakai di SELECT dan di GROUP BY.
 *
 * Harus IDENTIK secara teks di kedua tempat: Postgres mencocokkan ekspresi
 * GROUP BY dengan kolom SELECT secara sintaksis, dan versi pertama gagal
 * (42803 "column d.metadata must appear in the GROUP BY clause") hanya karena
 * yang satu dibungkus `::smallint` dan yang lain tidak. Pembagi ditulis
 * lewat sql.raw, bukan parameter: dua `$N` di tempat berbeda pun tak dijamin
 * dianggap ekspresi yang sama.
 *
 * Cast ke smallint sengaja TAK ada di sini — kolomnya sudah smallint, dan
 * Postgres melakukan konversinya sendiri saat INSERT.
 */
const bagianExpr = sql`(coalesce((d.metadata->>'chunk')::int, 0) / ${sql.raw(String(POTONGAN_PER_BAGIAN))})`;

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
        (tenant_id, knowledge_base_id, doc_ref, title, embedding_model, embedding_dims,
         centroid, chunks, segment)
      select d.tenant_id, d.knowledge_base_id, d.doc_ref,
             max(d.title), d.embedding_model, max(d.embedding_dims),
             avg(d.embedding), count(*)::int,
             /* BAGIAN = nomor potongan dibagi ${sql.raw(String(POTONGAN_PER_BAGIAN))}.
                coalesce ke 0 penting: potongan lama yang metadata-nya tak
                memuat nomor akan menghasilkan NULL, dan NULL memecah
                pengelompokan jadi satu baris per potongan — lapisan pertama
                berubah jadi salinan tabel potongan, persis hal yang ia ada
                untuk hindari. */
             ${bagianExpr}
      from documents d
      where d.knowledge_base_id = ${knowledgeBaseId}
        and d.embedding_model = ${embeddingModel}
        and d.deleted_at is null
        and d.embedding is not null
        ${scope}
      group by d.tenant_id, d.knowledge_base_id, d.doc_ref, d.embedding_model,
               ${bagianExpr}
      on conflict (knowledge_base_id, doc_ref, embedding_model, segment) where deleted_at is null
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
