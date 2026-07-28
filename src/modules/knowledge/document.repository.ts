import { and, eq, isNull, isNotNull, desc, inArray } from 'drizzle-orm';
import { documents, type Db } from '@/modules/core/db';

export const documentRepository = {
  /**
   * Manifest delta sync: satu baris per FILE upstream (bukan per chunk) —
   * `external_id → external_version` untuk semua dokumen hidup dari source ini.
   * Dipakai sync.service untuk memutuskan file mana yang baru/berubah/hilang.
   */
  async manifestBySource(tx: Db, tenantId: string, sourceId: string): Promise<Map<string, string>> {
    const rows = await tx.selectDistinct({
      externalId: documents.externalId,
      externalVersion: documents.externalVersion,
    }).from(documents).where(and(
      eq(documents.tenantId, tenantId),
      eq(documents.sourceId, sourceId),
      isNotNull(documents.externalId),
      isNull(documents.deletedAt),
    ));

    const map = new Map<string, string>();
    for (const r of rows) if (r.externalId) map.set(r.externalId, r.externalVersion ?? '');
    return map;
  },

  /**
   * Soft-delete chunk WARISAN dari source ini — baris hasil sync pra-delta
   * (`external_id IS NULL`) yang tak bisa dipetakan ke file upstream mana pun.
   * Dipanggil sekali saat source pertama kali disinkronkan secara delta;
   * tanpa ini chunk lama akan hidup berdampingan dengan hasil ingest baru.
   */
  async softDeleteLegacyBySource(tx: Db, tenantId: string, sourceId: string) {
    const rows = await tx.update(documents)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(
        eq(documents.tenantId, tenantId),
        eq(documents.sourceId, sourceId),
        isNull(documents.externalId),
        isNull(documents.deletedAt),
      ))
      .returning({ id: documents.id });
    return rows.length;
  },

  /** Soft-delete SEMUA chunk milik file-file upstream tertentu (versi lama / terhapus). */
  async softDeleteByExternalIds(tx: Db, tenantId: string, sourceId: string, externalIds: string[]) {
    if (externalIds.length === 0) return 0;
    const rows = await tx.update(documents)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(
        eq(documents.tenantId, tenantId),
        eq(documents.sourceId, sourceId),
        inArray(documents.externalId, externalIds),
        isNull(documents.deletedAt),
      ))
      .returning({ id: documents.id });
    return rows.length;
  },

  listActive(tx: Db, tenantId: string, knowledgeBaseId: string) {
    return tx.select({
      id: documents.id, title: documents.title, embeddingModel: documents.embeddingModel,
      sourceId: documents.sourceId, metadata: documents.metadata, updatedAt: documents.updatedAt,
    }).from(documents)
      .where(and(eq(documents.tenantId, tenantId), eq(documents.knowledgeBaseId, knowledgeBaseId), isNull(documents.deletedAt)))
      .orderBy(desc(documents.updatedAt));
  },

  listTrashed(tx: Db, tenantId: string, knowledgeBaseId: string) {
    return tx.select({
      id: documents.id, title: documents.title, deletedAt: documents.deletedAt,
    }).from(documents)
      .where(and(eq(documents.tenantId, tenantId), eq(documents.knowledgeBaseId, knowledgeBaseId), isNotNull(documents.deletedAt)))
      .orderBy(desc(documents.deletedAt));
  },

  insertChunks(tx: Db, rows: Array<typeof documents.$inferInsert>) {
    return tx.insert(documents).values(rows).returning({ id: documents.id });
  },

  async softDelete(tx: Db, id: string) {
    const rows = await tx.update(documents)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(documents.id, id), isNull(documents.deletedAt)))
      .returning({ id: documents.id, knowledgeBaseId: documents.knowledgeBaseId });
    return rows[0] ?? null;
  },

  async restore(tx: Db, id: string) {
    const rows = await tx.update(documents)
      .set({ deletedAt: null, updatedAt: new Date() })
      .where(and(eq(documents.id, id), isNotNull(documents.deletedAt)))
      .returning({ id: documents.id });
    return rows[0] ?? null;
  },
};
