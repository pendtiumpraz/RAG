import { sql } from 'drizzle-orm';
import { withTenant } from '@/modules/core/db/tenant-context';
import { apiKeyResolver } from '@/modules/settings/credentials.repository';
import { embed, embeddingDims } from '@/modules/knowledge/embeddings';
import { rrfFuse, mmrSelect, contentTokens, dedupeNearDuplicates } from './fusion';

/**
 * Bobot MMR: 0,75 condong ke relevansi, cukup untuk membuang potongan yang
 * benar-benar kembar tanpa membuang potongan kedua dari dokumen panjang yang
 * memang saling melengkapi.
 */
const MMR_LAMBDA = 0.75;

/**
 * Kandidat DOKUMEN dari lapisan pertama. Sengaja jauh lebih banyak dari
 * jumlah potongan yang akhirnya dipakai: rerata dokumen tebal itu kabur, dan
 * dokumen yang terlewat di sini tak akan pernah dibaca di lapisan kedua.
 */
const TIER1_DOCS = 40;

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
 * HYBRID SEARCH top-k utk satu chatbot.
 *
 * Dua kaki yang saling menutup titik buta:
 *   • VEKTOR   — menilai makna. Kuat pada parafrase ("klaim" ↔ "pengklaiman"),
 *                lemah pada token literal ("RAB 2020" vs "RAB 2021" nyaris
 *                identik secara embedding).
 *   • LEKSIKAL — full-text Postgres (kolom tergenerasi `fts`, migrasi 0027).
 *                Kuat persis di tempat vektor lemah: kode, tahun, nomor, nama.
 *
 * Hasil keduanya digabung dengan Reciprocal Rank Fusion — memakai PERINGKAT,
 * bukan skor, karena kosinus (0..1) dan ts_rank_cd (skala lain, tak terbatas)
 * tak sebanding dan menjumlahkannya berarti didominasi kaki yang kebetulan
 * berangka besar. Lalu MMR menyingkirkan potongan kembar, yang nyata terjadi
 * ketika satu berkas ter-ingest dua kali.
 *
 * D11: konteks chatbot = UNION dokumen semua KNOWLEDGE BASE yang di-assign
 * padanya. withTenant() + filter kb + embedding_model + deleted_at IS NULL ⇒
 * tetap terisolasi penuh per tenant; assignment-lah yang menentukan jangkauan.
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

    /**
     * Ekspresi jarak yang COCOK dengan indeks parsial berdimensi asli
     * (migrasi 0028). Karena padding-nya nol, memotong ke dimensi asli
     * menghasilkan jarak yang IDENTIK — terbukti selisih 0 terhadap data
     * produksi — sambil memakai indeks yang ±3,75× lebih kecil di RAM.
     *
     * Dua hal harus dipenuhi agar Postgres benar-benar MEMAKAI indeks itu:
     * ekspresi ORDER BY-nya sama persis, dan predikat `embedding_dims`
     * disebut eksplisit (planner tak menyimpulkannya dari nama model).
     * Model yang belum tercatat dimensinya jatuh ke indeks 1536 penuh —
     * lebih lambat sedikit, tapi tak pernah salah hasil.
     */
    const dims = await embeddingDims(embeddingModel);
    const useSub = dims != null && dims < 1536;
    const dist = useSub
      ? sql`subvector(d.embedding, 1, ${dims})::vector(${sql.raw(String(dims))}) <=> subvector(${vecLiteral}::vector, 1, ${dims})::vector(${sql.raw(String(dims))})`
      : sql`d.embedding <=> ${vecLiteral}::vector`;
    const dimsFilter = useSub ? sql`and d.embedding_dims = ${dims}` : sql``;
    const tokens = queryTokens(query);
    // Kandidat diambil jauh lebih banyak dari k: penggabungan & penyaringan
    // kembar baru bermakna kalau ada yang bisa dipilih.
    const pool = Math.min(Math.max(k * 5, 20), 40);

    /**
     * Lapisan penyaring dokumen dipakai HANYA bila vektornya memang ada.
     *
     * Tak ada mode yang harus dipilih siapa pun: lapisan pertama dibangun
     * sendiri oleh ingest begitu sebuah knowledge base melewati ambang
     * TIERED_MIN_CHUNKS, dan keberadaannya ITULAH sinyalnya. Di korpus kecil
     * indeks datar tak memakan apa pun dan tak punya risiko recall sama
     * sekali, jadi menambah lapisan di sana cuma menambah satu lompatan
     * tanpa imbalan.
     *
     * Satu query EXISTS berindeks — jauh lebih murah daripada menghitung
     * potongan pada tiap pertanyaan.
     */
    const tiered = await withTenant(tenantId, async (tx) => {
      const r = await tx.execute(sql`
        select exists (
          select 1 from document_vectors v
          where v.embedding_model = ${embeddingModel}
            and v.deleted_at is null
            and v.knowledge_base_id in (
              select a.knowledge_base_id from chatbot_knowledge_bases a
              where a.chatbot_id = ${chatbotId} and a.deleted_at is null)
        ) as ada`);
      return Boolean((r as unknown as Array<{ ada: boolean }>)[0]?.ada);
    });

    /**
     * Pada mode bertingkat, kaki vektor dibatasi ke potongan milik dokumen
     * yang lolos penyaringan. Kandidat dokumen diambil JAUH lebih banyak dari
     * yang dibutuhkan (TIER1_DOCS) karena rerata sebuah dokumen tebal itu
     * kabur — ia mewakili tema umumnya, bukan kalimat spesifik di dalamnya.
     *
     * Kaki LEKSIKAL sengaja TIDAK ikut dibatasi: ia menelusuri seluruh korpus
     * apa pun modenya. Itulah jaring pengaman terhadap kelemahan lapisan
     * pertama — pencarian kode, nomor, atau nama yang persis tetap menjangkau
     * dokumen yang centroid-nya meleset.
     */
    const tierFilter = tiered
      ? sql`and d.doc_ref in (
          select v.doc_ref from document_vectors v
          where v.embedding_model = ${embeddingModel}
            and v.deleted_at is null
            and v.knowledge_base_id in (select id from kb)
            ${useSub ? sql`and v.embedding_dims = ${dims}` : sql``}
          order by ${tiered && useSub
            ? sql`subvector(v.centroid, 1, ${dims})::vector(${sql.raw(String(dims))}) <=> subvector(${vecLiteral}::vector, 1, ${dims})::vector(${sql.raw(String(dims))})`
            : sql`v.centroid <=> ${vecLiteral}::vector`}
          limit ${TIER1_DOCS})`
      : sql``;

    const rows = await withTenant(tenantId, async (tx) => {
      // SATU perjalanan ke database untuk kedua kaki. Menjalankannya sebagai
      // dua query berarti dua kali latensi jaringan pada jalur terpanas produk.
      const res = await tx.execute(sql`
        with kb as (
          select a.knowledge_base_id as id
          from chatbot_knowledge_bases a
          where a.chatbot_id = ${chatbotId} and a.deleted_at is null
        ),
        vec as (
          select d.id, row_number() over (order by ${dist}) as rnk
          from documents d
          where d.knowledge_base_id in (select id from kb)
            and d.embedding_model = ${embeddingModel}
            and d.deleted_at is null
            and d.embedding is not null
            ${dimsFilter}
            ${tierFilter}
          order by ${dist}
          limit ${pool}
        ),
        q as (select plainto_tsquery('simple', ${query}) as tsq),
        lex as (
          select d.id, row_number() over (order by ts_rank_cd(d.fts, q.tsq) desc) as rnk
          from documents d, q
          where d.knowledge_base_id in (select id from kb)
            and d.embedding_model = ${embeddingModel}
            and d.deleted_at is null
            -- Query yang seluruhnya stopword menghasilkan tsquery kosong dan
            -- tak mencocoki apa pun; kaki ini lalu kosong dan penggabungan
            -- otomatis jatuh ke vektor murni. Itu memang perilaku yang benar.
            and d.fts @@ q.tsq
          order by ts_rank_cd(d.fts, q.tsq) desc
          limit ${pool}
        )
        select d.id, d.title, d.content,
               v.rnk as vec_rank, l.rnk as lex_rank,
               -- Kemiripan kosinus tetap dibawa keluar meski PERINGKAT-nya
               -- ditentukan RRF. Alasannya: skor yang dipublikasikan sudah
               -- terlanjur berarti "kemiripan 0..1" — dipakai chip sitasi di
               -- widget dan parameter minScore di /api/v1/search. Menggantinya
               -- dengan nilai RRF (~0,02) akan membuat minScore: 0.5 menyaring
               -- habis semua hasil tanpa ada yang tahu sebabnya.
               (1 - (${dist})) as cos
        from vec v
        full outer join lex l on l.id = v.id
        join documents d on d.id = coalesce(v.id, l.id)
      `);
      return res as unknown as Array<{
        id: string; title: string | null; content: string;
        vec_rank: number | null; lex_rank: number | null; cos: number | null;
      }>;
    });

    if (!rows.length) return [];

    // Susun ulang tiap kaki jadi daftar berurut untuk RRF.
    const byRank = (pick: (r: (typeof rows)[number]) => number | null) =>
      rows.filter((r) => pick(r) != null)
        .sort((a, b) => Number(pick(a)) - Number(pick(b)))
        .map((r) => r.id);

    const fused = rrfFuse([
      { ids: byRank((r) => r.vec_rank) },
      { ids: byRank((r) => r.lex_rank) },
    ]);

    const meta = new Map(rows.map((r) => [r.id, r]));
    /**
     * Dua angka, dua tugas — dan memisahkannya yang membuat keduanya jujur:
     *  • `rank`  — nilai RRF (+ dorongan judul). MENENTUKAN URUTAN. Skalanya
     *              kecil dan relatif; tak pernah keluar dari modul ini.
     *  • `score` — kemiripan kosinus 0..1. DIPUBLIKASIKAN. Inilah yang sudah
     *              terlanjur dipahami sebagai "seberapa mirip" oleh chip
     *              sitasi widget dan parameter minScore di API publik.
     */
    const scored = [...fused.entries()].map(([id, s]) => {
      const r = meta.get(id)!;
      return {
        id, title: r.title, content: r.content,
        // titleBoost tetap dipakai sebagai dorongan terakhir: kaki leksikal
        // menangkap sebagian besar kasusnya, tapi judul sinyal yang lebih kuat
        // daripada kemunculan token di badan teks. Skalanya disesuaikan dengan
        // besaran RRF, bukan kosinus.
        rank: s + titleBoost(r.title, tokens) * 0.05,
        score: Number(r.cos ?? 0),
      };
    });

    // Dua tahap, dan urutannya penting. Kembar dibuang TEGAS lebih dulu:
    // ia tak membawa informasi baru sama sekali, sedangkan MMR hanya
    // mengurangi nilai — dan kembar yang relevansinya nyaris sama tetap
    // menang di MMR. Baru sesudah itu MMR menata keragaman yang lebih halus.
    // Pemilihan memakai nilai RRF, bukan kosinus — urutan ditentukan
    // penggabungan dua kaki, bukan salah satunya saja.
    const cand = scored.map((s) => ({ id: s.id, score: s.rank, tokens: contentTokens(s.content) }));
    const picked = mmrSelect(dedupeNearDuplicates(cand), k, MMR_LAMBDA);
    const pos = new Map(scored.map((s) => [s.id, s]));
    return picked.map((p) => {
      const s = pos.get(p.id)!;
      return { documentId: s.id, title: s.title, content: s.content, score: s.score };
    });
  },
};
