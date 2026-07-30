import { eq, and, isNull, sql } from 'drizzle-orm';
import { tenantSettings, knowledgeBases, documentDuplicates } from '@/modules/core/db';
import { withTenant } from '@/modules/core/db/tenant-context';
import { dispatch } from '@/modules/core/events';
import { apiKeyResolver } from '@/modules/settings/credentials.repository';
import { embed, embeddingDims } from './embeddings';
import { documentRepository as docs } from './document.repository';
import { ValidationError } from '@/modules/chatbot/chatbot.service';
import { documentVectorsService } from './document-vectors.service';
import { contentFingerprint, fingerprintable, nameSizeKey } from './dedupe';

/** Chunker naif tapi solid: ~800 char, overlap ~120, pecah di batas kalimat. */
export function chunkText(text: string, size = 800, overlap = 120): string[] {
  const clean = text.replace(/\r\n/g, '\n').trim();
  if (clean.length <= size) return clean ? [clean] : [];
  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + size, clean.length);
    const slice = clean.slice(start, end);
    const brk = Math.max(slice.lastIndexOf('\n\n'), slice.lastIndexOf('. '));
    if (brk > size * 0.5 && end < clean.length) end = start + brk + 1;
    chunks.push(clean.slice(start, end).trim());
    // Chunk terakhir sudah menyentuh ujung teks → SELESAI. Tanpa break ini,
    // `start = end - overlap` mundur ke posisi yang sama dan loop berputar
    // selamanya untuk SEMUA teks > `size` — heap penuh potongan 120 karakter
    // yang identik (4GB lalu OOM; di lambda: mati sunyi, sync macet
    // 'syncing'). Tak pernah ketahuan karena semua uji memakai teks pendek.
    if (end >= clean.length) break;
    start = end - overlap;
  }
  return chunks.filter(Boolean);
}


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

export const knowledgeService = {
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
    return withTenant(tenantId, async (tx) => {
      const del = await docs.softDelete(tx, id);
      if (!del) throw new ValidationError('Dokumen tidak ditemukan');
      await dispatch('document.deleted', { tenantId, knowledgeBaseId: del.knowledgeBaseId, documentId: id });
      return del;
    });
  },

  async restoreDocument(tenantId: string, id: string) {
    return withTenant(tenantId, async (tx) => {
      const res = await docs.restore(tx, id);
      if (!res) throw new ValidationError('Dokumen tidak ada di Sampah');
      return res;
    });
  },
};
