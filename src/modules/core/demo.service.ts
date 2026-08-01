import { and, eq, gte, isNull, sql } from 'drizzle-orm';
import { db, conversations, messages, platformSettings } from './db';
import { withTenant } from './db/tenant-context';
import { putusanDemo, type PutusanDemo } from './demo';

/**
 * DEMO PUBLIK — pembacaan keadaan dan penegakan remnya.
 *
 * Aturannya murni di `demo.ts`; berkas ini yang menghitung pemakaian dan
 * membaca pengaturannya.
 */

/**
 * Pemakaian di-cache singkat.
 *
 * Tanpa cache, tiap permintaan demo menjalankan satu COUNT — dan demo yang
 * ramai justru saat produknya sedang dipamerkan. Setengah menit cukup pendek
 * untuk menjaga rem tetap berarti (paling banter beberapa pesan lewat di atas
 * batas) dan cukup panjang untuk membuat COUNT-nya tak terasa.
 */
const UMUR_CACHE_MS = 30_000;
let cache: { pada: number; terpakai: number; kunci: string } | null = null;

export interface PengaturanDemo {
  chatbotId: string | null;
  batas: number;
}

export const demoService = {
  async pengaturan(): Promise<PengaturanDemo> {
    const rows = await db.select({
      chatbotId: platformSettings.demoChatbotId,
      batas: platformSettings.demoLimitPerMonth,
    }).from(platformSettings).limit(1);
    return {
      chatbotId: rows[0]?.chatbotId ?? null,
      /* Bawaan 1.000 diulang di sini, bukan diandalkan dari kolom: baris
         platform_settings yang lahir sebelum migrasi 0044 punya NULL, dan
         NULL yang diperlakukan sebagai "tanpa batas" adalah kebalikan persis
         dari rem yang diminta. */
      batas: rows[0]?.batas ?? 1000,
    };
  },

  /**
   * Berapa pesan pengunjung yang sudah dilayani demo bulan ini.
   *
   * Dihitung dari tabel `messages`, bukan dari penghitung terpisah. Penghitung
   * bisa menyimpang — dari percakapan yang dihapus, dari migrasi, dari galat
   * di tengah giliran — dan penghitung yang menyimpang pada REM berarti
   * remnya berhenti mengerem tanpa ada yang tahu. COUNT selalu benar; yang
   * dibayar cuma kecepatannya, dan itu ditebus cache pendek.
   *
   * Hanya pesan `user` yang dihitung: satu giliran menghasilkan dua baris
   * (pertanyaan + jawaban), dan menghitung keduanya membuat batas 1.000
   * diam-diam jadi 500.
   */
  async terpakai(chatbotId: string, tenantId: string, saat = new Date()): Promise<number> {
    const kunci = `${chatbotId}:${saat.getUTCFullYear()}-${saat.getUTCMonth()}`;
    if (cache && cache.kunci === kunci && Date.now() - cache.pada < UMUR_CACHE_MS) {
      return cache.terpakai;
    }
    const awal = new Date(Date.UTC(saat.getUTCFullYear(), saat.getUTCMonth(), 1));
    const rows = await withTenant(tenantId, (tx) => tx
      .select({ n: sql<number>`count(${messages.id})::int` })
      .from(messages)
      .innerJoin(conversations, eq(conversations.id, messages.conversationId))
      .where(and(
        eq(conversations.chatbotId, chatbotId),
        eq(messages.role, 'user'),
        gte(messages.createdAt, awal),
        isNull(messages.deletedAt),
      )));
    const n = Number(rows[0]?.n ?? 0);
    cache = { pada: Date.now(), terpakai: n, kunci };
    return n;
  },

  /**
   * Apakah chatbot ini demo publik, dan bolehkah ia melayani sekarang.
   *
   * Mengembalikan `null` bila chatbot yang diminta BUKAN demo — jalur chat
   * biasa tak boleh membayar apa pun untuk fitur yang tak menyentuhnya.
   */
  async putusan(chatbotId: string, tenantId: string): Promise<PutusanDemo | null> {
    const p = await this.pengaturan();
    if (!p.chatbotId || p.chatbotId !== chatbotId) return null;
    const terpakai = await this.terpakai(chatbotId, tenantId);
    return putusanDemo({ chatbotId: p.chatbotId, terpakai, batas: p.batas });
  },

  /** Dipakai panel superadmin & landing — tanpa menghitung bila demo mati. */
  async status(tenantIdDemo?: string): Promise<PutusanDemo & { chatbotId: string | null }> {
    const p = await this.pengaturan();
    if (!p.chatbotId || !tenantIdDemo) {
      return { ...putusanDemo({ chatbotId: p.chatbotId, terpakai: 0, batas: p.batas }), chatbotId: p.chatbotId };
    }
    const terpakai = await this.terpakai(p.chatbotId, tenantIdDemo);
    return { ...putusanDemo({ chatbotId: p.chatbotId, terpakai, batas: p.batas }), chatbotId: p.chatbotId };
  },

  /** Dipanggil sesudah pengaturan diubah — cache lama akan menyesatkan. */
  lupakanCache() { cache = null; },
};
