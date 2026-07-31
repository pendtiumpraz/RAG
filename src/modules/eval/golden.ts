/**
 * HIMPUNAN BAKU (golden set) — pertanyaan yang jawabannya sudah diketahui.
 *
 * Bentuknya sengaja sederhana dan dapat disunting manusia: berkas JSON di
 * `eval/golden/`. Yang menyusunnya adalah orang yang tahu isi dokumennya,
 * dan orang itu belum tentu menulis kode — format yang menuntut TypeScript
 * akan membuat himpunannya tak pernah tumbuh.
 *
 * DUA JENIS PERTANYAAN, dan keduanya wajib ada:
 *
 *   terjawab   — ada dokumen yang memuat jawabannya. Diukur dengan metrik
 *                retrieval biasa.
 *   TAK ADA    — jawabannya memang tidak ada di korpus, dan jawaban yang
 *                BENAR adalah "tidak ada di dokumen".
 *
 * Jenis kedua itu yang paling sering dilupakan orang saat menyusun eval, dan
 * justru ia yang mengukur hal paling mahal bagi produk ini: karangan.
 * Himpunan yang seluruhnya berisi pertanyaan terjawab akan memberi nilai
 * sempurna kepada sistem yang mengarang jawaban untuk apa pun yang ditanya.
 */

export interface PertanyaanBaku {
  /** Kunci stabil — dipakai membandingkan antar jalan. JANGAN diubah setelah dipakai. */
  id: string;
  q: string;
  /**
   * `doc_ref` dokumen yang memuat jawabannya, diurutkan bebas.
   * KOSONG berarti pertanyaan jenis "tak ada jawabannya di korpus".
   */
  docRefs: string[];
  /** Catatan penyusun — kenapa dokumen ini yang dianggap benar. */
  catatan?: string;
}

export interface HimpunanBaku {
  nama: string;
  /** Chatbot yang dipakai menjalankan — menentukan knowledge base mana yang tersapu. */
  chatbotId?: string;
  /** Berapa hasil teratas yang dinilai. Default 10. */
  k?: number;
  pertanyaan: PertanyaanBaku[];
}

export class GoldenError extends Error {}

/** Berapa pertanyaan minimum sebelum angkanya layak dipercaya. */
export const MIN_PERTANYAAN = 8;
/** Berapa bagian minimum yang harus jenis "tak ada jawabannya". */
export const MIN_RASIO_KOSONG = 0.15;

/**
 * Periksa bentuk DAN kelayakan himpunan.
 *
 * Kelayakan diperiksa di sini, bukan diserahkan pada penilaian pembacanya:
 * himpunan berisi tiga pertanyaan akan menghasilkan angka yang bergerak
 * 33% tiap satu pertanyaan berubah nasib, dan angka segoyah itu akan dipakai
 * memutuskan hal-hal yang tak layak diputuskan dengannya.
 */
export function validasi(raw: unknown): HimpunanBaku {
  const h = raw as HimpunanBaku;
  if (!h || typeof h !== 'object') throw new GoldenError('himpunan bukan objek');
  if (!h.nama) throw new GoldenError('`nama` wajib');
  if (!Array.isArray(h.pertanyaan)) throw new GoldenError('`pertanyaan` wajib berupa larik');

  const dilihat = new Set<string>();
  for (const p of h.pertanyaan) {
    if (!p.id) throw new GoldenError('tiap pertanyaan wajib punya `id` yang stabil');
    if (dilihat.has(p.id)) throw new GoldenError(`id ganda: ${p.id}`);
    dilihat.add(p.id);
    if (!p.q?.trim()) throw new GoldenError(`pertanyaan ${p.id} kosong`);
    if (!Array.isArray(p.docRefs)) throw new GoldenError(`docRefs ${p.id} bukan larik`);
    if (new Set(p.docRefs).size !== p.docRefs.length) {
      // Duplikat menggelembungkan penyebut recall dan membuat nilainya
      // mustahil mencapai 1 — bug yang tampak seperti sistem yang buruk.
      throw new GoldenError(`docRefs ${p.id} memuat duplikat`);
    }
  }

  if (h.pertanyaan.length < MIN_PERTANYAAN) {
    throw new GoldenError(
      `himpunan terlalu kecil (${h.pertanyaan.length} < ${MIN_PERTANYAAN}) — `
      + 'angkanya akan bergerak terlalu jauh tiap satu pertanyaan berubah nasib');
  }

  const kosong = h.pertanyaan.filter((p) => p.docRefs.length === 0).length;
  if (kosong / h.pertanyaan.length < MIN_RASIO_KOSONG) {
    throw new GoldenError(
      `hanya ${kosong} dari ${h.pertanyaan.length} pertanyaan berjenis "tak ada jawabannya" `
      + `(minimum ${Math.round(MIN_RASIO_KOSONG * 100)}%) — tanpa itu, sistem yang MENGARANG `
      + 'jawaban untuk apa pun akan mendapat nilai sempurna');
  }

  return h;
}

/** Pertanyaan yang jawabannya memang tak ada di korpus. */
export const tanpaJawaban = (p: PertanyaanBaku) => p.docRefs.length === 0;
