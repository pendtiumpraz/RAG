import type { NextRequest } from 'next/server';

/**
 * Pembacaan `limit`/`offset` yang SAMA untuk seluruh rute daftar v1.
 *
 * ── KENAPA TERPUSAT ─────────────────────────────────────────────────────────
 *
 * Tiga rute daftar (`/chatbots`, `/knowledge-bases`, `/documents`) sebelumnya
 * mengembalikan SELURUH isi tanpa batas apa pun — `/documents` bahkan dipatok
 * keras di 500 baris tanpa cara meminta sisanya. Klien seperti Maira lalu tak
 * punya pilihan selain menarik semuanya lalu memotongnya di layar; itu bukan
 * pagination, cuma menyembunyikan baris setelah biayanya terlanjur dibayar.
 *
 * Ditaruh di satu tempat karena tiga penafsiran berbeda atas `limit=0` atau
 * `offset=-5` adalah cara paling mudah melahirkan bug yang cuma muncul di satu
 * layar. Nilai yang tak masuk akal DIJEPIT, bukan ditolak: permintaan daftar
 * yang sedikit meleset lebih baik dijawab dengan halaman pertama daripada 400.
 */

/** Batas atas per permintaan. Di atas ini, biaya kueri mulai terasa. */
export const LIMIT_MAKS = 200;
/** Dipakai saat klien tak menyebut apa-apa. */
export const LIMIT_BAWAAN = 50;

export interface Paging {
  limit: number;
  offset: number;
}

export function bacaPaging(req: NextRequest, bawaan = LIMIT_BAWAAN): Paging {
  const q = new URL(req.url).searchParams;
  const limitMentah = Number(q.get('limit'));
  const offsetMentah = Number(q.get('offset'));
  const limit = Number.isFinite(limitMentah) && limitMentah > 0
    ? Math.min(LIMIT_MAKS, Math.floor(limitMentah))
    : bawaan;
  const offset = Number.isFinite(offsetMentah) && offsetMentah > 0
    ? Math.floor(offsetMentah)
    : 0;
  return { limit, offset };
}

/**
 * Bentuk balasan daftar. `total` WAJIB ada — tanpa itu klien tak bisa
 * menggambar nomor halaman, dan yang tersisa cuma tombol "berikutnya" yang
 * tak pernah tahu kapan berhenti.
 */
export function balasanDaftar<T>(
  kunci: string,
  baris: T[],
  total: number,
  paging: Paging,
): Record<string, unknown> {
  return {
    [kunci]: baris,
    total,
    limit: paging.limit,
    offset: paging.offset,
    // Diturunkan di server supaya semua klien sepakat kapan daftarnya habis —
    // aritmatika yang sama diulang di tiap klien pasti berbeda di salah satunya.
    hasMore: paging.offset + baris.length < total,
  };
}
