/**
 * METRIK RETRIEVAL — murni, tanpa basis data, tanpa model.
 *
 * Kenapa metriknya dipisah dari pelarinya: inilah satu-satunya bagian yang
 * bisa DIBUKTIKAN benar. Semua yang lain (kueri, embedding, jawaban model)
 * menuntut basis data dan kunci API untuk diuji, jadi kalau perhitungannya
 * ikut tinggal di sana, tak ada yang akan pernah mengujinya — dan angka eval
 * yang salah hitung lebih berbahaya daripada tak punya angka sama sekali:
 * ia membuat orang yakin pada perubahan yang sebenarnya memburuk.
 *
 * SEMUA fungsi di sini menerima daftar id yang DIURUTKAN peringkat (terbaik
 * lebih dulu) dan himpunan id yang benar. Tak ada yang menyentuh I/O.
 */

/** Satu hasil pencarian, sudah berurut peringkat. */
export type Peringkat = readonly string[];
/** Id yang dinilai benar untuk sebuah pertanyaan. */
export type Kunci = ReadonlySet<string> | readonly string[];

const asSet = (k: Kunci): ReadonlySet<string> =>
  k instanceof Set ? k : new Set(k as readonly string[]);

/**
 * Berapa bagian dari jawaban benar yang berhasil masuk K teratas.
 *
 * INI metrik yang menentukan untuk RAG, dan alasannya sering disalahpahami:
 * dokumen yang tak terambil di tahap pencarian TIDAK PERNAH punya kesempatan
 * kedua — model hanya membaca apa yang dikirimkan padanya. Presisi yang
 * buruk membuat jawaban bertele-tele; recall yang buruk membuat jawaban
 * SALAH, dengan percaya diri, tanpa satu pun tanda.
 */
export function recallAtK(hasil: Peringkat, kunci: Kunci, k: number): number {
  const benar = asSet(kunci);
  if (benar.size === 0) return 1;             // tak ada yang harus ditemukan
  const atas = hasil.slice(0, k);
  let kena = 0;
  for (const id of benar) if (atas.includes(id)) kena++;
  return kena / benar.size;
}

/** Berapa bagian dari K teratas yang memang benar. */
export function precisionAtK(hasil: Peringkat, kunci: Kunci, k: number): number {
  if (k <= 0) return 0;
  const benar = asSet(kunci);
  const atas = hasil.slice(0, k);
  if (atas.length === 0) return 0;
  const kena = atas.filter((id) => benar.has(id)).length;
  // Pembaginya panjang NYATA, bukan k: menghukum sistem yang mengembalikan
  // 3 hasil sempurna saat k=10 berarti menghukumnya karena jujur.
  return kena / atas.length;
}

/**
 * Kebalikan peringkat jawaban benar PERTAMA (0 bila tak ada di daftar).
 *
 * Peka pada posisi teratas dan hampir buta pada ekor — cocok untuk
 * pertanyaan berjawab tunggal ("berapa nomor NIB"), menyesatkan untuk
 * pertanyaan yang jawabannya tersebar di banyak dokumen.
 */
export function reciprocalRank(hasil: Peringkat, kunci: Kunci): number {
  const benar = asSet(kunci);
  for (let i = 0; i < hasil.length; i++) if (benar.has(hasil[i])) return 1 / (i + 1);
  return 0;
}

/**
 * nDCG@k — satu-satunya metrik di sini yang menghargai URUTAN di dalam K.
 *
 * recall@k tak peduli jawaban benar ada di posisi 1 atau 10; nDCG peduli.
 * Itu penting justru karena konteks yang dikirim ke model TERBATAS: pada
 * anggaran 6 potongan, jawaban benar di posisi 8 sama saja dengan tak
 * ditemukan, dan hanya nDCG yang menangkap bedanya.
 */
export function ndcgAtK(hasil: Peringkat, kunci: Kunci, k: number): number {
  const benar = asSet(kunci);
  if (benar.size === 0) return 1;
  let dcg = 0;
  hasil.slice(0, k).forEach((id, i) => {
    if (benar.has(id)) dcg += 1 / Math.log2(i + 2);
  });
  // Ideal: seluruh jawaban benar menempati posisi teratas, sebanyak yang muat.
  let idcg = 0;
  for (let i = 0; i < Math.min(benar.size, k); i++) idcg += 1 / Math.log2(i + 2);
  return idcg === 0 ? 0 : dcg / idcg;
}

export interface SkorPertanyaan {
  recall: number; precision: number; rr: number; ndcg: number;
}

export function skorSatu(hasil: Peringkat, kunci: Kunci, k: number): SkorPertanyaan {
  return {
    recall: recallAtK(hasil, kunci, k),
    precision: precisionAtK(hasil, kunci, k),
    rr: reciprocalRank(hasil, kunci),
    ndcg: ndcgAtK(hasil, kunci, k),
  };
}

export interface Agregat extends SkorPertanyaan {
  /** Berapa pertanyaan yang ikut dirata-rata. */
  n: number;
  /** Pertanyaan yang recall-nya NOL — daftar ini lebih berguna dari rata-ratanya. */
  gagalTotal: number;
}

/**
 * Rata-rata MAKRO — tiap pertanyaan berbobot sama.
 *
 * Bukan mikro (menjumlahkan semua kena lalu membagi semua benar): pertanyaan
 * yang jawabannya tersebar di sepuluh dokumen akan menenggelamkan sembilan
 * pertanyaan berjawab tunggal, dan yang tenggelam justru pertanyaan yang
 * paling sering benar-benar ditanyakan orang.
 */
export function agregat(skor: readonly SkorPertanyaan[]): Agregat {
  const n = skor.length;
  if (n === 0) return { n: 0, recall: 0, precision: 0, rr: 0, ndcg: 0, gagalTotal: 0 };
  const jum = (f: (s: SkorPertanyaan) => number) => skor.reduce((a, s) => a + f(s), 0) / n;
  return {
    n,
    recall: jum((s) => s.recall),
    precision: jum((s) => s.precision),
    rr: jum((s) => s.rr),
    ndcg: jum((s) => s.ndcg),
    gagalTotal: skor.filter((s) => s.recall === 0).length,
  };
}

/* ── perbandingan terhadap garis dasar ──────────────────────────────── */

export interface Regresi {
  metrik: string;
  dasar: number;
  kini: number;
  selisih: number;
  turun: boolean;
}

/**
 * Toleransi penurunan sebelum dianggap REGRESI.
 *
 * Tidak nol, dan itu disengaja. Retrieval memakai HNSW yang bersifat
 * hampiran, dan potongan berskor sama bisa bertukar urutan antar jalan.
 * Ambang nol akan berbunyi pada derau, dan gerbang yang sering berbunyi
 * palsu akan dimatikan orang — lalu tak menjaga apa pun.
 */
export const TOLERANSI = 0.02;

/**
 * Bandingkan hasil sekarang dengan garis dasar tersimpan.
 *
 * Hanya PENURUNAN yang dilaporkan. Kenaikan bukan kabar buruk dan tak perlu
 * menghentikan siapa pun; ia cukup terlihat di tabel hasil.
 */
export function bandingkan(dasar: Agregat, kini: Agregat, toleransi = TOLERANSI): Regresi[] {
  const metrik: Array<keyof SkorPertanyaan> = ['recall', 'precision', 'rr', 'ndcg'];
  const out: Regresi[] = [];
  for (const m of metrik) {
    const selisih = kini[m] - dasar[m];
    out.push({ metrik: m, dasar: dasar[m], kini: kini[m], selisih, turun: selisih < -toleransi });
  }
  /* Pertanyaan yang GAGAL TOTAL diperlakukan berbeda: bertambahnya satu pun
     adalah regresi, tanpa toleransi. Rata-rata bisa tetap bagus sementara
     satu pertanyaan berubah dari terjawab jadi tak terjawab sama sekali —
     dan itu persis bentuk kerusakan yang paling dirasakan pengguna. */
  out.push({
    metrik: 'gagalTotal', dasar: dasar.gagalTotal, kini: kini.gagalTotal,
    selisih: kini.gagalTotal - dasar.gagalTotal,
    turun: kini.gagalTotal > dasar.gagalTotal,
  });
  return out;
}
