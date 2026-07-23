import { and, eq, isNull, isNotNull, desc } from 'drizzle-orm';
import { documents, type Db } from '@/modules/core/db';

export const documentRepository = {
  listActive(tx: Db, tenantId: string, chatbotId: string) {
    return tx.select({
      id: documents.id, title: documents.title, embeddingModel: documents.embeddingModel,
      sourceId: documents.sourceId, metadata: documents.metadata, updatedAt: documents.updatedAt,
    }).from(documents)
      .where(and(eq(documents.tenantId, tenantId), eq(documents.chatbotId, chatbotId), isNull(documents.deletedAt)))
      .orderBy(desc(documents.updatedAt));
  },

  listTrashed(tx: Db, tenantId: string, chatbotId: string) {
    return tx.select({
      id: documents.id, title: documents.title, deletedAt: documents.deletedAt,
    }).from(documents)
      .where(and(eq(documents.tenantId, tenantId), eq(documents.chatbotId, chatbotId), isNotNull(documents.deletedAt)))
      .orderBy(desc(documents.deletedAt));
  },

  insertChunks(tx: Db, rows: Array<typeof documents.$inferInsert>) {
    return tx.insert(documents).values(rows).returning({ id: documents.id });
  },

  async softDelete(tx: Db, id: string) {
    const rows = await tx.update(documents)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(documents.id, id), isNull(documents.deletedAt)))
      .returning({ id: documents.id, chatbotId: documents.chatbotId });
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
