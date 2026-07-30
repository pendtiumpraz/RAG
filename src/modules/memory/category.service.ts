import { and, eq, isNull, asc, sql } from 'drizzle-orm';
import { documentCategories, memoryNotes } from '@/modules/core/db';
import { withTenant } from '@/modules/core/db/tenant-context';
import { ValidationError } from '@/modules/chatbot/chatbot.service';
import {
  DEFAULT_CATEGORIES, FALLBACK_SLUG, FALLBACK_LABEL, categorySlug, markerForSlot,
  namaTerlaluSamar, VISUAL_SLOTS,
} from './categories';

export interface CategoryRow {
  id: string; slug: string; label: string; slot: number;
  status: 'active' | 'proposed'; origin: 'seed' | 'user' | 'agent';
  color: string; shape: string; notes: number;
}

/** Slot bebas terkecil. Slot yang ditinggalkan kategori terhapus DIPAKAI ULANG
 *  supaya penanda visual tak habis hanya karena banyak coba-hapus. */
async function nextSlot(tx: Parameters<Parameters<typeof withTenant>[1]>[0], tenantId: string): Promise<number> {
  const rows = await tx.select({ slot: documentCategories.slot }).from(documentCategories)
    .where(and(eq(documentCategories.tenantId, tenantId), isNull(documentCategories.deletedAt)));
  const dipakai = new Set(rows.map((r) => r.slot));
  for (let i = 0; i < 1000; i++) if (!dipakai.has(i)) return i;
  return VISUAL_SLOTS;
}

export const categoryService = {
  /**
   * Pastikan tenant punya taksonomi awal, dan tenant lama ikut kebagian
   * kategori bawaan yang ditambahkan belakangan.
   *
   * Pemeriksaan sengaja MENGABAIKAN `deleted_at`: kategori yang sudah sengaja
   * dihapus pengguna tak boleh hidup lagi tiap halaman dibuka — pola yang sama
   * dengan seeding backlog. Yang disisipkan hanya slug yang BELUM PERNAH ada.
   */
  async ensureSeeded(tenantId: string): Promise<void> {
    await withTenant(tenantId, async (tx) => {
      const ada = await tx.select({
        slug: documentCategories.slug, slot: documentCategories.slot,
      }).from(documentCategories).where(eq(documentCategories.tenantId, tenantId));

      const dikenal = new Set(ada.map((r) => r.slug));
      const terpakai = new Set(ada.map((r) => r.slot));
      // Penampung selalu ikut disemai — ia tujuan pindah bagi dokumen yang
      // penilaiannya gagal, jadi ketiadaannya bukan pilihan pengguna.
      const wajib = [...DEFAULT_CATEGORIES, { slug: FALLBACK_SLUG, label: FALLBACK_LABEL }];
      const kurang = wajib.filter((c) => !dikenal.has(c.slug));
      if (!kurang.length) return;

      let slot = 0;
      const slotBerikut = () => { while (terpakai.has(slot)) slot++; terpakai.add(slot); return slot; };

      await tx.insert(documentCategories).values(
        kurang.map((c) => ({
          tenantId, slug: c.slug, label: c.label, slot: slotBerikut(),
          status: 'active' as const, origin: 'seed' as const,
        })),
      ).onConflictDoNothing();
    });
  },

  async list(tenantId: string): Promise<CategoryRow[]> {
    await this.ensureSeeded(tenantId);
    const rows = await withTenant(tenantId, (tx) => tx.select({
      id: documentCategories.id, slug: documentCategories.slug,
      label: documentCategories.label, slot: documentCategories.slot,
      status: documentCategories.status, origin: documentCategories.origin,
      /* Referensi kolom luar ditulis LITERAL — interpolasi drizzle merender
         `"slug"` telanjang yang di dalam subquery tertangkap ke tabel
         subquery sendiri (jebakan yang sudah pernah jadi bug produksi). */
      notes: sql<number>`(select count(*)::int from memory_notes m
        where m.category = document_categories.slug and m.deleted_at is null)`,
    }).from(documentCategories)
      .where(and(eq(documentCategories.tenantId, tenantId), isNull(documentCategories.deletedAt)))
      .orderBy(asc(documentCategories.slot)));

    return rows.map((r) => ({
      ...r,
      status: r.status as CategoryRow['status'],
      origin: r.origin as CategoryRow['origin'],
      ...markerForSlot(r.slot),
    }));
  },

  /** Slug kategori AKTIF — dipakai agen untuk menyusun prompt. */
  async activeSlugs(tenantId: string): Promise<Array<{ slug: string; label: string }>> {
    await this.ensureSeeded(tenantId);
    return withTenant(tenantId, (tx) => tx.select({
      slug: documentCategories.slug, label: documentCategories.label,
    }).from(documentCategories).where(and(
      eq(documentCategories.tenantId, tenantId),
      eq(documentCategories.status, 'active'),
      isNull(documentCategories.deletedAt),
    )).orderBy(asc(documentCategories.slot)));
  },

  async create(tenantId: string, input: { label: string; status?: 'active' | 'proposed'; origin?: 'user' | 'agent' }) {
    const label = input.label?.trim();
    if (!label) throw new ValidationError('Nama kategori wajib diisi');
    const slug = categorySlug(label);
    return withTenant(tenantId, async (tx) => {
      const bentrok = await tx.select({ id: documentCategories.id }).from(documentCategories)
        .where(and(eq(documentCategories.tenantId, tenantId), eq(documentCategories.slug, slug),
          isNull(documentCategories.deletedAt))).limit(1);
      if (bentrok[0]) throw new ValidationError(`Kategori "${label}" sudah ada`);
      const rows = await tx.insert(documentCategories).values({
        tenantId, slug, label, slot: await nextSlot(tx, tenantId),
        status: input.status ?? 'active', origin: input.origin ?? 'user',
      }).returning();
      return rows[0];
    });
  },

  /**
   * Usulan dari agen Memory. TIDAK melempar galat: kegagalan mencatat usulan
   * tak boleh menggagalkan pipeline yang sudah membakar token LLM.
   * Mengembalikan slug yang benar-benar boleh dipakai note itu.
   */
  async propose(tenantId: string, label: string): Promise<string> {
    try {
      // Nama samar ("lain", "umum", "dokumen") ditolak sebelum menyentuh DB.
      // Menerimanya akan mengembalikan persis masalah yang dihapus migrasi
      // 0034: kelompok bernama samar yang tak memberi tahu apa pun.
      if (namaTerlaluSamar(label)) return FALLBACK_SLUG;
      const slug = categorySlug(label);
      const ada = await withTenant(tenantId, (tx) => tx.select({
        slug: documentCategories.slug, status: documentCategories.status,
      }).from(documentCategories).where(and(
        eq(documentCategories.tenantId, tenantId), eq(documentCategories.slug, slug),
        isNull(documentCategories.deletedAt),
      )).limit(1));
      if (ada[0]) return ada[0].status === 'active' ? ada[0].slug : FALLBACK_SLUG;
      await this.create(tenantId, { label, status: 'proposed', origin: 'agent' });
    } catch (err) {
      console.error('[kategori] gagal mencatat usulan agen:', err);
    }
    // Sampai disetujui manusia, dokumennya masuk penampung — BUKAN kategori
    // usulan. Kalau usulan langsung dipakai, menolaknya nanti berarti ribuan
    // note menunjuk kategori yang tak ada.
    return FALLBACK_SLUG;
  },

  async approve(tenantId: string, id: string) {
    return withTenant(tenantId, async (tx) => {
      const rows = await tx.update(documentCategories)
        .set({ status: 'active', updatedAt: new Date() })
        .where(and(eq(documentCategories.id, id), isNull(documentCategories.deletedAt)))
        .returning();
      if (!rows[0]) throw new ValidationError('Kategori tidak ditemukan');
      return rows[0];
    });
  },

  async rename(tenantId: string, id: string, label: string) {
    const bersih = label?.trim();
    if (!bersih) throw new ValidationError('Nama kategori wajib diisi');
    return withTenant(tenantId, async (tx) => {
      // SLUG TIDAK IKUT BERUBAH. Ia adalah kunci yang sudah tertulis di ribuan
      // baris memory_notes; mengubahnya saat ganti nama akan memutuskan
      // semuanya sekaligus, diam-diam.
      const rows = await tx.update(documentCategories)
        .set({ label: bersih, updatedAt: new Date() })
        .where(and(eq(documentCategories.id, id), isNull(documentCategories.deletedAt)))
        .returning();
      if (!rows[0]) throw new ValidationError('Kategori tidak ditemukan');
      return rows[0];
    });
  },

  /** Soft delete + pindahkan note-nya ke penampung (integritas app-level). */
  async remove(tenantId: string, id: string) {
    return withTenant(tenantId, async (tx) => {
      const row = (await tx.select().from(documentCategories)
        .where(and(eq(documentCategories.id, id), isNull(documentCategories.deletedAt))).limit(1))[0];
      if (!row) throw new ValidationError('Kategori tidak ditemukan');
      if (row.slug === FALLBACK_SLUG) throw new ValidationError('Kategori penampung tak bisa dihapus');
      const now = new Date();
      await tx.update(documentCategories).set({ deletedAt: now, updatedAt: now })
        .where(eq(documentCategories.id, id));
      // Note yang menunjuk kategori terhapus akan tak berwarna dan tak
      // tersaring — dipindahkan, bukan dibiarkan menggantung.
      await tx.update(memoryNotes).set({ category: FALLBACK_SLUG, updatedAt: now })
        .where(and(eq(memoryNotes.tenantId, tenantId), eq(memoryNotes.category, row.slug)));
      return row;
    });
  },
};
