/**
 * ANGGARAN WAKTU SATU PUTARAN SYNC.
 *
 * KENAPA WAKTU, BUKAN MEGABYTE. Pemilik produk mengusulkan memproses per
 * 500 MB. Diperiksa di kode: RAM tak pernah jadi kendala — sync.service
 * memproses SATU berkas per putaran (unduh → ekstrak → embed → simpan), jadi
 * tak pernah ada dua berkas di memori sekaligus, apalagi 20 GB.
 *
 * Yang mengikat adalah TENGGAT FUNGSI. Buktinya kejadian 1 Agu 2026: 150
 * berkas / ±21 GB, batas berkas per jalan juga 150 — batas itu tak pernah
 * tersentuh; yang tersentuh 60 detik, dan lambda mati di berkas ke-17.
 *
 * Dan megabyte satuan yang buruk untuk waktu: satu PDF pindaian 5 MB bisa
 * memakan 30 detik di ekstraksi + embedding, sementara 500 MB berupa ratusan
 * berkas teks kecil selesai dalam hitungan detik. Membagi per 500 MB
 * menghasilkan putaran yang lamanya acak — sebagian mati di tengah, sebagian
 * berhenti setelah lima detik tanpa alasan.
 *
 * BERHENTI DI ANTARA BERKAS, BUKAN DIBUNUH DI TENGAHNYA. Bedanya bukan soal
 * kerapian: berhenti sendiri berarti `pending` yang dilaporkan adalah angka
 * yang BENAR, statusnya tertulis 'synced' alih-alih menggantung di 'syncing',
 * dan orang tahu persis berapa yang tersisa. Dibunuh di tengah berarti tak
 * ada satu pun dari itu.
 */

/** Tenggat fungsi (detik) — sama dengan maxDuration rute sync. */
export const TENGGAT_DETIK = 60;

/**
 * Bagian tenggat yang boleh dipakai lingkaran ingest.
 *
 * Sisanya untuk hal yang terjadi SETELAH lingkaran: menulis ringkasan,
 * membangun lapisan pertama, memancarkan peristiwa. Menghabiskan seluruh
 * tenggat di lingkaran berarti dibunuh saat merapikan — dan yang hilang
 * justru ringkasan yang memberi tahu orang berapa yang tersisa.
 */
export const PORSI_INGEST = 0.75;

export const ANGGARAN_MS = Math.round(TENGGAT_DETIK * PORSI_INGEST * 1000);

/**
 * Masih boleh mulai memproses satu berkas lagi?
 *
 * Diperiksa SEBELUM berkas berikutnya diambil, bukan sesudah. Memeriksanya
 * sesudah berarti berkas terakhir selalu dimulai di ujung anggaran — dan
 * satu PDF besar di detik ke-44 tetap membuat putaran itu dibunuh.
 *
 * `sisaCadanganMs` memberi ruang untuk berkas yang baru akan dimulai.
 * Nilainya bukan tebakan bulat: ia rata-rata BERGERAK dari berkas yang sudah
 * diproses di putaran ini, jadi korpus berisi PDF berat otomatis berhenti
 * lebih awal daripada korpus berisi teks kecil — tanpa satu pun angka yang
 * harus disetel manusia.
 */
export function masihMuat(input: {
  mulaiMs: number;
  sekarangMs: number;
  sudahDiproses: number;
  anggaranMs?: number;
}): boolean {
  const anggaran = input.anggaranMs ?? ANGGARAN_MS;
  const terpakai = input.sekarangMs - input.mulaiMs;

  /* Berkas pertama SELALU dicoba — DIPERIKSA PALING DULU, mendahului anggaran
     itu sendiri. Kalau pendaftaran berkas sendiri sudah menghabiskan seluruh
     anggaran (sumber dengan ribuan berkas), pemeriksaan anggaran yang
     didahulukan akan menghentikan putaran sebelum satu berkas pun diproses —
     dan putaran yang tak pernah maju lebih buruk daripada putaran yang
     sesekali dibunuh: tombol "Lanjutkan" akan ditekan berkali-kali tanpa
     sisanya pernah berkurang. */
  if (input.sudahDiproses === 0) return true;
  if (terpakai >= anggaran) return false;

  const rata = terpakai / input.sudahDiproses;
  return terpakai + rata <= anggaran;
}
