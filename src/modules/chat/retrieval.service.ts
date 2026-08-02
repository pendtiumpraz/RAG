import { sql } from 'drizzle-orm';
import { withTenant } from '@/modules/core/db/tenant-context';
import { apiKeyResolver } from '@/modules/settings/credentials.repository';
import { embed, embeddingDims } from '@/modules/knowledge/embeddings';
import { rrfFuse, mmrSelect, contentTokens, dedupeNearDuplicates } from './fusion';
import { lexicalTsquery } from './lexical-query';
import { adaSaring, type SaringDokumen } from '@/modules/knowledge/saring';
import { pasangUlangSkala, porsiKandidat, terapkanRerank } from './rerank';
import { layakBiner, porsiSaring } from './kuantisasi';
import { platformSettings } from '@/modules/core/db/schema';
import { db } from '@/modules/core/db';
import { cariRerank, nilaiUlang } from './rerank-penyedia';
import { log } from '@/modules/core/observability';
import { tenantSettings } from '@/modules/core/db/schema';
import { eq } from 'drizzle-orm';

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
 *
 * 40 → 120 pada 31 Jul 2026, disetujui pemilik produk setelah diukur.
 *
 * Yang diukur (`npm run eval:tier1`, 400 dokumen × 60 potongan, MiniLM):
 *
 *   • Dari 61 pertanyaan yang potongan benarnya MEMANG terjangkau pencarian
 *     datar, ambang 40 menjatuhkan 5 — 8,2% jawaban yang seharusnya
 *     terambil, hilang sebelum lapisan kedua sempat membacanya.
 *   • Recall 95% pada korpus itu menuntut 95 dokumen, jauh di atas 40. Dan
 *     angkanya memburuk saat korpus tumbuh, karena pengganggu bertambah
 *     sementara ambangnya tetap.
 *
 * Sebabnya bukan peringkatnya yang salah melainkan perata-rataan: centroid
 * satu bagian adalah avg() atas 50 potongan, jadi potongan yang membawa
 * jawaban hanya menyumbang seperlima puluh arahnya.
 *
 * Kenapa 120, bukan 95 yang persis terukur: 95 adalah titik di mana recall
 * PAS 95% pada korpus 400 dokumen, dan angkanya memburuk saat korpus tumbuh
 * karena pengganggu bertambah sementara ambangnya tetap. 120 memberi ruang
 * untuk pertumbuhan itu tanpa melompat ke ambang yang biayanya terasa.
 *
 * Biayanya, dan kapan ia terasa: yang tumbuh hanya jumlah potongan yang
 * dipindai lapisan kedua — 120 dokumen alih-alih 40. Lapisan pertamanya
 * sendiri tetap satu kueri berindeks. Di korpus produksi hari ini (6
 * dokumen) keduanya mengambil semuanya, jadi tak ada beda sama sekali; beda
 * itu baru muncul setelah korpus melewati TIERED_MIN_CHUNKS. UKUR LAGI
 * latensi lambda pada saat itu — pool-nya max:1 dan waktunya berbatas.
 */
const TIER1_DOCS = 120;

/** Kandidat catatan Memory yang diadu di RRF. Kecil: tabelnya satu baris per
 *  dokumen, dan gunanya memberi gambaran luas — bukan menyapu korpus. */
const MEM_POOL = 12;

/** Jatah maksimum ringkasan dalam hasil akhir: sepertiga, minimal satu.
 *  Teks asli harus tetap mayoritas — lihat alasannya di ekor `retrieve()`. */
const memCap = (k: number) => Math.max(1, Math.floor(k / 3));

export interface RetrievedChunk {
  documentId: string;
  title: string | null;
  content: string;
  score: number;
  /**
   * Asal potongan ini.
   *
   * `document` — teks ASLI dari berkas pelanggan.
   * `memory`   — RINGKASAN yang ditulis LLM dari berkas itu (agen Memory).
   *
   * Perbedaannya wajib dibawa sampai ke prompt dan sitasi. Ringkasan adalah
   * tafsiran, bukan kutipan; menyodorkannya ke model dengan label yang sama
   * seperti teks asli berarti model boleh mengutip kalimat buatan AI seolah
   * itu bunyi dokumen — persis jenis karangan yang mode kepatuhan ketat
   * ada untuk mencegahnya.
   */
  kind?: 'document' | 'memory';
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
/** Kandidat yang dipahami MMR — bentuk yang beredar setelah fusi. */
interface Berskor {
  id: string; title: string | null; content: string;
  kind: string; rank: number; score: number;
}

/**
 * Nilai ulang dengan reranker bila tenant menyalakannya; kalau tidak,
 * kembalikan apa adanya.
 *
 * MEMANGGIL JARINGAN — wajib dipanggil di LUAR withTenant(). Pembacaan
 * setelan di bawah membuka transaksinya sendiri dan menutupnya SEBELUM
 * panggilan keluar, bukan membungkusnya.
 */
async function mungkinRerank(
  tenantId: string, query: string, scored: Berskor[], k: number,
): Promise<Berskor[]> {
  if (scored.length < 2) return scored;

  const [set] = await withTenant(tenantId, (tx) =>
    tx.select({ m: tenantSettings.activeRerankModel }).from(tenantSettings)
      .where(eq(tenantSettings.tenantId, tenantId)).limit(1));
  const model = cariRerank(set?.m);
  if (!model) return scored;                    // NULL = mati, dan itu bawaannya

  /* Hanya puncak daftar yang dinilai ulang. Ekornya jarang terpilih dan tiap
     kandidat berharga satu lintasan model — mengirim semuanya membuat satu
     pertanyaan pada korpus besar berbiaya berlipat tanpa ada yang memutuskan
     begitu. */
  const batas = porsiKandidat(k);
  const puncak = scored.slice(0, batas);
  const ekor = scored.slice(batas);

  try {
    const t0 = Date.now();
    const hasil = await nilaiUlang(model, query, puncak, { ambilKunci: apiKeyResolver(tenantId) });
    const baru = pasangUlangSkala(terapkanRerank(puncak, hasil) as Berskor[]);
    log('info', {
      event: 'rerank.selesai', model: model.id, kandidat: puncak.length,
      dinilai: hasil.length, durasiMs: Date.now() - t0,
    });
    return [...baru, ...ekor];
  } catch (e) {
    /* GAGAL DENGAN TENANG. Reranker adalah penyempurnaan; hasil yang urutannya
       agak kurang tepat jauh lebih baik daripada pertanyaan yang tak terjawab
       sama sekali. Tapi kegagalannya DICATAT — lapisan yang diam-diam mati
       akan tampak seperti "kok tidak ada bedanya" berbulan-bulan. */
    log('warn', { event: 'rerank.gagal', model: model.id, pesan: (e as Error).message });
    return scored;
  }
}

/**
 * Saklar kuantisasi biner, di-cache pendek.
 *
 * Dibaca sekali per beberapa detik, bukan tiap pertanyaan: ia berubah
 * paling-paling beberapa kali seumur pemasangan, dan satu query tambahan di
 * jalur terpanas produk untuk membaca boolean yang praktis tak pernah berubah
 * adalah biaya yang tak dibeli siapa pun.
 */
let cacheSaklar: { nilai: boolean; sampai: number } | null = null;

async function saklarBiner(): Promise<boolean> {
  if (cacheSaklar && Date.now() < cacheSaklar.sampai) return cacheSaklar.nilai;
  try {
    const rows = await db.select({ v: platformSettings.binaryQuantize })
      .from(platformSettings).limit(1);
    const nilai = Boolean(rows[0]?.v);
    cacheSaklar = { nilai, sampai: Date.now() + 30_000 };
    return nilai;
  } catch {
    /* Gagal membaca saklar TIDAK boleh mengubah perilaku retrieval. Jatuh ke
       MATI, yaitu jalur satu tahap yang sudah terbukti — bukan ke jalur baru
       yang kebetulan sedang diuji. */
    return false;
  }
}

export const retrievalService = {
  async retrieve(
    tenantId: string,
    chatbotId: string,
    embeddingModel: string,
    query: string,
    k = 6,
    /**
     * Penyaring metadata — folder, ekstensi, rentang waktu ubah.
     *
     * DITERAPKAN DI KETIGA TEMPAT, dan itu yang menentukan. Menerapkannya
     * hanya di kaki potongan berarti lapisan pertama tetap memilih 120
     * dokumennya TANPA memperhatikan penyaring — dan ke-120 itu bisa habis
     * tersaring semuanya, sehingga jawabannya kosong padahal dokumennya ada.
     */
    saring?: SaringDokumen,
  ): Promise<RetrievedChunk[]> {
    const getApiKey = apiKeyResolver(tenantId);
    const [qVec] = await embed(embeddingModel, [query], { tenantId, getApiKey });
    const vecLiteral = `[${qVec.join(',')}]`;
    /* Kata tanya dibuang, sisanya digabung OR. Dihitung SEKALI di luar SQL
       supaya bisa diuji unit tanpa basis data — dan karena bentuk kuery
       inilah yang pernah mematikan seluruh kaki leksikal tanpa satu pun
       galat, ia layak punya tesnya sendiri. */
    const lexQuery = lexicalTsquery(query);

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
      ? sql`subvector(d.embedding, 1, ${dims})::halfvec(${sql.raw(String(dims))}) <=> subvector(${vecLiteral}::halfvec, 1, ${dims})::halfvec(${sql.raw(String(dims))})`
      : sql`d.embedding <=> ${vecLiteral}::halfvec`;
    const dimsFilter = useSub ? sql`and d.embedding_dims = ${dims}` : sql``;

    /**
     * Penyaring metadata, dirakit SEKALI untuk dipakai di ketiga tempat.
     *
     * Satu perakit, bukan tiga potongan SQL yang ditulis terpisah: tiga
     * salinan syarat yang sama adalah tiga kesempatan untuk menyimpang, dan
     * yang menyimpang di lapisan pertama tak menghasilkan galat — cuma
     * jawaban yang kosong tanpa sebab yang bisa dilihat.
     *
     * `alias` ada karena tabelnya berbeda di tiap tempat: `d` untuk documents,
     * `v` untuk document_vectors.
     */
    const saringSql = (alias: string) => {
      if (!adaSaring(saring)) return sql``;
      const a = sql.raw(alias);
      const bagian = [
        saring!.ext?.length
          ? sql`and ${a}.ext = any(${sql`array[${sql.join(saring!.ext.map((e) => sql`${e}`), sql`, `)}]::text[]`})`
          : sql``,
        /* PREFIKS, dan `folder = x OR folder LIKE 'x/%'` — bukan LIKE 'x%'.
           Tanpa pemisah eksplisit, penyaring folder "kebijakan" ikut menyapu
           "kebijakan-lama/", yaitu folder yang berbeda sama sekali. */
        saring!.folder
          ? sql`and (${a}.folder = ${saring!.folder} or ${a}.folder like ${`${saring!.folder}/%`})`
          : sql``,
        saring!.sejak ? sql`and ${a}.modified_at >= ${saring!.sejak}` : sql``,
        saring!.sampai ? sql`and ${a}.modified_at <= ${saring!.sampai}` : sql``,
      ];
      return sql.join(bagian, sql` `);
    };

    /* Jarak Hamming atas bentuk biner — dan jarak eksak yang sama persis,
       tapi dibaca dari CTE penyaring alih-alih dari tabel. Keduanya disusun
       di sini supaya bentuk ekspresinya tak pernah menyimpang antara tahap
       satu dan tahap dua: dua ekspresi jarak yang ditulis terpisah adalah dua
       ekspresi yang suatu hari berbeda. */
    const kolomBiner = useSub
      ? sql`binary_quantize(subvector(d.embedding, 1, ${dims}))::bit(${sql.raw(String(dims))})`
      : sql`binary_quantize(d.embedding)::bit(1536)`;
    const kueriBiner = useSub
      ? sql`binary_quantize(subvector(${vecLiteral}::halfvec, 1, ${dims}))::bit(${sql.raw(String(dims))})`
      : sql`binary_quantize(${vecLiteral}::halfvec)::bit(1536)`;
    const binerDist = sql`${kolomBiner} <~> ${kueriBiner}`;
    const distSaring = useSub
      ? sql`subvector(s.embedding, 1, ${dims})::halfvec(${sql.raw(String(dims))}) <=> subvector(${vecLiteral}::halfvec, 1, ${dims})::halfvec(${sql.raw(String(dims))})`
      : sql`s.embedding <=> ${vecLiteral}::halfvec`;

    /**
     * Jarak untuk kaki Memory — memakai subvector dengan alasan yang BERBEDA
     * dari kaki dokumen.
     *
     * `memory_notes` tak punya kolom `embedding_dims`, jadi catatan lama yang
     * lahir saat vektor masih diberi padding tersimpan 1.536 dimensi,
     * sementara catatan baru 384. Membandingkannya langsung dengan literal
     * 384 dimensi ditolak Postgres: "different halfvec dimensions 1536 and
     * 384" — dan itu MEMATIKAN seluruh pencarian, bukan cuma kaki Memory,
     * karena ketiganya satu kueri.
     *
     * Memotong kedua sisi ke dimensi model menyamakan keduanya, dan hasilnya
     * tetap tepat: bagian yang dibuang dari catatan lama adalah nol.
     */
    const memDist = useSub
      ? sql`subvector(m.embedding, 1, ${dims})::halfvec(${sql.raw(String(dims))}) <=> subvector(${vecLiteral}::halfvec, 1, ${dims})::halfvec(${sql.raw(String(dims))})`
      : sql`m.embedding <=> ${vecLiteral}::halfvec`;
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

    /* Saklar kuantisasi biner — keputusan PEMASANGAN (superadmin), dan hanya
       berlaku bila korpusnya memang besar. Sinyal "besar" memakai `tiered`
       yang SUDAH dihitung di atas, bukan COUNT baru: menambah satu hitungan
       baris di jalur terpanas produk untuk memutuskan sebuah pengoptimalan
       adalah cara membayar ongkos yang hendak dihemat. */
    const biner = layakBiner(await saklarBiner(), tiered);

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
    const jarakTier1 = useSub
      ? sql`subvector(v.centroid, 1, ${dims})::halfvec(${sql.raw(String(dims))}) <=> subvector(${vecLiteral}::halfvec, 1, ${dims})::halfvec(${sql.raw(String(dims))})`
      : sql`v.centroid <=> ${vecLiteral}::halfvec`;

    /* Dokumen diperingkat lewat BAGIAN TERBAIKNYA (min), bukan lewat satu
       rerata (migrasi 0037). Bedanya menentukan untuk dokumen tebal: rerata
       kontrak 300 halaman mewakili tema umumnya, sementara pertanyaan
       biasanya menyasar satu pasal — dan dokumen yang terlewat di lapisan
       pertama tak akan pernah dibaca di lapisan kedua.

       `group by doc_ref` lalu `limit`, BUKAN limit atas baris bagian:
       membatasi bagian akan membiarkan satu dokumen tebal memakan seluruh
       40 slot lewat sepuluh bagiannya, dan sembilan dokumen lain yang
       relevan justru tersingkir. Yang dibatasi harus jumlah DOKUMEN. */
    const tierFilter = tiered
      ? sql`and d.doc_ref in (
          select v.doc_ref from document_vectors v
          where v.embedding_model = ${embeddingModel}
            and v.deleted_at is null
            and v.knowledge_base_id in (select id from kb)
            ${useSub ? sql`and v.embedding_dims = ${dims}` : sql``}
            ${saringSql('v')}
          group by v.doc_ref
          order by min(${jarakTier1})
          limit ${TIER1_DOCS})`
      : sql``;

    /**
     * KUANTISASI BINER — dua tahap, dan tahap pertama TIDAK menentukan urutan
     * apa pun.
     *
     * Jarak Hamming hanya mempersempit kandidat; jarak eksak di CTE `vec`
     * yang memutuskan. Presisi 1 bit membuang seluruh besaran dan menyisakan
     * tanda tiap dimensi, jadi dua vektor yang arahnya mirip tapi panjangnya
     * jauh berbeda bisa berjarak Hamming sama persis — memakai peringkatnya
     * apa adanya berarti menyerahkan pilihan dokumen pada informasi yang
     * justru sudah dibuang.
     *
     * Kalau saklarnya mati, SQL-nya persis seperti sebelum kartu ini: satu
     * tahap, tanpa CTE tambahan, tanpa satu pun biaya. Jalur yang sudah
     * terbukti tak boleh ikut membayar percobaan yang belum.
     */
    const rows = await withTenant(tenantId, async (tx) => {
      if (biner) {
        /* ef_search HARUS ikut naik bersama batas penyaring.
           HNSW tak pernah mengembalikan lebih dari ef_search kandidat, BERAPA
           PUN limit yang ditulis — jadi `limit 480` dengan ef_search bawaan
           (40) diam-diam menyaring jadi 40, dan 440 sisanya tak pernah ada.
           Justru di korpus besar — satu-satunya tempat lapisan ini dimaksudkan
           bekerja — kehilangan itu paling parah. Ketahuan saat mengukur, bukan
           saat menulis: pengukurannya sempat menyalahkan kuantisasi bit atas
           kehilangan yang sebenarnya milik parameter indeks.
           SET LOCAL, jadi ia hanya berlaku di transaksi ini. */
        await tx.execute(sql`set local hnsw.ef_search = ${sql.raw(String(Math.max(40, porsiSaring(pool))))}`);
      }
      // SATU perjalanan ke database untuk kedua kaki. Menjalankannya sebagai
      // dua query berarti dua kali latensi jaringan pada jalur terpanas produk.
      const res = await tx.execute(sql`
        with kb as (
          select a.knowledge_base_id as id
          from chatbot_knowledge_bases a
          where a.chatbot_id = ${chatbotId} and a.deleted_at is null
        ),
        ${biner ? sql`
        -- KUANTISASI BINER, tahap 1 dari 2. Penyaring saja; lihat komentar TS.
        saring as (
          select d.id, d.embedding
          from documents d
          where d.knowledge_base_id in (select id from kb)
            and d.embedding_model = ${embeddingModel}
            and d.deleted_at is null
            and d.embedding is not null
            ${dimsFilter}
            ${tierFilter}
            ${saringSql('d')}
          order by ${binerDist}
          limit ${porsiSaring(pool)}
        ),
        vec as (
          select s.id, row_number() over (order by ${distSaring}) as rnk
          from saring s
          order by ${distSaring}
          limit ${pool}
        ),` : sql`
        vec as (
          select d.id, row_number() over (order by ${dist}) as rnk
          from documents d
          where d.knowledge_base_id in (select id from kb)
            and d.embedding_model = ${embeddingModel}
            and d.deleted_at is null
            and d.embedding is not null
            ${dimsFilter}
            ${tierFilter}
            ${saringSql('d')}
          order by ${dist}
          limit ${pool}
        ),`}
        /* to_tsquery atas kuery ber-OR yang dibangun lexicalTsquery(), BUKAN
           plainto_tsquery atas pertanyaan mentah.

           plainto_tsquery menggabungkan seluruh kata dengan AND, dan karena
           konfigurasinya 'simple' tak ada stopword yang dibuang — jadi kata
           tanya ikut jadi syarat WAJIB. Terukur di korpus produksi: "berapa
           NPWP perusahaan" mencocoki NOL potongan sementara "NPWP" saja
           mencocoki tiga. Pada hampir setiap pertanyaan yang ditulis manusia
           kaki ini mengembalikan kosong, dan hybrid search yang dijual tiga
           kaki sebenarnya berjalan satu setengah. */
        q as (select to_tsquery('simple', ${lexQuery ?? ''}) as tsq),
        lex as (
          select d.id, row_number() over (order by ts_rank_cd(d.fts, q.tsq) desc) as rnk
          from documents d, q
          where d.knowledge_base_id in (select id from kb)
            and d.embedding_model = ${embeddingModel}
            and d.deleted_at is null
            -- Pertanyaan yang isinya HANYA kata tanya tak punya istilah untuk
            -- dicari; lexicalTsquery mengembalikan null, kaki ini kosong, dan
            -- penggabungan jatuh ke vektor murni. Itu memang perilaku benar.
            and ${lexQuery ? sql`d.fts @@ q.tsq` : sql`false`}
          order by ts_rank_cd(d.fts, q.tsq) desc
          limit ${pool}
        )
        ,
        /* ── KAKI KETIGA · MEMORY ────────────────────────────────────
           Catatan agen Memory: satu ringkasan per DOKUMEN, ber-[[wikilink]].
           Ia menjawab yang tak bisa dijawab potongan mana pun — "dokumen ini
           isinya apa", "aturan cuti tersebar di mana saja" — karena tak ada
           satu potongan 800 karakter yang memuat gambaran utuhnya.

           Kaki, BUKAN gerbang. Catatan Memory adalah tafsiran LLM: kalau agen
           luput mencatat sebuah topik, menjadikannya penyaring berarti dokumen
           itu tak terjangkau sama sekali, tanpa pesan galat apa pun. Sebagai
           kaki, ia hanya bisa MENAMBAH kandidat — tak pernah menyembunyikan.

           Tabelnya kecil (satu baris per dokumen, bukan per potongan), jadi
           ikut di perjalanan yang sama tanpa biaya berarti. */
        mem as (
          select m.id, row_number() over (order by ${memDist}) as rnk,
                 (1 - (${memDist})) as cos
          from memory_notes m
          where m.chatbot_id = ${chatbotId}
            and m.deleted_at is null
            and m.embedding is not null
            -- Hanya ringkasan yang DIAKUI boleh ikut menjawab. Yang menunggu
            -- tinjauan atau ditolak tak pernah menyentuh jawaban pelanggan.
            and m.status = 'active'
          order by ${memDist}
          limit ${MEM_POOL}
        )
        select 'document' as kind, d.id, d.title, d.content,
               v.rnk as vec_rank, l.rnk as lex_rank, null::bigint as mem_rank,
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

        union all

        select 'memory', n.id, n.title, n.content_md,
               null::bigint, null::bigint, m.rnk, m.cos
        from mem m join memory_notes n on n.id = m.id
      `);
      return res as unknown as Array<{
        kind: 'document' | 'memory';
        id: string; title: string | null; content: string;
        vec_rank: number | null; lex_rank: number | null;
        mem_rank: number | null; cos: number | null;
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
      { ids: byRank((r) => r.mem_rank) },
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
        id, title: r.title, content: r.content, kind: r.kind,
        // titleBoost tetap dipakai sebagai dorongan terakhir: kaki leksikal
        // menangkap sebagian besar kasusnya, tapi judul sinyal yang lebih kuat
        // daripada kemunculan token di badan teks. Skalanya disesuaikan dengan
        // besaran RRF, bukan kosinus.
        rank: s + titleBoost(r.title, tokens) * 0.05,
        score: Number(r.cos ?? 0),
      };
    });

    /* ── reranker lintas-encoder, bila tenant menyalakannya ─────────────
     *
     * DI SINI, dan tempatnya tidak sembarang. Titik ini berada di LUAR kedua
     * withTenant() di atas — keduanya sudah ditutup. Reranker memanggil
     * jaringan, dan di Vercel kolam koneksi dipatok max:1: satu panggilan
     * lambat di dalam transaksi menahan satu-satunya koneksi selama seluruh
     * perjalanan HTTP-nya. tests/audit-koneksi.test.ts yang menjaga itu tetap
     * begitu.
     *
     * Sebelum MMR, bukan sesudah. MMR menata KERAGAMAN di atas urutan yang
     * diberikan padanya; kalau reranker berjalan sesudahnya, ia menilai ulang
     * daftar yang sudah diacak keragamannya dan hasilnya dua penataan yang
     * saling menimpa.
     *
     * Kegagalannya TIDAK menggagalkan pencarian. Hasil yang urutannya agak
     * kurang tepat jauh lebih baik daripada tak ada jawaban sama sekali —
     * apalagi untuk lapisan yang seluruh nilainya adalah penyempurnaan.
     */
    const urut = await mungkinRerank(tenantId, query, scored, k);

    // Dua tahap, dan urutannya penting. Kembar dibuang TEGAS lebih dulu:
    // ia tak membawa informasi baru sama sekali, sedangkan MMR hanya
    // mengurangi nilai — dan kembar yang relevansinya nyaris sama tetap
    // menang di MMR. Baru sesudah itu MMR menata keragaman yang lebih halus.
    // Pemilihan memakai nilai RRF, bukan kosinus — urutan ditentukan
    // penggabungan dua kaki, bukan salah satunya saja.
    const cand = urut.map((s) => ({ id: s.id, score: s.rank, tokens: contentTokens(s.content) }));
    // Diambil LEBIH dari k: sebagian bisa gugur oleh jatah ringkasan di bawah,
    // dan tanpa cadangan, slot konteks yang mahal itu terbuang kosong.
    const picked = mmrSelect(dedupeNearDuplicates(cand), k + memCap(k), MMR_LAMBDA);
    const pos = new Map(scored.map((s) => [s.id, s]));

    /**
     * Jatah ringkasan DIBATASI. Ringkasan berguna untuk pertanyaan bergambaran
     * luas, tapi ia tafsiran — bukan bunyi dokumen. Kalau ia boleh mengisi
     * seluruh konteks, jawaban atas pertanyaan faktual ("berapa nilai
     * kontraknya") akan bersandar pada parafrase LLM alih-alih angka aslinya.
     * Karena itu ia bersaing dalam RRF seperti kaki lain, lalu yang melebihi
     * jatah dibuang di ujung — mendahulukan teks asli.
     */
    const hasil: RetrievedChunk[] = [];
    let mem = 0;
    for (const p of picked) {
      if (hasil.length >= k) break;
      const s = pos.get(p.id)!;
      if (s.kind === 'memory') {
        if (mem >= memCap(k)) continue;   // dilewati; cadangan mengisi slotnya
        mem++;
      }
      hasil.push({ documentId: s.id, title: s.title, content: s.content, score: s.score, kind: s.kind });
    }
    return hasil;
  },
};
