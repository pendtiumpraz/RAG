import { eq, and, isNull } from 'drizzle-orm';
import { tenantSettings, knowledgeBases } from '@/modules/core/db';
import { withTenant } from '@/modules/core/db/tenant-context';
import { dispatch } from '@/modules/core/events';
import { apiKeyResolver } from '@/modules/settings/credentials.repository';
import { embed, embeddingDims } from './embeddings';
import { documentRepository as docs } from './document.repository';
import { ValidationError } from '@/modules/chatbot/chatbot.service';

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

export const knowledgeService = {
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
  }): Promise<number> {
    const modelId = await withTenant(tenantId, async (tx) => {
      const kb = await tx.select({ id: knowledgeBases.id }).from(knowledgeBases)
        .where(and(eq(knowledgeBases.id, input.knowledgeBaseId), isNull(knowledgeBases.deletedAt))).limit(1);
      if (!kb[0]) throw new ValidationError('Knowledge base tidak ditemukan / sudah dihapus');
      const s = await tx.select().from(tenantSettings)
        .where(eq(tenantSettings.tenantId, tenantId)).limit(1);
      return s[0]?.activeEmbeddingModel ?? 'all-MiniLM-L6-v2';
    });

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
    // Dicatat per potongan, bukan disimpulkan dari nama model saat query —
    //     lihat catatan di kolomnya.
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
        metadata: { ...input.metadata, chunk: i },
      }))),
    );

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
