/**
 * SINKRONISASI YANG MANDEK — mengenali dan melepaskannya.
 *
 * KEJADIAN NYATA (1 Agu 2026, produksi). Satu sumber Drive berisi 150 berkas
 * disinkronkan. Fungsi Vercel-nya dibatasi 60 detik (`maxDuration` di
 * api/sources/[id]/sync); mengunduh, mengekstrak, dan meng-embed 150 berkas
 * jelas lebih lama dari itu. Lambda-nya dibunuh di tengah jalan setelah 17
 * berkas masuk — dan TAK ADA yang mengembalikan status barisnya.
 *
 * Akibatnya bukan sekadar sync yang gagal, melainkan sync yang GAGAL SAMBIL
 * TERLIHAT BERJALAN: baris itu tinggal 'syncing' selamanya, tombol Sync tak
 * bisa ditekan lagi, dan halaman terus menyegarkan diri menunggu kabar yang
 * tak akan pernah datang. Pemiliknya menunggu delapan belas menit sebelum
 * menyadari ada yang salah — dan satu-satunya jalan keluar saat itu adalah
 * mengubah baris lewat SQL.
 *
 * Yang diperbaiki di sini: keadaan itu punya BATAS WAKTU. Lewat batas, ia
 * dilepas otomatis jadi 'error' dengan sebab yang tertulis, dan tombolnya
 * bisa ditekan lagi. Sync bersifat DELTA, jadi menjalankannya ulang meneruskan
 * dari berkas ke-18, bukan mengulang dari nol.
 */

/**
 * Batas waktu fungsi sinkronisasi (detik) — SAMA dengan `maxDuration` di
 * api/sources/[id]/sync/route.ts.
 *
 * Ditulis di sini juga karena angka yang tercecer di dua tempat akan berbeda
 * suatu hari, dan yang lebih kecil akan melepas sinkronisasi yang sebenarnya
 * masih berjalan — persis kesalahan yang paling merugikan: pekerjaan yang
 * sedang berjalan ditandai gagal, lalu diulang dari awal oleh orang yang
 * mengira ia memang gagal.
 */
export const BATAS_FUNGSI_DETIK = 60;

/**
 * Berapa lama sesudah batas fungsi sebelum sebuah baris dianggap mandek.
 *
 * Kelonggarannya besar DENGAN SENGAJA. Salah menilai ke arah "terlalu cepat"
 * jauh lebih mahal: ia menghentikan pekerjaan yang masih hidup. Salah ke arah
 * "terlalu lambat" cuma membuat orang menunggu beberapa menit lagi sebelum
 * tombolnya kembali bisa ditekan.
 */
export const KELONGGARAN_DETIK = 120;

export const AMBANG_MANDEK_DETIK = BATAS_FUNGSI_DETIK + KELONGGARAN_DETIK;

export const PESAN_MANDEK =
  'Sinkronisasi berhenti karena melewati batas waktu fungsi. Berkas yang '
  + 'sudah masuk TIDAK hilang — jalankan Sync lagi untuk melanjutkan dari '
  + 'berkas berikutnya, karena sync bersifat delta dan tak mengunduh ulang '
  + 'yang sudah ada.';

/**
 * Apakah baris ini mandek.
 *
 * `null` pada `updatedAt` dianggap TIDAK mandek: baris tanpa cap waktu berarti
 * kita tak tahu apa-apa tentangnya, dan menebak "sudah mati" pada sesuatu yang
 * tak diketahui adalah cara paling mudah menghentikan pekerjaan yang benar.
 */
export function mandek(
  status: string,
  updatedAt: Date | string | null | undefined,
  sekarang: Date = new Date(),
): boolean {
  if (status !== 'syncing' || !updatedAt) return false;
  const t = new Date(updatedAt).getTime();
  if (Number.isNaN(t)) return false;
  return (sekarang.getTime() - t) / 1000 > AMBANG_MANDEK_DETIK;
}
