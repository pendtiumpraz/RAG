import { eq, and, isNull, sql } from 'drizzle-orm';
import { ekstensi, folderDari, waktuUbah } from './saring';
import { tenantSettings, knowledgeBases, documentDuplicates } from '@/modules/core/db';
import { withTenant } from '@/modules/core/db/tenant-context';
import { dispatch } from '@/modules/core/events';
import { apiKeyResolver } from '@/modules/settings/credentials.repository';
import { embed, embeddingDims } from './embeddings';
import { documentRepository as docs } from './document.repository';
import { ValidationError } from '@/modules/chatbot/chatbot.service';
import { documentVectorsService } from './document-vectors.service';
import { contentFingerprint, fingerprintable, nameSizeKey } from './dedupe';
import { BYTES_PER_CHUNK, CHUNKS_PER_DOC } from '@/modules/core/limits';
import { limitsFor } from '@/modules/core/limits-server';
import { audit } from '@/modules/core/guardrails';

/**
 * Pemotong teks — pindah ke `./chunker` (D-a-chunk, 31 Jul 2026).
 *
 * Diekspor ulang dari sini karena `chunkText` sudah jadi nama yang dipakai
 * pemanggil dan tes; memindahkannya sekaligus mengganti jalur impor akan
 * mencampur dua perubahan dalam satu langkah, dan yang satu menyamarkan yang
 * lain. Isinya sendiri kini modul sendiri supaya bisa diuji tanpa menyeret
 * seluruh service beserta basis datanya.
 */
import { chunkText } from './chunker';
export { chunkText };


/* ── lapisan pertama retrieval bertingkat ─────────────────────────────
   Ambang: di bawah ini, indeks vektor datar tak memakan apa pun dan tak
   punya risiko recall sama sekali — menambah lapisan penyaring di sana cuma
   menambah satu lompatan tanpa imbalan. Di atasnya, indeks datar mulai
   menuntut RAM yang tumbuh linear terhadap korpus, dan lapisan pertamalah
   yang menghentikan pertumbuhan itu.

   200 ribu potongan ≈ 300 MB indeks datar — masih nyaman di mana pun. Di
   47 juta potongan ia jadi 69 GB, dan itu yang harus dicegah. */
const TIERED_MIN_CHUNKS = 200_000;

/**
 * Bangun/perbarui vektor dokumen bila KB ini sudah cukup besar.
 *
 * Dipanggil setelah ingest. Kegagalannya TIDAK boleh menggagalkan ingest:
 * lapisan pertama adalah optimasi, dan dokumen yang sudah masuk tetap bisa
 * dicari lewat indeks datar. Karena itu galatnya dicatat, bukan dilempar.
 */
async function maybeBuildTier1(
  tenantId: string,
  knowledgeBaseId: string,
  modelId: string,
  input: { externalId?: string; title?: string },
): Promise<void> {
  try {
    const forced = await withTenant(tenantId, async (tx) => {
      const s = await tx.select({ t: tenantSettings.tieredRetrieval }).from(tenantSettings)
        .where(eq(tenantSettings.tenantId, tenantId)).limit(1);
      return s[0]?.t === true;
    });

    if (!forced) {
      // Hitung HANYA saat ingest, bukan saat menjawab — di jalur panas ini
      // akan jadi beban baru, kebalikan dari tujuannya.
      const n = await withTenant(tenantId, async (tx) => {
        const r = await tx.execute(sql`
          select count(*)::int n from documents
          where knowledge_base_id = ${knowledgeBaseId} and deleted_at is null`);
        return Number((r as unknown as Array<{ n: number }>)[0]?.n ?? 0);
      });
      if (n < TIERED_MIN_CHUNKS) return;
    }

    // Hanya dokumen yang BARU SAJA berubah — membangun ulang seluruh KB pada
    // tiap berkas akan mengubah sync jadi O(n²).
    const ref = input.externalId ?? input.title;
    await documentVectorsService.rebuild(
      tenantId, knowledgeBaseId, modelId, ref ? [ref] : [],
    );
  } catch (err) {
    console.error('[tier1] gagal membangun vektor dokumen:', err);
  }
}

/**
 * Catat berkas kembar yang dilewati. Idempoten: sync berulang mengenai berkas
 * kembar yang sama, dan tanpa upsert antreannya akan penuh baris duplikat
 * tentang duplikat.
 */
async function recordDuplicate(tenantId: string, d: {
  knowledgeBaseId: string; sourceId?: string; externalId?: string; title?: string;
  sizeBytes?: number; contentHash?: string | null;
  canonicalDocRef: string; reason: 'name-size' | 'content-hash';
}): Promise<void> {
  try {
    await withTenant(tenantId, (tx) => tx.insert(documentDuplicates).values({
      tenantId, knowledgeBaseId: d.knowledgeBaseId, sourceId: d.sourceId,
      externalId: d.externalId, title: d.title, sizeBytes: d.sizeBytes,
      contentHash: d.contentHash ?? null,
      canonicalDocRef: d.canonicalDocRef, reason: d.reason,
    }).onConflictDoNothing());
  } catch (err) {
    // Gagal MENCATAT kembar tak boleh menggagalkan sync — catatannya untuk
    // manusia, keputusan melewatinya sudah diambil.
    console.error('[dedupe] gagal mencatat berkas kembar:', err);
  }
}

/**
 * Kuota penyimpanan terlampaui.
 *
 * Kelas SENDIRI, bukan ValidationError: rute perlu membedakan "permintaanmu
 * salah" (422) dari "jatahmu habis" (402 — perlu upgrade). Menyamakan
 * keduanya membuat pemilik data mengira berkasnya rusak, padahal yang perlu
 * mereka lakukan adalah menaikkan paket.
 */
export class QuotaError extends Error {
  constructor(message: string, readonly used: number, readonly limit: number) {
    super(message);
    this.name = 'QuotaError';
  }
}

/** Berapa potongan hidup yang sudah dipakai tenant ini. */
async function chunkUsage(tenantId: string): Promise<number> {
  return withTenant(tenantId, async (tx) => {
    const r = await tx.execute(sql`
      select count(*)::int n from documents where deleted_at is null`);
    return Number((r as unknown as Array<{ n: number }>)[0]?.n ?? 0);
  });
}

/**
 * Tolak ingest yang akan melampaui kuota potongan.
 *
 * Dijalankan per berkas, bukan sekali per sync: sync memproses sampai 150
 * berkas dalam satu jalan, dan memeriksa di awal saja akan membiarkan
 * seluruh sisanya menembus batas.
 */
/**
 * Aksi audit untuk penolakan kuota.
 *
 * SATU nama, dipakai di semua jalur. Analisis "berapa persen akun Free
 * menabrak kuota" hanya mungkin bila peristiwanya punya nama yang sama di
 * mana pun ia terjadi; dua nama berbeda untuk hal yang sama akan membuat
 * angkanya diam-diam separuh.
 */
export const AKSI_TOLAK_KUOTA = 'quota.rejected';

async function assertChunkQuota(
  tenantId: string, tambahan: number,
  /**
   * Dari mana ingest-nya datang — sync, unggahan manual, konektor URL, API.
   *
   * Ikut dicatat karena tiga pertanyaan yang ingin dijawab kartu induk
   * (a-plan-quota-eval) semuanya bergantung padanya: pengguna yang menabrak
   * kuota saat MENGUNGGAH sedang mencoba produknya dengan sengaja, sementara
   * yang menabraknya saat SYNC mungkin tak sedang melihat layar sama sekali.
   * Menyatukan keduanya jadi satu angka menghapus perbedaan yang justru
   * menentukan apakah kuotanya perlu dilonggarkan.
   */
  jalur: 'ingest' = 'ingest',
): Promise<void> {
  const { plan, isPlatform } = await withTenant(tenantId, async (tx) => {
    const r = await tx.execute(sql`
      select plan, is_platform from tenants where id = ${tenantId} limit 1`);
    const row = (r as unknown as Array<{ plan: string; is_platform: boolean }>)[0];
    return { plan: row?.plan ?? 'free', isPlatform: row?.is_platform === true };
  });

  // Operator platform tak pernah dibatasi, sejalan dengan kuota lain.
  if (isPlatform) return;
  const batas = (await limitsFor(plan)).maxChunks;
  if (batas === Infinity) return;

  const dipakai = await chunkUsage(tenantId);
  if (dipakai + tambahan <= batas) return;

  /* DICATAT DI TITIK PENOLAKAN, bukan diserahkan ke pemanggil.
     Penolakan kuota selama ini dilempar sebagai QuotaError dan diubah jadi
     402 di rute — benar untuk pengguna, tapi tak meninggalkan satu pun jejak.
     Akibatnya pertanyaan yang menentukan apakah kuota Free perlu dilonggarkan
     ("berapa persen akun baru menabraknya di hari pertama, dan berapa yang
     lalu hilang") mustahil dijawab, sekarang maupun enam bulan lagi.
     Diletakkan di sini karena ada TIGA pemanggil yang bisa menabraknya; satu
     saja yang lupa mencatat, dan angkanya diam-diam separuh. */
  await audit(tenantId, 'system', AKSI_TOLAK_KUOTA, jalur, {
    plan, terpakai: dipakai, batas, diminta: tambahan, jalur,
    // Selisihnya dicatat apa adanya: "kurang 3 potongan" dan "kurang 3.000"
    // adalah dua keadaan yang sangat berbeda saat memutuskan kuota baru.
    kurang: dipakai + tambahan - batas,
  });

  const dok = Math.round(batas / CHUNKS_PER_DOC).toLocaleString('id-ID');
  throw new QuotaError(
    `Kuota penyimpanan paket ${plan} terlampaui: ${dipakai.toLocaleString('id-ID')} dari `
    + `${batas.toLocaleString('id-ID')} potongan terpakai (setara ±${dok} dokumen). `
    + 'Hapus dokumen yang tak terpakai atau naikkan paket.',
    dipakai, batas,
  );
}

export const knowledgeService = {
  /**
   * Pemakaian penyimpanan tenant ini terhadap kuotanya — dipakai UI dan
   * halaman Usage supaya batasnya terlihat SEBELUM tertabrak.
   */
  async storageUsage(tenantId: string) {
    const { plan, isPlatform } = await withTenant(tenantId, async (tx) => {
      const r = await tx.execute(sql`
        select plan, is_platform from tenants where id = ${tenantId} limit 1`);
      const row = (r as unknown as Array<{ plan: string; is_platform: boolean }>)[0];
      return { plan: row?.plan ?? 'free', isPlatform: row?.is_platform === true };
    });
    const l = await limitsFor(plan);
    const chunks = await chunkUsage(tenantId);
    const kbs = await withTenant(tenantId, async (tx) => {
      const r = await tx.execute(sql`
        select count(*)::int n from knowledge_bases where deleted_at is null`);
      return Number((r as unknown as Array<{ n: number }>)[0]?.n ?? 0);
    });
    const batasChunks = isPlatform ? Infinity : l.maxChunks;
    const batasKbs = isPlatform ? Infinity : l.maxKnowledgeBases;
    return {
      plan, isPlatform,
      chunks, maxChunks: batasChunks,
      knowledgeBases: kbs, maxKnowledgeBases: batasKbs,
      /* Diterjemahkan ke satuan yang dimengerti manusia. Angka potongan
         adalah kuota yang SEBENARNYA; ini hanya cara membacanya. */
      approxDocuments: Math.round(chunks / CHUNKS_PER_DOC),
      approxBytes: chunks * BYTES_PER_CHUNK,
      percent: batasChunks === Infinity ? 0 : Math.min(100, Math.round((chunks / batasChunks) * 100)),
    };
  },

  /**
   * Apakah berkas ini kembar berdasarkan NAMA + UKURAN?
   *
   * Dipakai sync SEBELUM mengunduh — inilah satu-satunya lapisan yang bisa
   * menghemat unduhan. Mengembalikan doc_ref dokumen yang sudah ada, atau
   * null. Sengaja tak mencatat apa pun: pencatatan dilakukan pemanggil yang
   * tahu konteks sumbernya.
   */
  async findByNameSize(
    tenantId: string, knowledgeBaseId: string, name: string, size: number,
  ): Promise<string | null> {
    if (!nameSizeKey(name, size)) return null;
    return withTenant(tenantId, async (tx) => {
      const r = await tx.execute(sql`
        select doc_ref from documents
        where knowledge_base_id = ${knowledgeBaseId}
          and title = ${name}
          and size_bytes = ${size}
          and deleted_at is null
        limit 1`);
      return (r as unknown as Array<{ doc_ref: string }>)[0]?.doc_ref ?? null;
    });
  },

  /** Catat berkas kembar (dipakai sync untuk lapisan nama+ukuran). */
  recordDuplicate,

  /** Berkas kembar yang dilewati di sebuah KB — ditampilkan ke pengguna. */
  listDuplicates(tenantId: string, knowledgeBaseId?: string) {
    return withTenant(tenantId, (tx) => tx.execute(sql`
      select d.id, d.title, d.external_id as "externalId", d.size_bytes as "sizeBytes",
             d.canonical_doc_ref as "canonicalDocRef", d.reason,
             d.knowledge_base_id as "knowledgeBaseId", kb.name as "knowledgeBaseName",
             d.created_at as "createdAt"
      from document_duplicates d
      left join knowledge_bases kb on kb.id = d.knowledge_base_id and kb.deleted_at is null
      where d.deleted_at is null
        ${knowledgeBaseId ? sql`and d.knowledge_base_id = ${knowledgeBaseId}::uuid` : sql``}
      order by d.created_at desc
      limit 200`)) as unknown as Promise<Array<Record<string, unknown>>>;
  },

  listDocuments(tenantId: string, knowledgeBaseId: string) {
    return withTenant(tenantId, (tx) => docs.listActive(tx, tenantId, knowledgeBaseId));
  },

  listTrashed(tenantId: string, knowledgeBaseId: string) {
    return withTenant(tenantId, (tx) => docs.listTrashed(tx, tenantId, knowledgeBaseId));
  },

  /** Manifest file upstream (delta sync) — lihat documentRepository.manifestBySource. */
  manifestBySource(tenantId: string, sourceId: string) {
    return withTenant(tenantId, (tx) => docs.manifestBySource(tx, tenantId, sourceId));
  },

  /** Soft-delete semua chunk dari file upstream tertentu (versi lama / file hilang). */
  removeExternal(tenantId: string, sourceId: string, externalIds: string[]) {
    return withTenant(tenantId, (tx) => docs.softDeleteByExternalIds(tx, tenantId, sourceId, externalIds));
  },

  /** Buang chunk warisan pra-delta dari source ini (lihat repository). */
  removeLegacy(tenantId: string, sourceId: string) {
    return withTenant(tenantId, (tx) => docs.softDeleteLegacyBySource(tx, tenantId, sourceId));
  },

  /** Chunk → embed → simpan. Validasi KB hidup (integritas app-level — D11). */
  async ingest(tenantId: string, input: {
    knowledgeBaseId: string; text: string; title?: string;
    sourceId?: string; metadata?: Record<string, unknown>;
    /** Delta sync: identitas + versi file di storage asal. */
    externalId?: string; externalVersion?: string;
    /** Ukuran berkas asal (byte) — kaki murah pencocokan kembar. */
    sizeBytes?: number;
    /**
     * Jalur upstream lengkap (mis. `kebijakan/2026/sop.pdf`) bila konektornya
     * memang tahu hierarkinya. Dari sinilah kolom `folder` diturunkan — bukan
     * dari `title`, yang hanya nama berkasnya.
     */
    path?: string;
  }): Promise<number> {
    const modelId = await withTenant(tenantId, async (tx) => {
      const kb = await tx.select({ id: knowledgeBases.id }).from(knowledgeBases)
        .where(and(eq(knowledgeBases.id, input.knowledgeBaseId), isNull(knowledgeBases.deletedAt))).limit(1);
      if (!kb[0]) throw new ValidationError('Knowledge base tidak ditemukan / sudah dihapus');
      const s = await tx.select().from(tenantSettings)
        .where(eq(tenantSettings.tenantId, tenantId)).limit(1);
      return s[0]?.activeEmbeddingModel ?? 'all-MiniLM-L6-v2';
    });

    /* ── PENCEGAHAN REDUNDANSI ───────────────────────────────────────
       Diletakkan DI SINI, bukan di sync, karena ini satu-satunya jalur yang
       dilewati SEMUA cara dokumen masuk: sync Drive/SharePoint, unggahan
       manual, konektor URL, dan API publik. Menaruhnya di sync berarti tiga
       jalur lain tetap bisa menyisipkan kembar.

       Dilakukan SEBELUM chunk & embed: yang mahal bukan unduhannya,
       melainkan embedding dan penyimpanan vektornya. */
    const hash = fingerprintable(input.text) ? contentFingerprint(input.text) : null;
    if (hash) {
      const kembar = await withTenant(tenantId, async (tx) => {
        const r = await tx.execute(sql`
          select doc_ref from documents
          where knowledge_base_id = ${input.knowledgeBaseId}
            and content_hash = ${hash}
            and deleted_at is null
          limit 1`);
        return (r as unknown as Array<{ doc_ref: string }>)[0]?.doc_ref ?? null;
      });
      // Kembar dengan DIRINYA SENDIRI bukan kembar: pada sync ulang / update
      // versi, berkas yang sama tentu cocok dengan barisnya sendiri.
      const diriSendiri = input.externalId ?? input.title;
      if (kembar && kembar !== diriSendiri) {
        await recordDuplicate(tenantId, {
          knowledgeBaseId: input.knowledgeBaseId, sourceId: input.sourceId,
          externalId: input.externalId, title: input.title,
          sizeBytes: input.sizeBytes, contentHash: hash,
          canonicalDocRef: kembar, reason: 'content-hash',
        });
        return 0;
      }
    }

    const chunks = chunkText(input.text);
    if (chunks.length === 0) return 0;

    /* ── KUOTA PENYIMPANAN ───────────────────────────────────────────
       Diperiksa SETELAH dedup (kembar tak boleh ikut menghabiskan jatah)
       dan SEBELUM embed (yang mahal). Dilempar sebagai QuotaError, bukan
       dicatat diam-diam: pemilik data harus tahu berkasnya tak masuk. */
    await assertChunkQuota(tenantId, chunks.length);

    const getApiKey = apiKeyResolver(tenantId);
    // JUDUL ikut di-embed (konten tersimpan tetap bersih). Tanpa ini, chunk
    // halaman tengah "RAB 2020.pdf" yang tak menyebut tahunnya mustahil
    // dibedakan dari "RAB 2021.pdf" oleh vector search — pembeda dokumennya
    // justru ada di NAMA BERKAS. Dokumen lama perlu re-ingest (sync Penuh)
    // agar kebagian; delta sync normal tak menyentuh yang tak berubah.
    const embedInput = chunks.map((c) => (input.title ? `${input.title}\n${c}` : c));
    const vectors = await embed(modelId, embedInput, { tenantId, getApiKey });
    // Dicatat per potongan, bukan disimpulkan dari nama model saat query.
    const dims = await embeddingDims(modelId);

    /* Diturunkan SEKALI, di luar perulangan potongan. Nilainya sama untuk
       seluruh potongan satu dokumen, dan menghitungnya ulang per potongan
       cuma membakar CPU pada dokumen tebal — yang justru paling banyak
       potongannya. */
    const saringExt = ekstensi(input.path ?? input.title);
    const saringFolder = folderDari(input.path);
    const saringWaktu = waktuUbah(input.externalVersion);

    const inserted = await withTenant(tenantId, (tx) =>
      docs.insertChunks(tx, chunks.map((content, i) => ({
        tenantId,
        knowledgeBaseId: input.knowledgeBaseId,
        sourceId: input.sourceId,
        title: input.title,
        content,
        embeddingModel: modelId,
        embedding: vectors[i],
        embeddingDims: dims,
        externalId: input.externalId,
        externalVersion: input.externalVersion,
        // Disimpan pada tiap potongan (nilainya sama untuk satu dokumen) —
        // pencarian kembar jadi satu kueri berindeks tanpa tabel tambahan.
        contentHash: hash,
        sizeBytes: input.sizeBytes,
        /* PENYARING (migrasi 0048). Nilainya sama untuk seluruh potongan satu
           dokumen — disimpan per potongan supaya penyaring jadi satu WHERE
           berindeks di tabel yang sama dengan vektornya, tanpa join. */
        ext: saringExt,
        folder: saringFolder,
        modifiedAt: saringWaktu,
        metadata: { ...input.metadata, chunk: i },
      }))),
    );

    // Lapisan pertama retrieval bertingkat dijaga tetap mutakhir DI SINI,
    // bukan lewat mode yang dipilih pengguna: begitu sebuah KB cukup besar
    // sehingga indeks datarnya jadi masalah, lapisan itu tumbuh sendiri.
    await maybeBuildTier1(tenantId, input.knowledgeBaseId, modelId, input);

    await dispatch('document.ingested', {
      tenantId, knowledgeBaseId: input.knowledgeBaseId,
      documentId: inserted[0]?.id ?? '', chunks: chunks.length,
    });
    return chunks.length;
  },

  async softDeleteDocument(tenantId: string, id: string) {
    const del = await withTenant(tenantId, async (tx) => {
      const del = await docs.softDelete(tx, id);
      if (!del) throw new ValidationError('Dokumen tidak ditemukan');
      return del;
    });
    /* DI LUAR transaksi. Di Vercel kolam koneksi `max: 1`; handler webhook
       membuka `withTenant` kedua, dan koneksi kedua itu menunggu yang pertama
       dilepas sementara yang pertama menunggu dispatch selesai — buntu tanpa
       ujung. Lihat catatan panjang di chatbot.service.create(). */
    await dispatch('document.deleted', {
      tenantId, knowledgeBaseId: del.knowledgeBaseId, documentId: id,
    });
    return del;
  },

  async restoreDocument(tenantId: string, id: string) {
    return withTenant(tenantId, async (tx) => {
      const res = await docs.restore(tx, id);
      if (!res) throw new ValidationError('Dokumen tidak ada di Sampah');
      return res;
    });
  },
};
