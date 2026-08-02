/**
 * RERANKER LINTAS-ENCODER — lapisan penilai ulang di atas hasil gabungan.
 *
 * BEDANYA DENGAN LAPISAN SEBELUMNYA. Vektor menilai pertanyaan dan potongan
 * SECARA TERPISAH lalu membandingkan jaraknya; lintas-encoder membaca keduanya
 * BERSAMAAN, jadi ia bisa menilai "apakah potongan ini menjawab pertanyaan
 * ini" alih-alih "apakah keduanya membicarakan topik yang mirip". Untuk
 * pertanyaan yang jawabannya tersirat, bedanya besar.
 *
 * MATI SECARA BAWAAN, dan itu keputusan yang diukur. Pengukuran 31 Jul 2026
 * pada korpus bertemplate 200 dokumen: pertanyaan yang menyebut kode dokumen
 * terjangkau kaki leksikal 100% (rerata peringkat 1,6); pertanyaan berkata-kata
 * saja 81,3%. Artinya reranker membeli perbaikan pada sekitar 19% permintaan,
 * dengan biaya latensi yang ditanggung 100% permintaan. Itu pertukaran yang
 * hanya pantas diambil oleh orang yang MELIHAT 19% itu menyakitkan pada
 * korpusnya sendiri — jadi ia disediakan sebagai saklar, bukan dinyalakan
 * untuk semua orang atas nama angka rata-rata.
 *
 * TIDAK PERNAH DI DALAM TRANSAKSI. Ia memanggil jaringan, dan di Vercel kolam
 * koneksi dipatok max:1 — satu panggilan lambat di dalam transaksi menahan
 * satu-satunya koneksi selama seluruh perjalanan HTTP-nya. Pemanggilnya di
 * retrieval.service sudah berada di luar kedua withTenant()-nya, dan
 * tests/audit-koneksi.test.ts yang menjaga itu tetap begitu.
 */

/** Satu kandidat yang akan dinilai ulang. */
export interface KandidatRerank {
  id: string;
  /** Teks yang dibaca model bersama pertanyaannya. */
  content: string;
  /** Nilai dari tahap sebelumnya (RRF). Dipakai sebagai cadangan. */
  rank: number;
}

export interface HasilRerank {
  id: string;
  /** Nilai relevansi dari model, apa adanya. Skalanya milik penyedia. */
  skor: number;
}

/**
 * Terapkan hasil reranker ke daftar kandidat.
 *
 * MURNI — tanpa jaringan, tanpa waktu, tanpa acak. Seluruh aturan keselamatan
 * di bawah bisa diuji tanpa satu pun panggilan keluar, dan itulah sebabnya
 * bagian ini dipisah dari pemanggilan HTTP-nya.
 *
 * TIGA JAMINAN, dan ketiganya soal apa yang TIDAK boleh terjadi:
 *
 * 1. Tak ada kandidat yang HILANG. Reranker mengembalikan `top_n` teratas
 *    saja; sisanya tetap ikut, di belakang, dengan urutan lamanya. Membuang
 *    yang tak dikembalikan berarti satu jawaban benar bisa lenyap hanya karena
 *    penyedia memotong daftarnya — kegagalan senyap yang mustahil ditelusuri.
 *
 * 2. Tak ada id KARANGAN. Apa pun yang dikembalikan penyedia dan tak ada di
 *    daftar kandidat diabaikan. Tanpa ini, respons yang cacat (atau jahat)
 *    bisa menyuntikkan id ke dalam hasil pencarian.
 *
 * 3. Urutan LAMA yang menentukan saat skornya seri, bukan urutan kedatangan.
 *    Hasil pencarian yang berubah-ubah antar permintaan untuk pertanyaan yang
 *    sama membuat orang berhenti memercayainya, dan tak ada cara memperbaiki
 *    laporan bug yang tak bisa diulang.
 */
export function terapkanRerank(
  kandidat: KandidatRerank[],
  hasil: HasilRerank[],
): KandidatRerank[] {
  const sah = new Map<string, number>();
  const dikenal = new Set(kandidat.map((c) => c.id));
  for (const h of hasil) {
    if (!dikenal.has(h.id)) continue;             // jaminan 2
    if (!Number.isFinite(h.skor)) continue;
    if (!sah.has(h.id)) sah.set(h.id, h.skor);    // yang pertama menang
  }
  if (!sah.size) return kandidat;                 // penyedia tak berguna → biarkan apa adanya

  const urutanLama = new Map(kandidat.map((c, i) => [c.id, i]));
  const dinilai = kandidat.filter((c) => sah.has(c.id));
  const sisa = kandidat.filter((c) => !sah.has(c.id));   // jaminan 1

  dinilai.sort((a, b) => {
    const d = sah.get(b.id)! - sah.get(a.id)!;
    if (d !== 0) return d;
    return urutanLama.get(a.id)! - urutanLama.get(b.id)!; // jaminan 3
  });

  return [...dinilai, ...sisa];
}

/**
 * Pasang ulang nilai `rank` mengikuti urutan baru — TANPA mengubah skalanya.
 *
 * Kenapa perlu sama sekali: tahap sesudah ini (MMR) mengurutkan memakai
 * `rank`, jadi mengembalikan daftar yang urutannya benar tapi `rank`-nya lama
 * akan membuat MMR mengurutkannya kembali dan menghapus seluruh hasil kerja
 * reranker. Reranker memang harus MEMILIKI urutannya.
 *
 * Kenapa tidak memakai skor mentah penyedia: MMR menimbang relevansi lawan
 * keragaman dengan satu lambda yang disetel untuk besaran RRF (~0,02). Skor
 * penyedia berskala 0..1 akan membesarkan suku relevansi puluhan kali dan
 * membuat suku keragaman praktis hilang — hasilnya potongan-potongan mirip
 * yang saling menggantikan, persis yang MMR ada untuk dicegah.
 *
 * Jalan tengahnya: pakai kembali NILAI-NILAI yang sudah ada, hanya
 * dibagikan ulang menurut urutan baru. Sebarannya identik, urutannya berubah.
 */
export function pasangUlangSkala<T extends { rank: number }>(urutBaru: T[]): T[] {
  const nilai = urutBaru.map((x) => x.rank).sort((a, b) => b - a);
  return urutBaru.map((x, i) => ({ ...x, rank: nilai[i] }));
}

/**
 * Berapa kandidat yang dikirim ke reranker.
 *
 * Lebih banyak = peluang lebih besar menemukan yang benar, tapi harganya
 * linear: tiap kandidat adalah satu lintasan model. Batas atas ada supaya
 * pertanyaan pada korpus besar tak diam-diam mengirim ratusan potongan dan
 * membuat satu permintaan chat berbiaya sepuluh kali lipat tanpa ada yang
 * memutuskan begitu.
 */
export const KANDIDAT_MAKS = 24;

export function porsiKandidat(k: number): number {
  return Math.min(KANDIDAT_MAKS, Math.max(k, k * 3));
}
