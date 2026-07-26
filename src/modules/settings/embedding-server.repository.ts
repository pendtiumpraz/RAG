import { and, eq, isNull, isNotNull, desc } from 'drizzle-orm';
import { db, embeddingServers } from '@/modules/core/db';

/**
 * Repository tabel `embedding_servers`.
 *
 * CATATAN PENTING: tabel ini PLATFORM-level (tanpa `tenant_id`, tanpa RLS),
 * jadi query di sini memakai `db` langsung — BUKAN `withTenant()` seperti
 * repository lain. Karena RLS tidak menjaganya, pemanggil WAJIB sudah lolos
 * `requireRole('superadmin')`.
 *
 * Rule #3 tetap berlaku: tak ada hard delete, semua query aktif memfilter
 * `deleted_at IS NULL`.
 */
export const embeddingServerRepository = {
  listActive() {
    return db.select().from(embeddingServers)
      .where(isNull(embeddingServers.deletedAt))
      .orderBy(desc(embeddingServers.createdAt));
  },

  listTrashed() {
    return db.select().from(embeddingServers)
      .where(isNotNull(embeddingServers.deletedAt))
      .orderBy(desc(embeddingServers.deletedAt));
  },

  /** Hanya server yang hidup DAN aktif — dipakai saat menyusun katalog model. */
  listEnabled() {
    return db.select().from(embeddingServers)
      .where(and(isNull(embeddingServers.deletedAt), eq(embeddingServers.enabled, true)))
      .orderBy(desc(embeddingServers.createdAt));
  },

  async findById(id: string, opts: { withTrashed?: boolean } = {}) {
    const cond = opts.withTrashed
      ? eq(embeddingServers.id, id)
      : and(eq(embeddingServers.id, id), isNull(embeddingServers.deletedAt));
    const rows = await db.select().from(embeddingServers).where(cond).limit(1);
    return rows[0] ?? null;
  },

  async findByBaseUrl(baseUrl: string) {
    const rows = await db.select().from(embeddingServers)
      .where(and(eq(embeddingServers.baseUrl, baseUrl), isNull(embeddingServers.deletedAt)))
      .limit(1);
    return rows[0] ?? null;
  },

  async create(values: typeof embeddingServers.$inferInsert) {
    const rows = await db.insert(embeddingServers).values(values).returning();
    return rows[0];
  },

  async update(id: string, values: Partial<typeof embeddingServers.$inferInsert>) {
    const rows = await db.update(embeddingServers)
      .set({ ...values, updatedAt: new Date() })
      .where(and(eq(embeddingServers.id, id), isNull(embeddingServers.deletedAt)))
      .returning();
    return rows[0] ?? null;
  },

  async softDelete(id: string) {
    const rows = await db.update(embeddingServers)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(embeddingServers.id, id), isNull(embeddingServers.deletedAt)))
      .returning();
    return rows[0] ?? null;
  },

  async restore(id: string) {
    const rows = await db.update(embeddingServers)
      .set({ deletedAt: null, updatedAt: new Date() })
      .where(and(eq(embeddingServers.id, id), isNotNull(embeddingServers.deletedAt)))
      .returning();
    return rows[0] ?? null;
  },
};
