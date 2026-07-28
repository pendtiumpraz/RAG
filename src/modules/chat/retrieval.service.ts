import { sql } from 'drizzle-orm';
import { withTenant } from '@/modules/core/db/tenant-context';
import { apiKeyResolver } from '@/modules/settings/credentials.repository';
import { embed } from '@/modules/knowledge/embeddings';

export interface RetrievedChunk {
  documentId: string;
  title: string | null;
  content: string;
  score: number;
}

/* ── bantuan leksikal utk pertanyaan yang MENUNJUK dokumen tertentu ──
   "apa isi RAB 2020?" — vector search menilai makna, dan isi RAB 2020 vs
   2021 nyaris identik semantik; pembedanya token literal ("2020") yang
   lemah di embedding. Solusi: token khas dari query dicocokkan ke JUDUL
   dokumen dan diberi bonus skor kecil — cukup utk memenangkan dokumen yang
   benar tanpa mengalahkan relevansi semantik yang sungguhan. */

const TOKEN_STOPWORDS = new Set([
  'yang', 'untuk', 'dengan', 'dari', 'pada', 'dalam', 'tentang', 'adalah',
  'apa', 'saja', 'bagaimana', 'berapa', 'kenapa', 'siapa', 'kapan', 'dimana',
  'isinya', 'jelaskan', 'sebutkan', 'tolong', 'dokumen', 'file', 'berkas',
  'isi', 'ada', 'itu', 'ini', 'mau', 'bisa', 'cara', 'kok', 'sih', 'dong',
  'what', 'which', 'about', 'from', 'this', 'that', 'the', 'and', 'are', 'was',
]);

/** Token pembeda dari pertanyaan: angka (tahun/kode) & kata ≥3 huruf
 *  non-stopword — 3, bukan 4, karena kode dokumen pendek (RAB, SOP, NIB)
 *  justru pembeda terpenting antar-berkas. */
export function queryTokens(q: string): string[] {
  const raw = q.toLowerCase().match(/[a-z0-9][a-z0-9./-]{1,}/g) ?? [];
  return [...new Set(raw.filter((t) =>
    (/^\d{2,}/.test(t) || t.length >= 3) && !TOKEN_STOPWORDS.has(t)))];
}

/** Bonus per token query yang muncul di judul; angka (tahun/kode) dihargai
 *  lebih karena merekalah pembeda antar-versi dokumen. Dibatasi agar tak
 *  pernah menenggelamkan kemiripan semantik sepenuhnya. */
export function titleBoost(title: string | null, tokens: string[]): number {
  if (!title || tokens.length === 0) return 0;
  const t = title.toLowerCase();
  let boost = 0;
  for (const tok of tokens) {
    if (t.includes(tok)) boost += /^\d/.test(tok) ? 0.1 : 0.05;
  }
  return Math.min(boost, 0.2);
}

/**
 * Vector search top-k utk satu chatbot — D11: konteks chatbot = UNION dokumen
 * semua KNOWLEDGE BASE yang di-assign padanya (chatbot_knowledge_bases).
 * withTenant() + filter kb + embedding_model + deleted_at IS NULL ⇒ tetap
 * terisolasi penuh per tenant; assignment-lah yang menentukan jangkauan.
 * Chatbot tanpa KB ter-assign = konteks kosong (jawab "tidak tahu"), bukan
 * error — keadaan sah saat chatbot baru dibuat.
 */
export const retrievalService = {
  async retrieve(
    tenantId: string,
    chatbotId: string,
    embeddingModel: string,
    query: string,
    k = 6,
  ): Promise<RetrievedChunk[]> {
    const getApiKey = apiKeyResolver(tenantId);
    const [qVec] = await embed(embeddingModel, [query], { tenantId, getApiKey });
    const vecLiteral = `[${qVec.join(',')}]`;
    const tokens = queryTokens(query);

    return withTenant(tenantId, async (tx) => {
      // Kandidat diambil LEBIH BANYAK dari k lalu di-rerank dgn titleBoost —
      // supaya chunk dokumen yang judulnya cocok token query (mis. "2020")
      // bisa naik walau kalah tipis secara kosinus dari tahun tetangganya.
      const pool = Math.min(k * 4, 24);
      const rows = await tx.execute(sql`
        select d.id, d.title, d.content,
               1 - (d.embedding <=> ${vecLiteral}::vector) as score
        from documents d
        where d.knowledge_base_id in (
            select a.knowledge_base_id from chatbot_knowledge_bases a
            where a.chatbot_id = ${chatbotId} and a.deleted_at is null)
          and d.embedding_model = ${embeddingModel}
          and d.deleted_at is null
        order by d.embedding <=> ${vecLiteral}::vector
        limit ${pool}
      `);
      return (rows as unknown as Array<{ id: string; title: string | null; content: string; score: number }>)
        .map((r) => ({
          documentId: r.id, title: r.title, content: r.content,
          score: Number(r.score) + titleBoost(r.title, tokens),
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, k);
    });
  },
};
