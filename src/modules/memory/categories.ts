/**
 * PENANDA VISUAL KATEGORI — warna × bentuk.
 *
 * Kenapa bukan sekadar daftar warna: pada graf, node mana pun bisa
 * bersebelahan dengan node mana pun, jadi yang harus dijamin adalah SETIAP
 * PASANGAN warna dapat dibedakan — bukan hanya pasangan yang bertetangga di
 * legenda. Diuji dengan validator OKLab (`--pairs all`), dan hasilnya keras:
 *
 *   8 warna  → GAGAL. Ungu #7C3AED vs biru #2563EB hanya ΔE 0,4 pada deutan;
 *              bagi mata buta warna merah-hijau keduanya warna yang sama.
 *              Pink #DB2777 vs merah #DC2626 pun ΔE 10,1 bagi mata normal.
 *   12 warna → GAGAL lebih parah (ΔE 5,6 bahkan untuk penglihatan penuh).
 *    4 warna → LOLOS semua pasangan (terburuk 6,1 deutan — sah karena tiap
 *              node juga berlabel dan legendanya menyebut nama kategori).
 *
 * Empat kategori jelas tak cukup untuk perusahaan. Karena itu sumbu kedua:
 * BENTUK. Bentuk kebal terhadap buta warna sepenuhnya, dan 4 warna × 4 bentuk
 * memberi 16 slot yang tiap pasangannya berbeda pada warna, bentuk, atau
 * keduanya. Di atas 16, penyaring kategori-lah yang jadi alat baca utamanya —
 * bukan warna. Itu batas persepsi manusia, bukan batas basis data: jumlah
 * kategori sendiri tidak dibatasi.
 */

/** Empat warna yang lolos uji semua-pasangan pada mode terang DAN gelap. */
export const SLOT_COLORS = ['#2563EB', '#D97706', '#DB2777', '#16A34A'] as const;

/** Bentuk node di kanvas. Kebal buta warna — inilah sumbu keduanya. */
export const SLOT_SHAPES = ['circle', 'square', 'triangle', 'diamond'] as const;
export type Shape = (typeof SLOT_SHAPES)[number];

/** Jumlah kategori yang masih punya penanda visual unik. */
export const VISUAL_SLOTS = SLOT_COLORS.length * SLOT_SHAPES.length; // 16

/** Warna netral untuk kategori di luar 16 slot — dibaca lewat penyaring. */
export const OVERFLOW_COLOR = '#78716C';

export interface Marker { color: string; shape: Shape; }

/**
 * Slot → penanda. WARNA BERPUTAR LEBIH CEPAT dari bentuk dengan sengaja:
 * kategori yang bersebelahan di master data jadi berbeda WARNA (perbedaan
 * yang paling cepat ditangkap mata), sementara bentuk membedakan kelompok
 * yang lebih jauh.
 *
 * `slot` disimpan di baris kategori dan TIDAK PERNAH dihitung ulang dari
 * urutan. Kalau ia diturunkan dari posisi, menghapus satu kategori akan
 * mengecat ulang semua kategori sesudahnya — dan graf yang warnanya bergeser
 * sendiri tak bisa dibaca siapa pun.
 */
export function markerForSlot(slot: number): Marker {
  if (slot < 0 || slot >= VISUAL_SLOTS) return { color: OVERFLOW_COLOR, shape: 'circle' };
  return {
    color: SLOT_COLORS[slot % SLOT_COLORS.length],
    shape: SLOT_SHAPES[Math.floor(slot / SLOT_COLORS.length)],
  };
}

/** Taksonomi awal tiap tenant. Titik berangkat, bukan daftar tertutup. */
export const DEFAULT_CATEGORIES: Array<{ slug: string; label: string }> = [
  { slug: 'legal', label: 'Legal & Kontrak' },
  { slug: 'keuangan', label: 'Keuangan' },
  { slug: 'sop', label: 'SOP & Kebijakan' },
  { slug: 'hr', label: 'SDM & Kepegawaian' },
  { slug: 'teknis', label: 'Teknis' },
  { slug: 'proyek', label: 'Proyek' },
  { slug: 'komersial', label: 'Komersial & Penjualan' },
  { slug: 'lain', label: 'Lain-lain' },
];

/** Kategori penampung; tak pernah bisa dihapus. */
export const FALLBACK_SLUG = 'lain';

/** Nama bebas → slug yang aman dipakai sebagai kunci. */
export function categorySlug(s: string): string {
  return s.trim().toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || FALLBACK_SLUG;
}
