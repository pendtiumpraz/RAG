import { and, asc, eq, isNull, isNotNull, sql } from 'drizzle-orm';
import { divisions, users, chatbots, type Db } from '@/modules/core/db';
import { withTenant } from '@/modules/core/db/tenant-context';
import { ValidationError } from '@/modules/chatbot/chatbot.service';
import type { AktorDivisi } from '@/modules/chatbot/divisi';
import type { CurrentUser } from '@/modules/core/auth';

/**
 * DIVISI — pembatasan chatbot di dalam satu tenant (migrasi 0040).
 *
 * Aturan aksesnya sendiri ada di `chatbot/divisi.ts` (murni, teruji tanpa
 * basis data); berkas ini hanya mengurus penyimpanan dan keanggotaan.
 */

const divisionRepository = {
  listActive(tx: Db, tenantId: string) {
    return tx.select().from(divisions)
      .where(and(eq(divisions.tenantId, tenantId), isNull(divisions.deletedAt)))
      .orderBy(asc(divisions.name));
  },

  listTrashed(tx: Db, tenantId: string) {
    return tx.select().from(divisions)
      .where(and(eq(divisions.tenantId, tenantId), isNotNull(divisions.deletedAt)))
      .orderBy(asc(divisions.name));
  },

  async findById(tx: Db, id: string, opts: { withTrashed?: boolean } = {}) {
    const cond = opts.withTrashed
      ? eq(divisions.id, id)
      : and(eq(divisions.id, id), isNull(divisions.deletedAt));
    const rows = await tx.select().from(divisions).where(cond).limit(1);
    return rows[0] ?? null;
  },
};

/**
 * Nama divisi dibandingkan TANPA memandang besar-kecil huruf, sama seperti
 * indeks uniknya di migrasi 0040. Kalau di sini peka huruf dan di sana tidak,
 * penolakannya datang sebagai galat basis data mentah, bukan sebagai pesan
 * yang bisa dibaca orang.
 */
async function namaTerpakai(tx: Db, tenantId: string, nama: string, kecuali?: string) {
  const rows = await tx.select({ id: divisions.id }).from(divisions)
    .where(and(
      eq(divisions.tenantId, tenantId),
      isNull(divisions.deletedAt),
      sql`lower(${divisions.name}) = lower(${nama})`,
    ));
  return rows.some((r) => r.id !== kecuali);
}

export const divisionService = {
  /**
   * Divisi aktor untuk permintaan ini — DIBACA DARI BASIS DATA, bukan dari
   * token sesi.
   *
   * Menaruhnya di JWT akan menghemat satu query dan membuka lubang yang
   * jauh lebih mahal: token berumur panjang, jadi orang yang dipindahkan ke
   * divisi lain — atau dikeluarkan dari divisinya karena suatu alasan —
   * tetap memegang akses lamanya sampai ia sendiri memutuskan untuk keluar
   * dan masuk lagi. Pencabutan izin yang baru berlaku "nanti" bukan
   * pencabutan izin.
   */
  async aktor(user: CurrentUser): Promise<AktorDivisi> {
    const rows = await withTenant(user.tenantId, (tx) => tx
      .select({ divisionId: users.divisionId }).from(users)
      .where(and(eq(users.id, user.id), isNull(users.deletedAt))).limit(1));
    return { role: user.role, divisionId: rows[0]?.divisionId ?? null };
  },

  /** Daftar divisi + jumlah anggota & chatbot — angka itu yang membuat halamannya berguna. */
  list(tenantId: string) {
    return withTenant(tenantId, async (tx) => {
      const rows = await divisionRepository.listActive(tx, tenantId);
      const anggota = await tx.select({ divisionId: users.divisionId, n: sql<number>`count(*)::int` })
        .from(users).where(and(eq(users.tenantId, tenantId), isNull(users.deletedAt)))
        .groupBy(users.divisionId);
      const bot = await tx.select({ divisionId: chatbots.divisionId, n: sql<number>`count(*)::int` })
        .from(chatbots).where(and(eq(chatbots.tenantId, tenantId), isNull(chatbots.deletedAt)))
        .groupBy(chatbots.divisionId);
      const peta = (xs: Array<{ divisionId: string | null; n: number }>) =>
        new Map(xs.filter((x) => x.divisionId).map((x) => [x.divisionId!, Number(x.n)]));
      const pa = peta(anggota); const pb = peta(bot);
      return rows.map((d) => ({ ...d, anggota: pa.get(d.id) ?? 0, chatbot: pb.get(d.id) ?? 0 }));
    });
  },

  listTrashed(tenantId: string) {
    return withTenant(tenantId, (tx) => divisionRepository.listTrashed(tx, tenantId));
  },

  async create(tenantId: string, input: { name: string; description?: string | null }) {
    const nama = input.name.trim();
    if (!nama) throw new ValidationError('Nama divisi tidak boleh kosong');
    return withTenant(tenantId, async (tx) => {
      if (await namaTerpakai(tx, tenantId, nama)) {
        throw new ValidationError(`Divisi "${nama}" sudah ada`);
      }
      const rows = await tx.insert(divisions).values({
        tenantId, name: nama, description: input.description?.trim() || null,
      }).returning();
      return rows[0];
    });
  },

  async update(tenantId: string, id: string, input: { name?: string; description?: string | null }) {
    return withTenant(tenantId, async (tx) => {
      const nama = input.name?.trim();
      if (input.name !== undefined && !nama) throw new ValidationError('Nama divisi tidak boleh kosong');
      if (nama && await namaTerpakai(tx, tenantId, nama, id)) {
        throw new ValidationError(`Divisi "${nama}" sudah ada`);
      }
      const rows = await tx.update(divisions)
        .set({
          ...(nama ? { name: nama } : {}),
          ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(divisions.id, id), isNull(divisions.deletedAt))).returning();
      if (!rows[0]) throw new ValidationError('Divisi tidak ditemukan');
      return rows[0];
    });
  },

  /**
   * Soft delete + INTEGRITAS REFERENSIAL DI SERVICE (konsekuensi Rule #2).
   *
   * Anggota dan chatbot divisi ini dilepas jadi tanpa divisi, BUKAN dibiarkan
   * menunjuk baris yang sudah terhapus. Kalau dibiarkan, chatbotnya menjadi
   * tak terlihat oleh siapa pun kecuali admin — hilang tanpa pernah dihapus,
   * dan tak ada satu pun layar yang menjelaskan ke mana perginya.
   */
  async softDelete(tenantId: string, id: string) {
    return withTenant(tenantId, async (tx) => {
      const now = new Date();
      const rows = await tx.update(divisions).set({ deletedAt: now, updatedAt: now })
        .where(and(eq(divisions.id, id), isNull(divisions.deletedAt))).returning();
      if (!rows[0]) throw new ValidationError('Divisi tidak ditemukan');
      await tx.update(users).set({ divisionId: null, updatedAt: now })
        .where(and(eq(users.tenantId, tenantId), eq(users.divisionId, id)));
      await tx.update(chatbots).set({ divisionId: null, updatedAt: now })
        .where(and(eq(chatbots.tenantId, tenantId), eq(chatbots.divisionId, id)));
      return rows[0];
    });
  },

  /**
   * Pulihkan divisinya saja. Keanggotaan TIDAK ikut pulih, dan itu disengaja:
   * begitu dilepas, orang & chatbot bisa saja sudah dipindahkan ke divisi
   * lain. Mengembalikannya berdasarkan keadaan lama akan mencabut penempatan
   * yang dibuat sesudahnya — memulihkan satu baris sambil merusak yang lain.
   */
  async restore(tenantId: string, id: string) {
    return withTenant(tenantId, async (tx) => {
      const rows = await tx.update(divisions).set({ deletedAt: null, updatedAt: new Date() })
        .where(and(eq(divisions.id, id), isNotNull(divisions.deletedAt))).returning();
      if (!rows[0]) throw new ValidationError('Divisi tidak ada di Sampah');
      return rows[0];
    });
  },

  /** Tempatkan anggota di sebuah divisi (atau lepaskan dengan null). */
  async tempatkan(tenantId: string, userId: string, divisionId: string | null) {
    return withTenant(tenantId, async (tx) => {
      if (divisionId) {
        const d = await divisionRepository.findById(tx, divisionId);
        if (!d) throw new ValidationError('Divisi tidak ditemukan');
      }
      const rows = await tx.update(users).set({ divisionId, updatedAt: new Date() })
        .where(and(eq(users.id, userId), eq(users.tenantId, tenantId), isNull(users.deletedAt)))
        .returning({ id: users.id, divisionId: users.divisionId });
      if (!rows[0]) throw new ValidationError('Anggota tidak ditemukan');
      return rows[0];
    });
  },
};
