import { nanoid } from 'nanoid';
import { and, eq, isNull } from 'drizzle-orm';
import { users, conversations, chatbotKnowledgeBases, type Db, type ThemeConfig } from '@/modules/core/db';
import { withTenant } from '@/modules/core/db/tenant-context';
import {
  normalizePolicy, type LanguageMode, type Tone, type Grounding,
} from '@/modules/chat/answer-policy';
import { dispatch } from '@/modules/core/events';
import { usageService, QuotaError } from '@/modules/usage/usage.service';
import { chatbotRepository as repo } from './chatbot.repository';
import { bolehLihat, lintasDivisi, PESAN_DILUAR_DIVISI, type AktorDivisi } from './divisi';
import { encryptSecret } from '@/modules/core/crypto';
import { rahasiaPengunjungBaru } from '@/modules/chat/visitor-identity';

export class ValidationError extends Error {}

/**
 * Ditolak karena DIVISI, bukan karena data tak sah — dan bedanya penting di
 * HTTP: yang satu 403, yang lain 422. Menyamakannya membuat "kamu tak berhak"
 * terbaca sebagai "kirimanmu salah", dan orang akan mencoba memperbaiki
 * kiriman yang sebenarnya sudah benar.
 */
export class AksesDitolakError extends Error {
  constructor(msg = PESAN_DILUAR_DIVISI) { super(msg); }
}

/**
 * Service = business logic + referential integrity (konsekuensi No-FK Rule #2).
 * Controller (route) hanya memanggil service; service tidak tahu HTTP.
 */
export const chatbotService = {
  /**
   * Buang rahasia dari baris yang akan meninggalkan server.
   *
   * `repo.listActive` memakai `select()` tanpa kolom eksplisit, jadi SETIAP
   * kolom baru otomatis ikut terkirim ke peramban — termasuk
   * `visitor_secret`. Ia memang terenkripsi, tapi ciphertext yang beredar di
   * klien adalah bahan yang tak pernah perlu ada di sana: satu kebocoran
   * kunci enkripsi kelak mengubahnya jadi rahasia terbuka, dan tak ada satu
   * pun layar yang membutuhkannya. Yang dibutuhkan UI cuma NYALA atau tidak.
   */
  tanpaRahasia<T extends { visitorSecret?: string | null; logo?: string | null }>(row: T) {
    const { visitorSecret, logo, ...sisa } = row;
    /* `logo` adalah data URL PENUH (kolom text). Ia ikut terkirim ke peramban
       di setiap daftar chatbot — persis jebakan yang diperingatkan di komentar
       atas: `select()` tanpa kolom eksplisit membawa SEMUA kolom. Tak ada satu
       pun layar yang membacanya dari sini; gambarnya dilayani terpisah lewat
       /api/chat/{publicKey}/logo justru supaya daftar tetap ringan. Yang
       dibutuhkan UI cuma tahu ADA atau tidak — dan itu juga yang menghentikan
       halaman Branding meminta gambar yang tak pernah ada (404 di konsol
       setiap kali dibuka). */
    return { ...sisa, visitorSecret: visitorSecret ? true : null, punyaLogo: !!logo };
  },

  async list(tenantId: string, aktor: AktorDivisi) {
    const rows = await withTenant(tenantId, (tx) => repo.listActive(tx, tenantId, aktor));
    return rows.map((r) => this.tanpaRahasia(r));
  },

  async listTrashed(tenantId: string, aktor: AktorDivisi) {
    const rows = await withTenant(tenantId, (tx) => repo.listTrashed(tx, tenantId, aktor));
    return rows.map((r) => this.tanpaRahasia(r));
  },

  async create(tenantId: string, aktor: AktorDivisi, input: {
    ownerId: string; name: string; allowedOrigins?: string[];
    greeting?: string; themeConfig?: ThemeConfig;
    /** D11: konteks kepemilikan/persona (divisi) — masuk system prompt bot ini.
     *  NULLABLE: form mengirim null saat kolomnya kosong, dan itu keadaan
     *  normal untuk chatbot baru. */
    context?: string | null;
    /** Divisi pemilik. NULL = tak dibatasi; hanya admin yang boleh memilihnya. */
    divisionId?: string | null;
  }) {
    /* Batas paket dihitung SE-TENANT, bukan lewat daftar yang sudah tersaring
       divisi — kalau lewat daftar, tiap divisi mendapat jatah penuh sendiri
       dan tenant gratis berdivisi lima diam-diam punya lima kali batasnya. */
    const usage = await usageService.snapshot(tenantId);
    const activeCount = await withTenant(tenantId, (tx) => repo.countActive(tx, tenantId));
    if (activeCount >= usage.limits.maxChatbots) {
      // Kuota habis MENYEBUT sebab + jalan keluar → 402, bukan 422 "permintaan
      // salah": jatahnya penuh, bukan inputnya keliru.
      throw new QuotaError(
        `Plan ${usage.plan} maksimal ${usage.limits.maxChatbots} chatbot. Upgrade untuk menambah.`,
        activeCount, usage.limits.maxChatbots,
      );
    }

    const created = await withTenant(tenantId, async (tx) => {
      // Integritas referensial di aplikasi: owner harus user aktif tenant ini.
      const owner = await tx.select({ id: users.id }).from(users)
        .where(and(eq(users.id, input.ownerId), isNull(users.deletedAt))).limit(1);
      if (!owner[0]) throw new ValidationError('Owner tidak ditemukan di tenant ini');

      /* Member TIDAK boleh memilih divisi chatbot yang ia buat — chatbotnya
         mengikuti divisinya sendiri. Kalau boleh memilih, ia tinggal
         mengirim divisionId:null lewat API dan chatbot divisinya jadi
         terbuka untuk seluruh tenant; pembatasannya akan terlihat berjalan
         di layar sambil bisa dilewati dengan satu permintaan HTTP. */
      const divisionId = lintasDivisi(aktor)
        ? (input.divisionId ?? null)
        : aktor.divisionId;

      const created = await repo.create(tx, {
        tenantId,
        ownerId: input.ownerId,
        name: input.name,
        publicKey: 'cb_live_' + nanoid(24),
        allowedOrigins: input.allowedOrigins ?? [],
        greeting: input.greeting,
        themeConfig: input.themeConfig,
        context: input.context?.trim() || null,
        divisionId,
      });
      return created;
    });

    /* DISPATCH DI LUAR TRANSAKSI — dan ini bukan kerapian, melainkan
       perbaikan kebuntuan yang nyata.

       Di Vercel kolam koneksi dipatok `max: 1`. Selama transaksi di atas
       terbuka, ia MEMEGANG satu-satunya koneksi. Handler webhook memanggil
       `fanout()`, yang membuka `withTenant` KEDUA — dan permintaan koneksi
       kedua itu menunggu koneksi pertama dilepas, sementara yang pertama
       menunggu dispatch selesai. Keduanya menunggu selamanya.

       Gejalanya persis seperti yang dilaporkan pemilik produk (1 Agu 2026):
       "tambah chatbot muter2 terus" — bukan galat, bukan lambat, tapi
       menggantung tanpa ujung. Tak terlihat di mesin pengembangan karena di
       sana `max: 10`, jadi koneksi kedua selalu tersedia.

       Peristiwa memang tak perlu ikut di dalam transaksi: ia memberitahu
       DUNIA LUAR bahwa sesuatu SUDAH terjadi, dan sesuatu itu baru benar
       terjadi setelah transaksinya commit. */
    await dispatch('chatbot.created', { tenantId, chatbotId: created.id, ownerId: input.ownerId });
    return created;
  },

  /**
   * Penjaga divisi untuk operasi BER-ID.
   *
   * Daftar yang tersaring belum menjaga apa pun: id chatbot muncul di URL,
   * di log, dan di potongan embed yang memang dibagikan. Tanpa pemeriksaan
   * ini, member divisi lain tetap bisa PATCH atau DELETE chatbot yang tak
   * pernah terlihat olehnya — pembatasannya akan terlihat bekerja di layar
   * sambil tak menjaga apa-apa.
   *
   * `withTrashed` untuk restore: barisnya memang sudah terhapus lunak, dan
   * mencarinya tanpa itu akan menjawab "tidak ditemukan" pada chatbot divisi
   * lain — kebetulan aman, tapi aman karena alasan yang salah.
   */
  async pastikanBoleh(tx: Db, id: string, aktor: AktorDivisi, opts: { withTrashed?: boolean } = {}) {
    const bot = await repo.findById(tx, id, opts);
    if (!bot) throw new ValidationError('Chatbot tidak ditemukan');
    if (!bolehLihat(aktor, bot.divisionId)) throw new AksesDitolakError();
    return bot;
  },

  async update(tenantId: string, aktor: AktorDivisi, id: string, input: Partial<{
    name: string; allowedOrigins: string[]; greeting: string;
    enabled: boolean; themeConfig: ThemeConfig; context: string | null;
    /* Kebijakan jawaban (D14). */
    temperature: number; maxTokens: number; languageMode: string;
    tone: string; grounding: string; answerRules: string | null;
    /** Hanya peran lintas divisi yang boleh memindahkan chatbot. */
    divisionId: string | null;
  }>) {
    return withTenant(tenantId, async (tx) => {
      await this.pastikanBoleh(tx, id, aktor);
      /* Memindahkan chatbot ke divisi lain — atau melepasnya jadi tak
         dibatasi — adalah keputusan lintas divisi menurut definisinya
         sendiri. Member yang mengirim divisionId cuma diabaikan, bukan
         ditolak: kirimannya sah, wewenangnya yang tidak. */
      if ('divisionId' in input && !lintasDivisi(aktor)) delete input.divisionId;
      // Kebijakan DINORMALKAN di server sebelum menyentuh DB. Klien boleh
      // mengirim apa saja; batas temperature/token dan daftar nilai sah
      // ditegakkan di sini (dan sekali lagi oleh CHECK constraint migrasi
      // 0030) — bukan diserahkan pada slider di browser.
      const touchesPolicy = ['temperature', 'maxTokens', 'languageMode', 'tone', 'grounding', 'answerRules']
        .some((k) => k in input);
      let patch = input;
      if (touchesPolicy) {
        const current = await repo.findById(tx, id);
        if (!current) throw new ValidationError('Chatbot tidak ditemukan');
        const p = normalizePolicy({
          temperature: input.temperature ?? current.temperature,
          maxTokens: input.maxTokens ?? current.maxTokens,
          language: (input.languageMode ?? current.languageMode) as LanguageMode,
          tone: (input.tone ?? current.tone) as Tone,
          grounding: (input.grounding ?? current.grounding) as Grounding,
          rules: input.answerRules !== undefined ? input.answerRules : current.answerRules,
        });
        patch = {
          ...input,
          temperature: p.temperature, maxTokens: p.maxTokens,
          languageMode: p.language, tone: p.tone, grounding: p.grounding,
          answerRules: p.rules,
        };
      }
      const updated = await repo.update(tx, id, patch);
      if (!updated) throw new ValidationError('Chatbot tidak ditemukan');
      return updated;
    });
  },

  /**
   * Soft delete + CASCADE di level aplikasi (bukan DB) — D11: KB adalah
   * entitas BERSAMA, jadi menghapus chatbot TIDAK menyentuh KB/dokumennya;
   * yang ikut terhapus hanya ASSIGNMENT-nya dan percakapan chatbot ini.
   */
  async softDelete(tenantId: string, aktor: AktorDivisi, id: string) {
    const deleted = await withTenant(tenantId, async (tx) => {
      await this.pastikanBoleh(tx, id, aktor);
      const deleted = await repo.softDelete(tx, id);
      if (!deleted) throw new ValidationError('Chatbot tidak ditemukan');
      const now = new Date();
      await tx.update(chatbotKnowledgeBases).set({ deletedAt: now, updatedAt: now })
        .where(and(eq(chatbotKnowledgeBases.chatbotId, id), isNull(chatbotKnowledgeBases.deletedAt)));
      await tx.update(conversations).set({ deletedAt: now, updatedAt: now })
        .where(and(eq(conversations.chatbotId, id), isNull(conversations.deletedAt)));
      return deleted;
    });
    // Di luar transaksi — lihat catatan panjang di create(). max:1 di Vercel.
    await dispatch('chatbot.deleted', { tenantId, chatbotId: id });
    return deleted;
  },

  /** Restore chatbot + kaskade kebalikannya (assignment & percakapan). */
  async restore(tenantId: string, aktor: AktorDivisi, id: string) {
    const restored = await withTenant(tenantId, async (tx) => {
      await this.pastikanBoleh(tx, id, aktor, { withTrashed: true });
      const restored = await repo.restore(tx, id);
      if (!restored) throw new ValidationError('Chatbot tidak ada di Sampah');
      const now = new Date();
      await tx.update(chatbotKnowledgeBases).set({ deletedAt: null, updatedAt: now })
        .where(eq(chatbotKnowledgeBases.chatbotId, id));
      await tx.update(conversations).set({ deletedAt: null, updatedAt: now })
        .where(eq(conversations.chatbotId, id));
      return restored;
    });
    // Di luar transaksi — lihat catatan panjang di create(). max:1 di Vercel.
    await dispatch('chatbot.restored', { tenantId, chatbotId: id });
    return restored;
  },

  /**
   * Nyalakan / putar / matikan rahasia identitas pengunjung.
   *
   * Rahasianya dikembalikan SATU KALI, saat dibuat. Sesudah itu ia hanya ada
   * dalam bentuk terenkripsi dan tak pernah bisa dibaca lagi — sama seperti
   * kunci API di mana pun. Menyimpannya agar bisa "dilihat lagi" berarti
   * seluruh riwayat pelanggan bergantung pada satu layar dasbor yang bisa
   * dibuka siapa pun yang sempat duduk di kursi yang salah.
   *
   * MEMUTAR RAHASIA MEMUTUS SEMUA TANDA TANGAN LAMA seketika: widget yang
   * masih memakai tanda tangan lama akan ditolak sampai server pelanggan
   * memakai rahasia baru. Itu memang gunanya — rahasia diputar justru ketika
   * yang lama diduga bocor.
   */
  async setRahasiaPengunjung(tenantId: string, aktor: AktorDivisi, id: string, nyala: boolean) {
    return withTenant(tenantId, async (tx) => {
      await this.pastikanBoleh(tx, id, aktor);
      const rahasia = nyala ? rahasiaPengunjungBaru() : null;
      const updated = await repo.update(tx, id, {
        visitorSecret: rahasia ? encryptSecret(rahasia) : null,
      });
      if (!updated) throw new ValidationError('Chatbot tidak ditemukan');
      /* Yang polos dikembalikan, yang tersimpan terenkripsi. Pemanggilnya
         wajib menampilkannya sekali lalu melupakannya. */
      return { rahasia };
    });
  },

  embedSnippet(publicKey: string) {
    const host = process.env.NEXTAUTH_URL ?? '';
    return `<script src="${host}/embed.js" data-chatbot="${publicKey}"></script>`;
  },
};
