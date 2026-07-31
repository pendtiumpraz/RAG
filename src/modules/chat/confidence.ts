import { bahasaBalasan } from './bahasa';
/**
 * KEYAKINAN JAWABAN — dan kenapa ia BUKAN angka persen.
 *
 * ═══ HASIL PENGUKURAN YANG MENENTUKAN BENTUK BERKAS INI ═══
 *
 * Rancangan yang paling wajar untuk fitur ini adalah menampilkan skor
 * kemiripan teratas sebagai "tingkat keyakinan". Itu DIUKUR pada korpus
 * produksi (31 Jul 2026, 8 pertanyaan berjawab melawan 8 yang jawabannya
 * memang tak ada), dan hasilnya menutup pintu itu:
 *
 *   sinyal              berjawab          tak ada di korpus
 *   skor teratas        0,420–0,581       0,382–0,546      ← bertindih
 *   jurang ke tetangga  −0,100–0,090      −0,009–0,079     ← bertindih,
 *                       (rata 0,006)      (rata 0,037)       dan TERBALIK
 *   jarak ke rata-rata  −0,010–0,077      −0,002–0,066     ← praktis sama
 *
 * Tak satu pun memisahkan. Yang paling menyesatkan: jurang skor justru
 * lebih LEBAR pada pertanyaan yang jawabannya tak ada — kebalikan dari
 * dugaan siapa pun.
 *
 * Artinya pengukur keyakinan berbasis skor retrieval akan terlihat presisi
 * sambil menampilkan angka acak: ia akan memberi "83% yakin" pada pertanyaan
 * yang jawabannya sama sekali tak ada di korpus. Itu bukan sekadar tak
 * berguna — itu persis "kepercayaan yang salah tempat" yang fitur ini ada
 * untuk mencegahnya. Jadi tak dibuat.
 *
 * ═══ YANG BENAR-BENAR BEKERJA ═══
 *
 * Satu sinyal terbukti memisahkan, dan ia sudah ada di pipeline: PENOLAKAN
 * MODEL. Diukur pada himpunan yang sama — 5 dari 5 pertanyaan tanpa jawaban
 * ditolak dengan benar, nol karangan. Mode kepatuhan ketat memang bekerja.
 *
 * Yang RUSAK bukan deteksinya, melainkan cara jawabannya disajikan: setiap
 * potongan yang terambil jadi sitasi, TERMASUK saat jawabannya menolak. Jadi
 * kalimat "tidak ada di dokumen" dikirim beserta enam chip sitasi, dan di
 * layar itu terbaca sebagai "jawaban ini bersumber dari enam dokumen".
 * Sitasi pada sebuah penolakan tidak mendukung apa pun — ia hanya daftar
 * dokumen yang KEBETULAN paling dekat, dan menampilkannya seperti bukti
 * adalah bentuk kepercayaan salah tempat yang paling halus.
 */

/**
 * DUA SINYAL DALAM SATU KALIMAT — pengingkaran ketersediaan + rujukan sumber.
 *
 * Dipindah ke sini dari modul eval (31 Jul 2026) karena arah
 * ketergantungannya salah: produk yang MEMILIKI perilakunya, eval yang
 * MENGUKUR. Eval mengimpor dari sini, bukan sebaliknya — kalau terbalik,
 * mematikan modul eval akan ikut mematikan penyajian jawaban.
 *
 * Menuntut keduanya menjaga ketajaman: "saya tidak tahu" saja tak dihitung
 * menolak, karena itu belum tentu penolakan berbasis dokumen — bisa jadi
 * model sekadar bingung, dan itu perilaku lain.
 */
const INGKAR_ADA = /\b(tidak|tak|belum|bukan)\b[^.!?]{0,40}?\b(ada|tersedia|ditemukan|terdapat|tercantum|disebut\w*|dijelaskan|dimuat|memuat|menyebut\w*|berisi)\b/i;
const INGKAR_ADA_EN = /\b(no|not|does\s?n[o']t|do\s?n[o']t|cannot|can[o']t|unable)\b[^.!?]{0,40}?\b(information|data|mention\w*|found|availab\w*|specif\w*|provid\w*|stat\w*|contain\w*|includ\w*|detail\w*|list\w*|indicat\w*|find)\b/i;
const RUJUK_SUMBER = /\b(dokumen|berkas|konteks|sumber|document|documents|context|sources?|provided|given)\b/i;

/** Pecah jadi kalimat. Kasar dengan sengaja — yang dibutuhkan hanya batas. */
const kalimat = (t: string) => t.split(/(?<=[.!?])\s+|\n+/).filter((s) => s.trim());

/**
 * Apakah jawaban ini MENOLAK menjawab karena dokumennya tak memuatnya?
 *
 * Jawaban kosong dihitung menolak: tak ada yang diklaim, jadi tak ada yang
 * bisa dikarang.
 */
export function deteksiPenolakan(jawaban: string): boolean {
  const t = jawaban.trim();
  if (!t) return true;
  return kalimat(t).some((s) =>
    (INGKAR_ADA.test(s) || INGKAR_ADA_EN.test(s)) && RUJUK_SUMBER.test(s));
}

export type StatusJawaban =
  /** Menjawab, dan ada dokumen yang mendukungnya. */
  | 'bersumber'
  /** Menyatakan jawabannya tak ada di dokumen. */
  | 'tak-ditemukan'
  /** Menjawab TANPA satu pun rujukan — klaim yang tak bisa ditelusuri. */
  | 'tanpa-rujukan';

export interface Keyakinan {
  status: StatusJawaban;
  /**
   * Bolehkah sitasi ditampilkan sebagai PENDUKUNG jawaban ini?
   *
   * false pada penolakan. Dokumen yang terambil tetap dicatat (jejaknya
   * berguna saat menelusuri kenapa sistem tak menemukan apa pun), tapi ia
   * tak boleh tampil seperti bukti — karena tak ada yang dibuktikannya.
   */
  sitasiMendukung: boolean;
}

/**
 * Nilai satu jawaban. TANPA angka persen, dengan sengaja.
 *
 * Tiga keadaan, bukan skala. Skala menuntut kalibrasi yang datanya
 * menunjukkan tidak ada; tiga keadaan hanya menuntut hal yang benar-benar
 * bisa dibedakan.
 */
export function nilaiKeyakinan(jawaban: string, jumlahSitasi: number): Keyakinan {
  if (deteksiPenolakan(jawaban)) {
    return { status: 'tak-ditemukan', sitasiMendukung: false };
  }
  if (jumlahSitasi === 0) {
    return { status: 'tanpa-rujukan', sitasiMendukung: false };
  }
  return { status: 'bersumber', sitasiMendukung: true };
}

/** Kalimat pendek untuk UI. Menyebut KEADAANNYA, bukan angka. */
export const LABEL_STATUS: Record<StatusJawaban, string> = {
  bersumber: 'Bersumber dari dokumen',
  'tak-ditemukan': 'Tidak ditemukan di dokumen',
  'tanpa-rujukan': 'Tanpa rujukan dokumen',
};

/* ── penolakan tanpa konteks ────────────────────────────────────────── */

/**
 * Kalimat penolakan saat retrieval mengembalikan NOL potongan pada mode
 * grounding ketat.
 *
 * Ditulis di sini, bukan diminta ke model. Pada `strict` + nol potongan,
 * jawabannya sudah pasti penolakan — tak ada satu pun kalimat yang boleh
 * disusun model, karena tak ada apa pun untuk disandarkan. Memanggil model
 * hanya untuk mendengarkannya berkata "tidak ada di dokumen" membakar satu
 * giliran penuh demi keluaran yang sudah diketahui sebelum panggilan dimulai.
 *
 * Bahasanya mengikuti penanya. Kalimat tetap berbahasa Indonesia akan
 * merusak kepatuhan bahasa yang justru baru diperbaiki — dan penolakan
 * berbahasa asing terasa seperti kerusakan, bukan seperti jawaban.
 */
export function penolakanTanpaKonteks(pertanyaan: string): string {
  return bahasaBalasan(pertanyaan) === 'en'
    ? 'I could not find anything about this in the available documents, '
      + 'so I cannot answer it. Try rephrasing the question, or ask about a topic '
      + 'covered by this knowledge base.'
    /* Kalimatnya sengaja memakai bentuk "tidak ditemukan … dokumen".
       deteksiPenolakan() menuntut DUA sinyal dalam satu kalimat — pengingkaran
       ketersediaan DAN rujukan sumber — dan bentuk itulah yang dikenalinya.
       Kalimat pertama yang saya tulis ("tidak menemukan apa pun") lolos dari
       pendeteksi, sehingga penolakan ini akan dinilai sebagai jawaban biasa
       tanpa sitasi. Yang disesuaikan wordingnya, BUKAN pendeteksinya:
       pendeteksi itu sudah diukur pada korpus produksi, dan melonggarkannya
       demi satu kalimat berarti mengubah penilaian seluruh jawaban. */
    : 'Informasi ini tidak ditemukan di dalam dokumen yang tersedia, jadi saya '
      + 'tidak bisa menjawabnya. Coba ubah kalimat pertanyaannya, atau tanyakan '
      + 'hal yang memang dibahas di basis pengetahuan ini.';
}
