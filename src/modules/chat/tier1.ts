/**
 * BERAPA DOKUMEN YANG DIAMBIL LAPISAN PERTAMA.
 *
 * KENAPA TIDAK BOLEH ANGKA TETAP. Lapisan pertama memilih N dokumen kandidat
 * dari seluruh korpus; dokumen yang tersingkir di sana TAK AKAN PERNAH dibaca
 * lapisan kedua, dan tak ada satu pun gejala yang muncul. Pada korpus 400
 * dokumen, 120 adalah 30% isi — longgar. Pada korpus 3,5 juta dokumen, 120
 * adalah 0,003%, dan angka yang sama berubah dari "longgar" jadi ATAP RECALL
 * seluruh sistem.
 *
 * MODEL PERTUMBUHANNYA LINEAR, dan itu bukan tebakan — ia tertulis di
 * `modules/eval/tier1.ts` dan bisa diperiksa: bila korpus ditumbuhkan dengan
 * dokumen SEJENIS, jumlah pengganggu yang mengalahkan dokumen benar tumbuh
 * sebanding. Peringkat dokumen benar karena itu tumbuh sebanding pula.
 *
 * KONSEKUENSINYA TAJAM, dan harus ditulis apa adanya: kalau peringkat tumbuh
 * linear, ambang yang mempertahankan recall juga harus tumbuh linear — dan
 * pada 3,5 juta dokumen itu berarti memilih ratusan ribu dokumen, yaitu tidak
 * menyaring sama sekali. Jadi lapisan pertama TIDAK BISA mempertahankan recall
 * di korpus raksasa lewat pembesaran ambang saja. Yang membuatnya bekerja
 * lagi adalah MENGECILKAN KORPUS EFEKTIFNYA — penyaring metadata (folder,
 * ekstensi, rentang waktu, kartu a-prefilter-metadata). Itulah sebabnya kedua
 * kartu ini bersaudara, dan kenapa fungsi di bawah menerima jumlah dokumen
 * SETELAH penyaring, bukan jumlah seluruh korpus.
 *
 * DIUKUR (`npm run eval:tier1 -- --dok=300 --tanya=120`, 2 Agu 2026, MiniLM;
 * proyeksi dari sebaran peringkat nyata, batas atas):
 *
 *     dokumen    ambang   recall adaptif   recall bila tetap 120
 *      10.000       600           80,0%                   45,8%
 *      50.000       600           45,8%                   21,7%
 *     200.000       600           21,7%                   21,7%
 *   3.500.000       600           21,7%                   21,7%
 *
 * Bacaannya jujur, termasuk bagian yang tak menyenangkan: perubahan ini
 * hampir MELIPATGANDAKAN recall pada korpus 10–50 ribu dokumen, dan TIDAK
 * MEMBELI APA PUN di atas ±200 ribu. Di sana ambangnya sudah menabrak atap,
 * dan satu-satunya yang tersisa adalah penyaring metadata. Menuliskan angka
 * 21,7% itu di sini lebih berguna daripada menyembunyikannya di balik rumus
 * yang terlihat pintar — orang berikutnya berhak tahu di mana batasnya.
 */

/**
 * Bagian korpus yang perlu diambil untuk mempertahankan recall.
 *
 * Diukur `npm run eval:tier1` pada korpus sintetis 400 dokumen (31 Jul 2026):
 * recall 95% menuntut 95 dokumen — 23,75% isi korpus. Dibulatkan ke 0,25
 * supaya tak ada yang mengira ketelitiannya lebih tinggi daripada satu
 * pengukuran pada satu korpus.
 *
 * ANGKA INI PESIMIS DI KORPUS BESAR, dan sengaja: proyeksi di eval/tier1.ts
 * menganggap korpus yang tumbuh tetap sejenis, sementara basis pengetahuan
 * sungguhan memburuk lebih cepat — dokumen yang ditambahkan belakangan sering
 * REVISI dari yang sudah ada, dan dokumen kembar adalah pengganggu terkuat
 * yang mungkin.
 */
export const RASIO_KORPUS = 0.25;

/**
 * Batas bawah: nilai yang berlaku sebelum kartu ini.
 *
 * Tak ada korpus yang boleh mendapat lapisan pertama LEBIH SEMPIT daripada
 * hari ini. Perubahan yang membuat sebagian pemasangan lebih buruk demi
 * membuat sebagian lain lebih baik bukan perbaikan; ia cuma memindahkan
 * kerugian ke orang yang tak diajak bicara.
 */
export const TIER1_MIN = 120;

/**
 * Batas atas — anggaran waktu, bukan anggaran ketepatan.
 *
 * Lapisan kedua memindai potongan milik dokumen terpilih. Tiap dokumen
 * perkantoran ±10 potongan, jadi 600 dokumen ≈ 6.000 potongan yang harus
 * dinilai jaraknya di dalam satu permintaan — di lambda berkolam `max: 1`
 * dengan tenggat 60 detik, itu sudah terasa.
 *
 * DI ATAS TITIK INI LAPISAN PERTAMA MEMANG KEHILANGAN RECALL, dan itu ditulis
 * di sini supaya tak ditemukan belakangan sebagai kejutan. Jalan keluarnya
 * BUKAN menaikkan angka ini — melainkan mengecilkan korpus efektifnya lewat
 * penyaring metadata. Menaikkan batas ini tanpa mengukur latensi lambda pada
 * korpus sungguhan hanya memindahkan kegagalan dari "jawaban meleset" ke
 * "permintaan mati di tengah", dan yang kedua jauh lebih sulit didiagnosis.
 */
export const TIER1_MAKS = 600;

/**
 * Ambang lapisan pertama untuk korpus sebesar ini.
 *
 * @param dokumenEfektif jumlah dokumen yang MASIH mungkin terambil setelah
 *   penyaring metadata diterapkan. Bukan ukuran seluruh korpus — penyaring
 *   yang menyempitkan ke 5.000 dokumen membuat ambang 120 masuk akal lagi.
 */
export function tier1Docs(dokumenEfektif: number | null | undefined): number {
  const n = Number(dokumenEfektif);
  /* Tak tahu ukurannya = pakai batas bawah. Menebak besar akan membuat setiap
     korpus kecil membayar biaya korpus besar; menebak kecil akan menurunkan
     recall diam-diam. Yang berlaku hari ini adalah pilihan yang paling tidak
     mengejutkan. */
  if (!Number.isFinite(n) || n <= 0) return TIER1_MIN;
  const perlu = Math.ceil(n * RASIO_KORPUS);
  return Math.min(TIER1_MAKS, Math.max(TIER1_MIN, perlu));
}

/**
 * Apakah ambangnya sedang MENABRAK atap — yaitu korpusnya sudah cukup besar
 * sehingga lapisan pertama diketahui kehilangan recall.
 *
 * Dipakai untuk mencatatnya ke log. Keadaan yang tak pernah dicatat adalah
 * keadaan yang baru diketahui saat ada yang mengeluh jawabannya meleset,
 * berbulan-bulan kemudian, tanpa satu pun jejak yang menghubungkannya.
 */
export function tier1Mentok(dokumenEfektif: number | null | undefined): boolean {
  const n = Number(dokumenEfektif);
  if (!Number.isFinite(n) || n <= 0) return false;
  return Math.ceil(n * RASIO_KORPUS) > TIER1_MAKS;
}
