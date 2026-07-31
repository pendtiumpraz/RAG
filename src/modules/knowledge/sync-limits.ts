/**
 * BATAS SYNC — berbeda di lambda dan di pekerja yang hidup terus.
 *
 * Angka-angka ini bukan pilihan gaya; ia turunan langsung dari tenggat
 * permintaan HTTP. Di Vercel sebuah fungsi dipaksa selesai dalam 60 detik dan
 * DIBEKUKAN begitu responsnya terkirim, jadi setiap jalan harus muat di
 * jendela itu — 150 berkas per jalan adalah kompromi antara "cukup banyak
 * untuk maju" dan "cukup sedikit untuk selesai".
 *
 * Terhitung dari batas itu sendiri: korpus 700 GB berarti ±3,1 juta dokumen,
 * dan 150 berkas per jalan menjadikannya ±20.589 kali jalan — ±14 hari
 * nonstop bila dipicu cron tiap menit DAN setiap putaran sukses penuh. Yang
 * menghalangi bukan kapasitas: indeks korpus sebesar itu kini hanya 2,5 GB
 * dan MELAYANI pertanyaan dari Vercel sudah muat. Yang tak ada adalah proses
 * latar yang hidup terus.
 *
 * JENDELA LISTING LEBIH MENENTUKAN LAGI, dan ini yang paling mudah luput:
 * dengan 3,1 juta berkas, batas 2.000 membuat listing SELALU terpotong —
 * dan `planDelta` sengaja MELEWATI penghapusan ketika listing terpotong,
 * karena berkas di luar jendela belum tentu benar-benar hilang. Artinya pada
 * korpus besar, berkas yang dihapus di Drive tak pernah hilang dari knowledge
 * base. Bukan bug: penahan yang benar, dipasang pada batas yang salah.
 *
 * OPT-IN EKSPLISIT, BUKAN TEBAKAN. Menebak "apakah aku di lambda?" dari
 * variabel lingkungan gagal ke arah yang paling mahal: salah menebak
 * "pekerja" saat sebenarnya di lambda membuat SETIAP sync kehabisan waktu di
 * tengah jalan, dan gagalnya tak terlihat sebagai salah konfigurasi melainkan
 * sebagai sync yang rusak. Jadi mode pekerja hanya menyala bila dinyatakan.
 */

export interface BatasSync {
  /** Berkas yang diunduh + di-embed per satu kali jalan. */
  ingestPerRun: number;
  /** Jendela listing metadata; menentukan akurasi deteksi berkas terhapus. */
  listFiles: number;
  /** Nama mode, untuk log dan laporan. */
  mode: 'lambda' | 'pekerja';
}

/** Batas aman untuk fungsi serverless bertenggat 60 detik. */
export const BATAS_LAMBDA: BatasSync = {
  ingestPerRun: 150,
  listFiles: 2_000,
  mode: 'lambda',
};

/**
 * Batas untuk proses yang hidup terus.
 *
 * Tetap BERHINGGA, dan itu disengaja. Tanpa atap sama sekali, satu sync
 * membaca seluruh korpus ke dalam satu rencana sebelum menyentuh berkas
 * pertama — dan pada 3,1 juta berkas itu berarti gagal kehabisan memori
 * sebelum satu dokumen pun masuk. Angka besar yang selesai selalu lebih
 * berguna daripada angka tak terbatas yang mati di tengah.
 */
export const BATAS_PEKERJA: BatasSync = {
  ingestPerRun: 5_000,
  listFiles: 50_000,
  mode: 'pekerja',
};

/** Variabel yang MENYATAKAN mode pekerja. Tak ada penebakan lain. */
export const ENV_PEKERJA = 'NALAR_INGEST_WORKER';

/**
 * `Record<string, string | undefined>`, bukan `NodeJS.ProcessEnv`. Fungsi ini
 * hanya membaca SATU kunci, dan menuntut bentuk penuh ProcessEnv memaksa tiap
 * pemanggil uji menyusun objek lingkungan lengkap hanya untuk memeriksa satu
 * variabel — tipe yang menyulitkan pengujian tanpa menambah keamanan apa pun.
 */
export function batasSync(
  env: Record<string, string | undefined> = process.env,
): BatasSync {
  const v = (env[ENV_PEKERJA] ?? '').trim().toLowerCase();
  // Hanya nilai yang jelas menyatakan "ya". "0", "false", dan string kosong
  // semuanya berarti tidak — variabel yang terlanjur tersetel '0' di suatu
  // tempat tak boleh diam-diam menyalakan mode yang salah.
  return v === '1' || v === 'true' || v === 'yes' ? BATAS_PEKERJA : BATAS_LAMBDA;
}
