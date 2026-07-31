import { and, asc, eq, gt, isNull, sql } from 'drizzle-orm';
import { conversations, messages } from '@/modules/core/db/schema';
import type { Db } from '@/modules/core/db';

/**
 * EKSPOR PERCAKAPAN — penyaring dan bentuk keluarannya, murni.
 *
 * Dipisahkan dari rutenya supaya bisa diuji tanpa HTTP dan tanpa Postgres.
 * Yang diuji di sini bukan "apakah datanya keluar" — itu jalur bahagia yang
 * kerusakannya langsung terlihat — melainkan hal-hal yang rusaknya SENYAP:
 * penyaring waktu yang salah baca lalu diam-diam mengembalikan segalanya,
 * dan batas halaman yang lolos tanpa penanda sehingga penariknya mengira
 * sudah selesai padahal baru separuh.
 */

/** Batas keras satu halaman. Lihat `batasiAmbil` untuk alasannya. */
export const AMBIL_MAKS = 200;
export const AMBIL_BAWAAN = 50;

/**
 * Berapa baris yang boleh diambil satu permintaan.
 *
 * Dibatasi keras di 200, dan itu bukan kesopanan: satu percakapan bisa
 * berisi puluhan pesan panjang, jadi "limit=100000" berarti satu permintaan
 * menarik seluruh riwayat tenant ke dalam memori lambda sekaligus — pada
 * Vercel itu berakhir sebagai kegagalan yang sebabnya tak kelihatan di log
 * mana pun.
 *
 * Nilai tak masuk akal DIBULATKAN ke rentang sah, bukan ditolak: penarik
 * berkala yang mati karena salah ketik satu parameter jauh lebih merepotkan
 * daripada penarik yang menerima 200 saat meminta 999.
 */
export function batasiAmbil(mentah: string | null): number {
  const n = Number(mentah);
  if (!Number.isFinite(n) || n <= 0) return AMBIL_BAWAAN;
  return Math.min(Math.floor(n), AMBIL_MAKS);
}

/**
 * Tafsir parameter waktu `sejak` (ISO 8601).
 *
 * Mengembalikan `null` bila TIDAK diisi, dan MELEMPAR bila diisi tapi tak
 * terbaca. Bedanya menentukan: menganggap tanggal ngawur sebagai "tanpa
 * penyaring" membuat penarik berkala yang salah format mengunduh ulang
 * SELURUH riwayat setiap kali dijalankan — berhasil, senyap, dan mahal.
 */
export function tafsirSejak(mentah: string | null): Date | null {
  if (mentah === null || mentah === '') return null;
  const d = new Date(mentah);
  if (Number.isNaN(d.getTime())) {
    throw new RangeError(`Parameter "sejak" bukan tanggal ISO 8601 yang sah: ${mentah}`);
  }
  return d;
}

export interface HalamanEkspor<T> {
  items: T[];
  /** Ada baris berikutnya di luar halaman ini. */
  adaLagi: boolean;
  /** Nilai `sejak` untuk permintaan berikutnya; null bila sudah habis. */
  berikutnya: string | null;
}

/**
 * Bungkus hasil jadi halaman yang JUJUR soal keterpotongannya.
 *
 * Diminta n+1 baris, dikembalikan n. Kalau baris ke-n+1 ada, berarti masih
 * ada sisa — dan itulah satu-satunya cara penarik tahu ia harus melanjutkan.
 * Tanpa penanda ini, batas halaman terlihat persis seperti "data habis", dan
 * arsip pelanggan berhenti di tengah tanpa satu pun galat.
 */
export function halaman<T extends { updatedAt: Date | string }>(
  baris: T[], batas: number,
): HalamanEkspor<T> {
  const adaLagi = baris.length > batas;
  const items = adaLagi ? baris.slice(0, batas) : baris;
  const akhir = items.at(-1)?.updatedAt ?? null;
  return {
    items,
    adaLagi,
    /* Kursornya adalah waktu baris TERAKHIR yang benar-benar dikirim, bukan
       waktu sekarang: memakai waktu sekarang akan melompati baris yang
       tersimpan sementara halaman ini sedang disusun. */
    berikutnya: adaLagi && akhir ? new Date(akhir).toISOString() : null,
  };
}

/**
 * Kueri daftar percakapan + jumlah pesannya.
 *
 * DIBANGUN DI SINI, BUKAN DI RUTENYA, supaya SQL yang dihasilkannya bisa
 * diperiksa uji lewat `.toSQL()` tanpa basis data. Versi pertama endpoint ini
 * memakai subkueri berkorelasi yang ditulis di dalam template `sql`:
 *
 *     select count(*)::int from ${messages}
 *     where ${messages.conversationId} = ${conversations.id}
 *
 * dan Drizzle merender kolomnya TANPA kualifikasi tabel:
 *
 *     where "conversation_id" = "id"
 *
 * Di dalam subkueri, KEDUANYA lalu menunjuk kolom `messages` sendiri, jadi
 * yang dibandingkan `messages.conversation_id = messages.id` — praktis tak
 * pernah benar. Endpoint-nya selalu menjawab `pesan: 0`, tanpa satu pun galat:
 * tsc tak bisa memvalidasi SQL, dan uji unit tak menyentuh basis data.
 *
 * LEFT JOIN + GROUP BY dipakai sebagai gantinya bukan sekadar karena benar,
 * tapi karena kondisi join DIKUALIFIKASI Drizzle sendiri — bentuk yang salah
 * tak bisa lagi ditulis tanpa terlihat. Kebetulan ia juga sekali jalan alih-
 * alih satu subkueri per baris.
 *
 * GROUP BY memuat SELURUH kolom non-agregat, dan urutannya mengikuti SELECT:
 * Postgres menolak yang kurang, dan Drizzle tak menambahkannya sendiri.
 */
export function bangunKueriDaftar(
  tx: Db, opsi: { sejak: Date | null; chatbotId: string | null; batas: number },
) {
  return tx
    .select({
      id: conversations.id,
      chatbotId: conversations.chatbotId,
      visitorId: conversations.visitorId,
      startedAt: conversations.startedAt,
      updatedAt: conversations.updatedAt,
      pesan: sql<number>`count(${messages.id})::int`,
    })
    .from(conversations)
    /* Soft delete pesan ikut di kondisi JOIN, bukan di WHERE. Di WHERE, baris
       percakapan yang SELURUH pesannya terhapus akan ikut hilang dari daftar
       — percakapan yang nyata ada mendadak tak pernah bisa diekspor. */
    .leftJoin(messages, and(
      eq(messages.conversationId, conversations.id),
      isNull(messages.deletedAt),
    ))
    .where(and(
      isNull(conversations.deletedAt),
      opsi.sejak ? gt(conversations.updatedAt, opsi.sejak) : undefined,
      opsi.chatbotId ? eq(conversations.chatbotId, opsi.chatbotId) : undefined,
    ))
    .groupBy(
      conversations.id, conversations.chatbotId, conversations.visitorId,
      conversations.startedAt, conversations.updatedAt,
    )
    .orderBy(asc(conversations.updatedAt))
    .limit(opsi.batas + 1);
}
