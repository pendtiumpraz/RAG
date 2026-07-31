import { and, eq, isNull, isNotNull, or, desc, type SQL } from 'drizzle-orm';
import { chatbots, type Db } from '@/modules/core/db';
import { lintasDivisi, type AktorDivisi } from './divisi';

/**
 * Klausa penyaring divisi — dipasang di WHERE, bukan disaring di memori.
 *
 * Bedanya menentukan: menyaring setelah query berjalan berarti barisnya
 * sempat keluar dari basis data, dan setiap penghitungan, ekspor, atau
 * paginasi yang lupa memakai hasil saringannya akan membocorkan yang sama.
 * Di WHERE, kebocoran itu tak punya jalan.
 *
 * `undefined` untuk peran lintas divisi — and() mengabaikannya, jadi tak ada
 * klausa yang perlu dinegasikan belakangan.
 */
export function klausaDivisi(aktor: AktorDivisi): SQL | undefined {
  if (lintasDivisi(aktor)) return undefined;
  // Chatbot tanpa divisi = tak dibatasi; sisanya harus cocok persis.
  return aktor.divisionId === null
    ? isNull(chatbots.divisionId)
    : or(isNull(chatbots.divisionId), eq(chatbots.divisionId, aktor.divisionId));
}

/**
 * Repository = satu-satunya layer yang menyentuh tabel `chatbots`.
 * Semua query aktif memfilter `deleted_at IS NULL` (Rule #3).
 * `tx` selalu datang dari withTenant() — RLS aktif.
 *
 * `aktor` WAJIB pada setiap pembacaan daftar, dan itu disengaja: parameter
 * opsional dengan bawaan "lihat semua" berarti setiap pemanggil baru yang
 * lupa mengisinya diam-diam menembus pembatasan divisi, tanpa satu pun galat
 * kompilasi. Yang wajib memaksa penulisnya memutuskan.
 */
export const chatbotRepository = {
  listActive(tx: Db, tenantId: string, aktor: AktorDivisi) {
    return tx.select().from(chatbots)
      .where(and(eq(chatbots.tenantId, tenantId), isNull(chatbots.deletedAt), klausaDivisi(aktor)))
      .orderBy(desc(chatbots.createdAt));
  },

  listTrashed(tx: Db, tenantId: string, aktor: AktorDivisi) {
    return tx.select().from(chatbots)
      .where(and(eq(chatbots.tenantId, tenantId), isNotNull(chatbots.deletedAt), klausaDivisi(aktor)))
      .orderBy(desc(chatbots.deletedAt));
  },

  /**
   * Jumlah chatbot aktif SE-TENANT — sengaja mengabaikan divisi.
   *
   * Dipakai menegakkan batas paket. Menghitungnya lewat daftar yang sudah
   * tersaring divisi akan membuat setiap divisi punya jatah penuh sendiri:
   * tenant paket gratis dengan lima divisi diam-diam mendapat lima kali
   * batasnya. Batas paket milik TENANT, bukan milik divisi.
   */
  async countActive(tx: Db, tenantId: string) {
    const rows = await tx.select({ id: chatbots.id }).from(chatbots)
      .where(and(eq(chatbots.tenantId, tenantId), isNull(chatbots.deletedAt)));
    return rows.length;
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
