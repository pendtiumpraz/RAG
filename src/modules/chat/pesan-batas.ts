/**
 * PESAN BATAS untuk endpoint chat PUBLIK.
 *
 * Dua batas berbeda dibalas dengan status HTTP yang sama (429), dan itu
 * disengaja: mengubah statusnya adalah mengubah kontrak API yang sudah
 * dipakai widget terpasang di situs pelanggan. Yang membedakannya adalah
 * `kode` di badan respons — tambahan yang tidak merusak pembaca lama.
 *
 * KENAPA HARUS DIBEDAKAN. Keduanya pernah memakai kalimat yang sama, "coba
 * lagi sebentar". Untuk rate limit itu benar — pulih dalam hitungan detik.
 * Untuk kuota bulanan itu keliru: ia tak akan pulih sampai tanggal 1, dan
 * pengunjung yang memercayainya akan mencoba lagi sepanjang sisa bulan.
 *
 * KENAPA PESAN KUOTA TIDAK MENYEBUT ANGKA. Sebelum ini endpoint publik
 * membalas "Kuota pesan bulan ini habis (5.000 pesan). Upgrade plan untuk
 * lanjut." kepada pengunjung ANONIM mana pun. Kalimat itu membocorkan kuota
 * persis pemilik situs — dan karenanya tingkat paketnya — kepada orang luar,
 * sekaligus menyuruh pengunjung meng-upgrade langganan orang lain. Pesan
 * berangka itu tetap ada, tapi hanya untuk pemiliknya sendiri di halaman
 * Usage dan peringatan kuota.
 */

export type KodeBatas = 'laju' | 'kuota';

/** Pulih dalam hitungan detik — "sebentar" memang benar di sini. */
export const PESAN_LAJU = 'Terlalu banyak permintaan. Coba lagi sebentar.';

/**
 * TIDAK menyebut "sebentar", tidak menyebut angka, tidak menyuruh upgrade.
 * Yang bisa dilakukan pengunjung memang hanya satu: memberi tahu pemiliknya.
 */
export const PESAN_KUOTA = 'Chatbot ini sedang tidak bisa menjawab pertanyaan baru. '
  + 'Coba lagi nanti, atau hubungi pemilik situs ini.';

export function pesanBatas(kode: KodeBatas): string {
  return kode === 'kuota' ? PESAN_KUOTA : PESAN_LAJU;
}
