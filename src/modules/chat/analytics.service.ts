import { sql } from 'drizzle-orm';
import { withTenant } from '@/modules/core/db/tenant-context';
import { type Rentang, awalTampil } from './rentang';

/**
 * ANALITIK PER CHATBOT.
 *
 * Semuanya dari data yang MEMANG sudah ditulis pipeline chat — tak ada
 * pelacakan baru yang ditambahkan:
 *  • pertanyaan  → `messages` (role='user')
 *  • file sumber → `messages.citations`, yaitu dokumen yang benar-benar
 *                   dipakai menjawab
 *
 * Catatan jujur soal "file yang sering dibuka": kita tidak melacak orang
 * membuka berkas — tidak ada peristiwa semacam itu di sistem ini. Yang bisa
 * dijawab dengan benar adalah **dokumen mana yang paling sering menjadi
 * sumber jawaban**, dan itu justru sinyal yang lebih berguna: menunjukkan
 * bagian knowledge base mana yang benar-benar bekerja.
 */

export interface ChatbotAnalytics {
  days: number;
  /** Rentang yang BENAR-BENAR dipakai — bukan yang diminta. */
  range: { from: string; to: string };
  totals: { conversations: number; questions: number; withCitation: number };
  topQuestions: Array<{ question: string; count: number }>;
  topKeywords: Array<{ word: string; count: number }>;
  topDocuments: Array<{ documentId: string; title: string | null; hits: number; avgScore: number }>;
  daily: Array<{ day: string; questions: number }>;
  unanswered: number;
}

/**
 * Stopword ID + EN. Tanpa ini "topik terbanyak" hanya berisi "yang", "apa",
 * "the" — benar secara hitungan, tak berguna sama sekali.
 */
const STOP = new Set(`
yang dan di ke dari untuk dengan pada adalah ini itu apa apakah bagaimana kenapa mengapa
saya aku kamu anda kami kita mereka dia bisa boleh ada tidak bukan belum sudah akan
atau juga saja lagi kalau jika mau ingin gimana gmn dong ya yaa nya kah pun per
berapa kapan siapa mana dimana adakah punya dapat harus perlu tolong mohon halo hai
the a an of to in for with on is are was were be been do does did how what why when
where who which and or but if then this that these those it its my your our their
i you we they he she can could should would will shall have has had not no yes please
`.trim().split(/\s+/));

function keywords(texts: string[], top = 12): Array<{ word: string; count: number }> {
  const freq = new Map<string, number>();
  for (const t of texts) {
    // Pisah per non-huruf agar tanda baca & angka tak jadi "kata".
    for (const raw of t.toLowerCase().split(/[^a-zà-ÿ0-9']+/)) {
      const w = raw.trim();
      if (w.length < 4 || STOP.has(w) || /^\d+$/.test(w)) continue;
      freq.set(w, (freq.get(w) ?? 0) + 1);
    }
  }
  return [...freq.entries()]
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, top);
}

const rowsOf = <T>(r: unknown): T[] => (r as unknown as T[]) ?? [];

export const analyticsService = {
  async forChatbot(tenantId: string, chatbotId: string, rentang: Rentang): Promise<ChatbotAnalytics> {
    /* Jendela DUA SISI. Sebelumnya hanya `>= since`, yang benar selama
       ujung atasnya selalu "sekarang". Begitu pengguna boleh memilih rentang
       yang berakhir di masa lalu, tanpa batas atas laporannya diam-diam ikut
       memuat seluruh data sesudahnya — dan angkanya terlihat wajar. */
    const since = rentang.awal;
    const until = rentang.akhir;
    const days = rentang.hari;

    return withTenant(tenantId, async (tx) => {
      const totals = rowsOf<{ conversations: string; questions: string; with_citation: string }>(
        await tx.execute(sql`
          select
            (select count(*)::int from conversations c
              where c.chatbot_id = ${chatbotId} and c.deleted_at is null
                and c.started_at >= ${since} and c.started_at < ${until})                                   as conversations,
            (select count(*)::int from messages m
              join conversations c on c.id = m.conversation_id
              where c.chatbot_id = ${chatbotId} and m.role = 'user'
                and m.deleted_at is null and m.created_at >= ${since} and m.created_at < ${until})           as questions,
            (select count(*)::int from messages m
              join conversations c on c.id = m.conversation_id
              where c.chatbot_id = ${chatbotId} and m.role = 'assistant'
                and m.deleted_at is null and m.created_at >= ${since} and m.created_at < ${until}
                and jsonb_array_length(coalesce(m.citations, '[]'::jsonb)) > 0)  as with_citation
        `));

      // Jawaban TANPA sitasi = pertanyaan yang tak terjawab knowledge base.
      // Angka ini yang menunjukkan lubang isi KB.
      const noCite = rowsOf<{ n: string }>(await tx.execute(sql`
        select count(*)::int as n from messages m
        join conversations c on c.id = m.conversation_id
        where c.chatbot_id = ${chatbotId} and m.role = 'assistant'
          and m.deleted_at is null and m.created_at >= ${since} and m.created_at < ${until}
          and jsonb_array_length(coalesce(m.citations, '[]'::jsonb)) = 0
      `));

      const topQ = rowsOf<{ q: string; n: string }>(await tx.execute(sql`
        select lower(btrim(m.content)) as q, count(*)::int as n
        from messages m
        join conversations c on c.id = m.conversation_id
        where c.chatbot_id = ${chatbotId} and m.role = 'user'
          and m.deleted_at is null and m.created_at >= ${since} and m.created_at < ${until}
        group by 1 having count(*) > 1
        order by n desc limit 10
      `));

      // Sampel untuk kata kunci — dibatasi supaya tak menyeret puluhan ribu
      // pesan ke memori hanya untuk menghitung frekuensi kata.
      const sample = rowsOf<{ content: string }>(await tx.execute(sql`
        select m.content from messages m
        join conversations c on c.id = m.conversation_id
        where c.chatbot_id = ${chatbotId} and m.role = 'user'
          and m.deleted_at is null and m.created_at >= ${since} and m.created_at < ${until}
        order by m.created_at desc limit 2000
      `));

      // Dokumen paling sering jadi SUMBER jawaban (dari citations).
      const topDocs = rowsOf<{ document_id: string; title: string | null; hits: string; avg_score: string }>(
        await tx.execute(sql`
          select cit->>'documentId' as document_id,
                 max(d.title)       as title,
                 count(*)::int      as hits,
                 avg((cit->>'score')::float) as avg_score
          from messages m
          join conversations c on c.id = m.conversation_id
          cross join lateral jsonb_array_elements(coalesce(m.citations, '[]'::jsonb)) cit
          left join documents d on d.id = (cit->>'documentId')::uuid
          where c.chatbot_id = ${chatbotId} and m.deleted_at is null
            and m.created_at >= ${since} and m.created_at < ${until}
          group by 1 order by hits desc limit 10
        `));

      const daily = rowsOf<{ day: string; n: string }>(await tx.execute(sql`
        select to_char(date_trunc('day', m.created_at), 'YYYY-MM-DD') as day,
               count(*)::int as n
        from messages m
        join conversations c on c.id = m.conversation_id
        where c.chatbot_id = ${chatbotId} and m.role = 'user'
          and m.deleted_at is null and m.created_at >= ${since} and m.created_at < ${until}
        group by 1 order by 1
      `));

      return {
        days,
        range: { from: awalTampil(rentang), to: rentang.akhirTampil },
        totals: {
          conversations: Number(totals[0]?.conversations ?? 0),
          questions: Number(totals[0]?.questions ?? 0),
          withCitation: Number(totals[0]?.with_citation ?? 0),
        },
        unanswered: Number(noCite[0]?.n ?? 0),
        topQuestions: topQ.map((r) => ({ question: r.q, count: Number(r.n) })),
        topKeywords: keywords(sample.map((r) => r.content)),
        topDocuments: topDocs.map((r) => ({
          documentId: String(r.document_id),
          title: r.title,
          hits: Number(r.hits),
          avgScore: Number(r.avg_score ?? 0),
        })),
        daily: daily.map((r) => ({ day: r.day, questions: Number(r.n) })),
      };
    });
  },
};
