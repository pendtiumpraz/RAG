import { createHash } from 'node:crypto';

/**
 * PENCEGAHAN REDUNDANSI berkas — bagian murni yang bisa diuji tanpa DB.
 *
 * Dua kunci, karena keduanya menangkap hal berbeda dan biayanya berbeda:
 *
 *  NAMA + UKURAN — datang dari listing upstream, jadi berkas kembar bisa
 *    dilewati SEBELUM diunduh. Paling murah, tapi paling lemah: ia luput pada
 *    salinan yang di-rename ("Kontrak (1).pdf" — kasus paling lazim di Drive
 *    dan SharePoint), dan bisa keliru pada dua berkas berbeda yang kebetulan
 *    senama-seukuran.
 *
 *  SIDIK JARI ISI — sha256 atas teks HASIL EKSTRAKSI. Butuh unduhan, tapi
 *    tepat: menangkap salinan yang di-rename dan berkas sama berformat
 *    berbeda, sekaligus MENOLAK false positive nama+ukuran. Inilah yang
 *    menghemat paling banyak — unduhan itu murah, yang mahal adalah embedding
 *    dan penyimpanan vektornya.
 */

/**
 * Sidik jari isi dokumen.
 *
 * Dinormalkan lebih dulu: ekstraksi PDF/DOCX kerap menghasilkan spasi dan
 * baris kosong yang berbeda antar-jalankan untuk berkas yang SAMA, dan tanpa
 * normalisasi sidik jarinya jadi berbeda — dedup-nya gagal persis pada kasus
 * yang mestinya ia tangani.
 *
 * Yang TIDAK dinormalkan: huruf besar-kecil dan tanda baca. Keduanya membawa
 * makna pada dokumen hukum dan keuangan, dan menyamakannya berarti dua
 * dokumen yang sungguh berbeda bisa dianggap satu.
 */
export function contentFingerprint(text: string): string {
  const normal = text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
  return createHash('sha256').update(normal, 'utf8').digest('hex');
}

/** Kunci murah dari listing: nama + ukuran. Null bila ukurannya tak diketahui. */
export function nameSizeKey(name: string | null | undefined, size: number | null | undefined): string | null {
  // Ukuran 0 SENGAJA dianggap tak berguna sebagai kunci: banyak konektor
  // melaporkan 0 untuk berkas yang ukurannya tak mereka ketahui (dokumen
  // Google native, misalnya), dan menganggapnya nilai sah akan menyatukan
  // semua berkas semacam itu jadi satu.
  if (!name || !size || size <= 0) return null;
  return `${name.trim().toLowerCase()}|${size}`;
}

/** Ambang teks terlalu pendek untuk jadi bukti kembar yang meyakinkan. */
export const MIN_FINGERPRINT_CHARS = 200;

/**
 * Layakkah teks ini dipakai sebagai sidik jari?
 *
 * Berkas yang ekstraksinya nyaris kosong (PDF hasil pindai tanpa OCR, dokumen
 * berisi satu kata) akan menghasilkan sidik jari yang sama untuk banyak berkas
 * yang isinya sungguh berbeda. Men-dedup atas dasar itu berarti membuang
 * dokumen yang sah — kegagalan yang jauh lebih mahal daripada menyimpan
 * beberapa kembar.
 */
export function fingerprintable(text: string): boolean {
  return text.trim().length >= MIN_FINGERPRINT_CHARS;
}
