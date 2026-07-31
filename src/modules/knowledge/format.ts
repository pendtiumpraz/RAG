/**
 * FORMAT BERKAS yang bisa dibaca Nalar.
 *
 * Dipisah dari `sync.service.ts` supaya HALAMAN BANTUAN bisa membacanya
 * langsung. Daftar format adalah janji kepada pengguna, dan janji yang
 * disalin dengan tangan ke halaman bantuan akan berhenti benar begitu satu
 * ekstensi ditambahkan di sini — tanpa ada yang gagal, tanpa ada yang tahu.
 * Satu-satunya cara membuatnya tak bisa menyimpang adalah membaca dari
 * sumber yang sama.
 *
 * Modul ini MURNI: tak menyentuh basis data, berkas, maupun modul server,
 * sehingga aman diimpor komponen klien.
 */

/** Diambil apa adanya sebagai teks. */
export const TEXT_EXT = ['.txt', '.md', '.markdown', '.csv', '.json', '.log', '.yaml', '.yml'];

/** Perlu diurai lebih dulu (PDF via pdf-parse, DOCX via mammoth). */
export const DOC_EXT = ['.html', '.htm', '.pdf', '.docx'];

/** Seluruh format yang didukung, untuk ditampilkan ke pengguna. */
export const FORMAT_DIDUKUNG = [...TEXT_EXT, ...DOC_EXT];
