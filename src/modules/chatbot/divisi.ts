/**
 * ATURAN AKSES DIVISI — murni, tanpa basis data, tanpa HTTP.
 *
 * Dipisahkan ke berkasnya sendiri karena inilah satu-satunya bagian RBAC yang
 * bisa diuji tanpa Postgres. Aturan izin yang hanya hidup di dalam klausa
 * WHERE hanya bisa diperiksa dengan menjalankan basis datanya — dan aturan
 * yang mahal diperiksa adalah aturan yang berhenti diperiksa.
 *
 * KEPUTUSAN PEMILIK PRODUK (31 Jul 2026):
 *   • Satu orang = SATU divisi.
 *   • Admin tenant melihat SELURUH divisi; pembatasan hanya bagi member.
 */

export interface AktorDivisi {
  /** 'superadmin' | 'admin' | 'member' */
  role: string;
  /** NULL = pengguna belum ditempatkan di divisi mana pun. */
  divisionId: string | null;
}

/**
 * Peran yang menembus batas divisi.
 *
 * `owner` TIDAK ada di sini karena tabel users memang tak mengenalnya —
 * perannya cuma tiga. Menambahkannya "untuk berjaga-jaga" akan membuat
 * string yang tak pernah cocok terlihat seperti izin yang sudah dipikirkan.
 */
export const PERAN_LINTAS_DIVISI: readonly string[] = ['superadmin', 'admin'];

export function lintasDivisi(aktor: AktorDivisi): boolean {
  return PERAN_LINTAS_DIVISI.includes(aktor.role);
}

/**
 * Boleh atau tidak seorang aktor membuka chatbot dengan divisi tertentu.
 *
 * TIGA hal yang sengaja dibedakan, dan ketiganya pernah jadi sumber salah
 * paham saat kartu ini dirancang:
 *
 *  1. divisi chatbot NULL = TAK DIBATASI, terlihat oleh siapa pun di tenant.
 *     Bukan "milik divisi kosong". Semua chatbot yang sudah ada bernilai NULL
 *     setelah migrasi 0040, jadi arti lain akan mencabut akses orang banyak
 *     secara diam-diam pada saat migrasi berjalan.
 *  2. divisi AKTOR null = belum ditempatkan. Ia melihat yang tak dibatasi
 *     saja — bukan semuanya, dan bukan tak melihat apa pun.
 *  3. Karena (1) dan (2) berbeda artinya, keduanya TIDAK boleh disamakan
 *     dengan membandingkan `aktor.divisionId === divisiChatbot`: dua NULL
 *     akan "cocok", dan orang tanpa divisi mendadak jadi anggota setiap
 *     chatbot yang juga tanpa divisi. Kebetulan itu benar di sini, tapi
 *     benar karena alasan yang salah — dan berhenti benar begitu ada divisi
 *     bawaan. Karena itu cabang NULL diputus lebih dulu, eksplisit.
 */
export function bolehLihat(aktor: AktorDivisi, divisiChatbot: string | null): boolean {
  if (lintasDivisi(aktor)) return true;
  if (divisiChatbot === null) return true;
  if (aktor.divisionId === null) return false;
  return aktor.divisionId === divisiChatbot;
}

/**
 * Alasan penolakan dalam bahasa manusia — dipakai jawaban 403.
 *
 * Sengaja TIDAK menyebut nama divisi pemilik chatbot: orang yang tak berhak
 * membukanya juga tak berhak tahu divisi mana yang memilikinya, dan pesan
 * galat adalah cara paling mudah membocorkan struktur organisasi pelanggan.
 */
export const PESAN_DILUAR_DIVISI = 'Chatbot ini milik divisi lain';
