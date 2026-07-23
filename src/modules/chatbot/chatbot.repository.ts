import { and, eq, isNull, isNotNull, desc } from 'drizzle-orm';
import { chatbots, type Db } from '@/modules/core/db';

/**
 * Repository = satu-satunya layer yang menyentuh tabel `chatbots`.
 * Semua query aktif memfilter `deleted_at IS NULL` (Rule #3).
 * `tx` selalu datang dari withTenant() — RLS aktif.
 */
export const chatbotRepository = {
  listActive(tx: Db, tenantId: string) {
    return tx.select().from(chatbots)
      .where(and(eq(chatbots.tenantId, tenantId), isNull(chatbots.deletedAt)))
      .orderBy(desc(chatbots.createdAt));
  },

  listTrashed(tx: Db, tenantId: string) {
    return tx.select().from(chatbots)
      .where(and(eq(chatbots.tenantId, tenantId), isNotNull(chatbots.deletedAt)))
      .orderBy(desc(chatbots.deletedAt));
  },

  async findById(tx: Db, id: string, opts: { withTrashed?: boolean } = {}) {
    const cond = opts.withTrashed
      ? eq(chatbots.id, id)
      : and(eq(chatbots.id, id), isNull(chatbots.deletedAt));
    const rows = await tx.select().from(chatbots).where(cond).limit(1);
    return rows[0] ?? null;
  },

  async create(tx: Db, values: typeof chatbots.$inferInsert) {
    const rows = await tx.insert(chatbots).values(values).returning();
    return rows[0];
  },

  async update(tx: Db, id: string, values: Partial<typeof chatbots.$inferInsert>) {
    const rows = await tx.update(chatbots)
      .set({ ...values, updatedAt: new Date() })
      .where(and(eq(chatbots.id, id), isNull(chatbots.deletedAt)))
      .returning();
    return rows[0] ?? null;
  },

  /** Soft delete — set deleted_at, JANGAN hapus baris (Rule #3). */
  async softDelete(tx: Db, id: string) {
    const rows = await tx.update(chatbots)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(chatbots.id, id), isNull(chatbots.deletedAt)))
      .returning();
    return rows[0] ?? null;
  },

  async restore(tx: Db, id: string) {
    const rows = await tx.update(chatbots)
      .set({ deletedAt: null, updatedAt: new Date() })
      .where(and(eq(chatbots.id, id), isNotNull(chatbots.deletedAt)))
      .returning();
    return rows[0] ?? null;
  },
};
