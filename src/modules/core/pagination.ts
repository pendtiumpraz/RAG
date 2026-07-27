/**
 * PAGINATION — satu bentuk untuk semua daftar.
 *
 * Beberapa endpoint sebelumnya mengembalikan SELURUH baris (atau dipatok
 * `limit 50` diam-diam tanpa memberi tahu ada sisanya). Pada tenant yang aktif
 * itu berarti satu permintaan menyeret ribuan baris ke browser, dan pengguna
 * tak punya cara melihat data yang lebih lama.
 */

export interface Page<T> {
  rows: T[];
  total: number;
  page: number;      // 1-based
  pageSize: number;
  pages: number;
}

export interface Paging { limit: number; offset: number; page: number; pageSize: number }

/**
 * Baca `page`/`pageSize` dari query string.
 * `pageSize` DIBATASI di server — kalau hanya dibatasi di UI, siapa pun bisa
 * meminta `?pageSize=100000` dan menjatuhkan database.
 */
export function parsePaging(
  params: URLSearchParams,
  opts: { defaultSize?: number; maxSize?: number } = {},
): Paging {
  const defaultSize = opts.defaultSize ?? 25;
  const maxSize = opts.maxSize ?? 100;

  const rawPage = Number(params.get('page'));
  const rawSize = Number(params.get('pageSize'));

  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;
  const pageSize = Number.isFinite(rawSize) && rawSize >= 1
    ? Math.min(Math.floor(rawSize), maxSize)
    : defaultSize;

  return { page, pageSize, limit: pageSize, offset: (page - 1) * pageSize };
}

export function toPage<T>(rows: T[], total: number, p: Paging): Page<T> {
  return {
    rows, total, page: p.page, pageSize: p.pageSize,
    pages: Math.max(1, Math.ceil(total / p.pageSize)),
  };
}
