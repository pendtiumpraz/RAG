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

/**
 * Taksonomi awal tiap tenant. Titik berangkat, bukan daftar tertutup —
 * pengguna boleh menambah, mengganti nama, dan menghapus.
 *
 * Sengaja RINCI, bukan lima kategori luas. Daftar yang terlalu umum memaksa
 * separuh korpus jatuh ke penampung, dan penampung yang penuh tak memberi
 * tahu apa pun kepada pemilik data. Lebih baik dua belas kategori yang
 * benar-benar menjawab "ini dokumen jenis apa" daripada lima yang semuanya
 * hampir cocok.
 */
export const DEFAULT_CATEGORIES: Array<{ slug: string; label: string }> = [
  { slug: 'legal', label: 'Legal & Kontrak' },
  { slug: 'perizinan', label: 'Perizinan & Legalitas' },
  { slug: 'keuangan', label: 'Keuangan & Akuntansi' },
  { slug: 'pengadaan', label: 'Pengadaan & Vendor' },
  { slug: 'sop', label: 'SOP & Kebijakan' },
  { slug: 'hr', label: 'SDM & Kepegawaian' },
  { slug: 'teknis', label: 'Teknis & Spesifikasi' },
  { slug: 'proyek', label: 'Proyek & Pekerjaan' },
  { slug: 'komersial', label: 'Komersial & Penjualan' },
  { slug: 'korespondensi', label: 'Surat & Korespondensi' },
  { slug: 'notulen', label: 'Notulen & Laporan' },
  { slug: 'audit', label: 'Audit & Kepatuhan' },
];

/**
 * PENAMPUNG — sebuah KEADAAN, bukan kategori.
 *
 * Dulu berlabel "Lain-lain", dan itu keliru: label semacam itu terbaca
 * sebagai jenis dokumen yang sah, sehingga pemilik data menyangka ada
 * kelompok berkas bernama "lain-lain" padahal yang sebenarnya terjadi adalah
 * sistem belum berhasil menilai. "Belum dikategorikan" menyebut keadaannya
 * apa adanya, sekaligus memberi tahu bahwa ia bisa dibereskan.
 *
 * Tak bisa dihapus, karena ia tujuan pindah bagi tiga hal yang pasti terjadi:
 * dokumen yang penilaiannya gagal, catatan milik kategori yang dihapus, dan
 * usulan kategori yang belum disetujui.
 */
export const FALLBACK_SLUG = 'belum';
export const FALLBACK_LABEL = 'Belum dikategorikan';

/**
 * Nama yang DITOLAK sebagai kategori baru.
 *
 * Model kadang tetap mengembalikan "lain" atau "umum" walau diinstruksikan
 * jangan. Membuat kategori dari jawaban semacam itu akan mengembalikan persis
 * masalah yang mau dihapus: kelompok bernama samar yang tak memberi tahu
 * apa pun kepada pemilik data. Yang tertolak jatuh ke penampung — dan
 * penampung sudah jujur menyebut dirinya "Belum dikategorikan".
 */
const NAMA_SAMAR = new Set([
  'lain', 'lainnya', 'lain-lain', 'umum', 'general', 'other', 'others',
  'misc', 'miscellaneous', 'tidak-diketahui', 'unknown', 'dokumen', 'document',
  'file', 'berkas', 'belum', 'n-a', 'na', 'none', 'null',
]);

/** Apakah nama ini terlalu samar untuk jadi kategori? */
export function namaTerlaluSamar(label: string): boolean {
  return NAMA_SAMAR.has(categorySlug(label));
}

/** Nama bebas → slug yang aman dipakai sebagai kunci. */
export function categorySlug(s: string): string {
  return s.trim().toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || FALLBACK_SLUG;
}
