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
