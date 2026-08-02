/**
 * KUANTISASI BINER — lapisan PENYARING, tidak pernah penentu.
 *
 * ATURAN YANG TAK BOLEH DILANGGAR. Presisi 1 bit menggeser potongan mana yang
 * terambil; potongan yang meleset berubah jadi karangan begitu chatbot tak
 * berada di mode kepatuhan ketat. Karena itu jarak Hamming hanya boleh
 * MEMPERSEMPIT kandidat, dan jarak eksak yang menentukan urutan akhir. Kalau
 * suatu hari ada yang tergoda memakai peringkat biner apa adanya karena "toh
 * hampir sama", yang hilang bukan sedikit ketepatan — melainkan jaminan bahwa
 * jawaban bersandar pada dokumen yang benar-benar paling dekat.
 *
 * BERAPA KANDIDAT YANG DISARING. Inilah satu-satunya angka yang menentukan
 * apakah lapisan ini aman. Terlalu kecil: dokumen yang benar tersingkir di
 * tahap biner dan jarak eksak tak pernah sempat melihatnya — kegagalan senyap
 * yang mustahil disadari, karena hasilnya tetap tampak masuk akal. Terlalu
 * besar: seluruh penghematannya hilang.
 *
 * FAKTOR 8 dipilih, bukan 2 atau 4. Alasannya bukan selera: kuantisasi biner
 * membuang seluruh besaran dan menyisakan tanda tiap dimensi, jadi dua vektor
 * yang arahnya mirip tapi panjangnya berbeda jauh bisa punya jarak Hamming
 * yang sama persis. Cadangan yang lapang jauh lebih murah daripada satu
 * jawaban yang meleset — dan biaya cadangan itu ditanggung indeks yang 32x
 * lebih kecil, jadi 8x kandidat masih 4x lebih hemat daripada tak memakai
 * kuantisasi sama sekali.
 */

/** Pengali kandidat tahap biner terhadap jumlah yang benar-benar dipakai. */
export const FAKTOR_SARING = 8;

/** Batas atas, supaya korpus raksasa tak menarik seluruh isinya ke memori. */
export const SARING_MAKS = 2_000;

/**
 * Berapa baris yang ditarik tahap biner untuk menghasilkan `pool` kandidat.
 *
 * Selalu ≥ pool: menyaring lebih sedikit daripada yang dipakai berarti tahap
 * eksak tak punya apa pun untuk diurutkan, dan hasilnya lebih buruk daripada
 * tak menyaring sama sekali.
 */
export function porsiSaring(pool: number): number {
  if (!Number.isFinite(pool) || pool <= 0) return 0;
  return Math.min(SARING_MAKS, Math.max(pool, Math.ceil(pool * FAKTOR_SARING)));
}

/**
 * Apakah kuantisasi biner dipakai untuk permintaan ini.
 *
 * DUA SYARAT, dan keduanya perlu.
 *
 * 1. Saklar superadmin. Ini keputusan pemasangan, bukan keputusan per-tenant:
 *    yang ditukar adalah waktu lawan ketepatan pada infrastruktur bersama.
 *
 * 2. Korpusnya memang besar. Pada korpus kecil kuantisasi MERUGIKAN — satu
 *    lompatan indeks dan satu pengurutan tambahan, untuk menghindari
 *    pemindaian yang sejak awal murah. Sinyalnya memakai `korpusBesar` yang
 *    SUDAH dihitung jalur retrieval bertingkat, bukan COUNT baru: menambah
 *    satu hitungan baris di jalur terpanas produk untuk memutuskan sebuah
 *    pengoptimalan adalah cara membayar ongkos yang hendak dihemat.
 */
export function layakBiner(nyala: boolean, korpusBesar: boolean): boolean {
  return nyala && korpusBesar;
}
