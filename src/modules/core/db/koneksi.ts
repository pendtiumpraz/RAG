/**
 * BATAS WAKTU MENYAMBUNG — dan kenapa angkanya seperti itu.
 *
 * TERUKUR DI PRODUKSI 1 Agu 2026. Panggilan PERTAMA ke endpoint yang
 * menyentuh basis data dari lambda yang baru dingin memakan 57 detik;
 * panggilan kedua 0,45 detik. Yang tak menyentuh basis data (/api/openapi)
 * dingin pun hanya 0,45 detik.
 *
 * Tiga tersangka utama sudah disingkirkan dengan bukti:
 *   • bukan Postgres-nya — 4 koneksi semuanya idle, 17/112 terpakai, latensi
 *     kueri 3 ms saat hangat;
 *   • bukan Neon yang tidur — pg_postmaster_start_time() menunjukkan compute
 *     sudah hidup 24 menit saat pengukuran;
 *   • bukan bundel aplikasi yang berat — rute tanpa basis data dingin cuma
 *     0,45 detik, dan pooler memang sudah dipakai.
 *
 * Yang tersisa: penyambungan PERTAMA dari lambda baru menggantung, lalu
 * berhasil pada percobaan berikutnya. Bawaan `connect_timeout` postgres.js
 * adalah 30 detik, dan 30 + ±27 membentuk 57 hampir persis — pola "gagal
 * sekali, ulang, berhasil".
 *
 * ┌─ KENAPA TIDAK DIBUAT SEPENDEK MUNGKIN ──────────────────────────────┐
 * │ Batas yang terlalu agresif mengubah "lambat tapi berhasil" menjadi   │
 * │ "gagal" — dan itu JAUH lebih buruk. Hari ini pengguna menunggu 57    │
 * │ detik lalu halamannya terbuka; dengan batas 5 detik ia menunggu 5    │
 * │ detik lalu melihat galat. Yang satu menjengkelkan, yang lain rusak.  │
 * │                                                                      │
 * │ 15 detik dipilih karena ia di bawah bawaan 30 (jadi atapnya turun     │
 * │ dari ±57 ke ±30 detik) tapi masih jauh di atas penyambungan yang     │
 * │ sehat, yang selesai dalam milidetik. Ia MENURUNKAN ATAP, bukan       │
 * │ membuktikan sebabnya — dan itu memang yang bisa dilakukan tanpa      │
 * │ melihat log Vercel.                                                  │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * Bisa disetel lewat `DB_CONNECT_TIMEOUT` (detik) tanpa mengubah kode, karena
 * angka yang benar hanya bisa ditemukan dengan mencoba di lingkungan yang
 * sebenarnya.
 */

export const BATAS_SAMBUNG_BAWAAN = 15;

/**
 * Ambang "penyambungan ini lambat sekali" — dicatat ke log supaya kejadian
 * berikutnya meninggalkan bukti, bukan misteri.
 *
 * Inilah bagian yang paling berguna dari seluruh berkas ini. Hari ini tak ada
 * satu pun jejak yang menjelaskan 57 detik itu; yang ada cuma pengguna yang
 * menunggu. Satu baris log dengan lama sambungnya mengubah keluhan
 * "kadang lambat" jadi angka yang bisa ditindaklanjuti.
 */
export const AMBANG_LAMBAT_MS = 3_000;

/**
 * Baca batas waktu dari env, dengan penjagaan terhadap nilai yang tak masuk
 * akal.
 *
 * Nol atau negatif ARTINYA "tanpa batas" di postgres.js — kebalikan persis
 * dari maksud siapa pun yang mengetik `DB_CONNECT_TIMEOUT=0`, dan justru
 * mengembalikan gantungan tak berujung yang hendak dicegah. Karena itu ia
 * dijepit, bukan diteruskan.
 */
export function batasSambung(env: Record<string, string | undefined> = process.env): number {
  const mentah = Number(env.DB_CONNECT_TIMEOUT);
  if (!Number.isFinite(mentah) || mentah <= 0) return BATAS_SAMBUNG_BAWAAN;
  // Atap 120 detik: apa pun di atas itu sama saja dengan menggantung.
  return Math.min(120, Math.floor(mentah));
}
