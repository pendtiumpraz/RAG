import { eq, and, isNull } from 'drizzle-orm';
import { tenantSettings, chatbots } from '@/modules/core/db';
import { withTenant } from '@/modules/core/db/tenant-context';
import { dispatch } from '@/modules/core/events';
import { apiKeyResolver } from '@/modules/settings/credentials.repository';
import { embed } from './embeddings';
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
  listDocuments(tenantId: string, chatbotId: string) {
    return withTenant(tenantId, (tx) => docs.listActive(tx, tenantId, chatbotId));
  },

  listTrashed(tenantId: string, chatbotId: string) {
    return withTenant(tenantId, (tx) => docs.listTrashed(tx, tenantId, chatbotId));
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

  /** Chunk → embed → simpan. Validasi chatbot hidup (integritas app-level). */
  async ingest(tenantId: string, input: {
    chatbotId: string; text: string; title?: string;
    sourceId?: string; metadata?: Record<string, unknown>;
    /** Delta sync: identitas + versi file di storage asal. */
    externalId?: string; externalVersion?: string;
  }): Promise<number> {
    const modelId = await withTenant(tenantId, async (tx) => {
      const bot = await tx.select({ id: chatbots.id }).from(chatbots)
        .where(and(eq(chatbots.id, input.chatbotId), isNull(chatbots.deletedAt))).limit(1);
      if (!bot[0]) throw new ValidationError('Chatbot tidak ditemukan / sudah dihapus');
      const s = await tx.select().from(tenantSettings)
        .where(eq(tenantSettings.tenantId, tenantId)).limit(1);
      return s[0]?.activeEmbeddingModel ?? 'all-MiniLM-L6-v2';
    });

    const chunks = chunkText(input.text);
    if (chunks.length === 0) return 0;

    const getApiKey = apiKeyResolver(tenantId);
    const vectors = await embed(modelId, chunks, { tenantId, getApiKey });

    const inserted = await withTenant(tenantId, (tx) =>
      docs.insertChunks(tx, chunks.map((content, i) => ({
        tenantId,
        chatbotId: input.chatbotId,
        sourceId: input.sourceId,
        title: input.title,
        content,
        embeddingModel: modelId,
        embedding: vectors[i],
        externalId: input.externalId,
        externalVersion: input.externalVersion,
        metadata: { ...input.metadata, chunk: i },
      }))),
    );

    await dispatch('document.ingested', {
      tenantId, chatbotId: input.chatbotId,
      documentId: inserted[0]?.id ?? '', chunks: chunks.length,
    });
    return chunks.length;
  },

  async softDeleteDocument(tenantId: string, id: string) {
    return withTenant(tenantId, async (tx) => {
      const del = await docs.softDelete(tx, id);
      if (!del) throw new ValidationError('Dokumen tidak ditemukan');
      await dispatch('document.deleted', { tenantId, chatbotId: del.chatbotId, documentId: id });
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
