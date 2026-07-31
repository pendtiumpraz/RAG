/**
 * TERKA BAHASA sebuah teks — milik PRODUK, bukan milik eval.
 *
 * Dipindahkan dari `modules/eval/policy-checks.ts` dengan alasan yang sama
 * seperti `deteksiPenolakan` dulu: begitu jalur chat ikut memakainya, ia
 * berhenti jadi alat ukur dan jadi perilaku. Alat ukur boleh berubah supaya
 * pengukurannya lebih tajam; perilaku tak boleh berubah diam-diam karena
 * seseorang menyetel evalnya. Eval kini mengimpor dari sini, bukan sebaliknya.
 */

/**
 * Kata fungsi — penanda bahasa yang jauh lebih andal daripada kata isi.
 *
 * Kata isi sering sama di kedua bahasa (nama perusahaan, istilah teknis,
 * nomor pasal), sedangkan kata fungsi hampir tak pernah menyeberang. Itulah
 * sebabnya "PT SAINSKERTA SOLUSI NUSANTARA" tak mengacaukan penilaian.
 */
const KATA_ID = ['yang', 'dan', 'dari', 'untuk', 'dengan', 'pada', 'adalah',
  'tidak', 'ini', 'itu', 'atau', 'dalam', 'akan', 'sudah', 'juga', 'oleh', 'ke'];
const KATA_EN = ['the', 'and', 'of', 'for', 'with', 'is', 'are', 'not',
  'this', 'that', 'or', 'in', 'will', 'has', 'have', 'by', 'to', 'a'];

const hitung = (kata: string[], daftar: string[]) =>
  kata.filter((k) => daftar.includes(k)).length;

/**
 * Terka bahasa: 'id' | 'en' | null bila tak cukup bukti.
 *
 * `null` BUKAN kegagalan pendeteksi — ia jawaban yang jujur untuk teks yang
 * memang tak punya cukup kata fungsi (pertanyaan tiga kata, satu nama, satu
 * angka). Pemanggilnya yang memutuskan apa artinya.
 */
export function deteksiBahasa(teks: string): 'id' | 'en' | null {
  const kata = teks.toLowerCase().match(/[a-z']+/g) ?? [];
  if (kata.length < 6) return null;
  const id = hitung(kata, KATA_ID);
  const en = hitung(kata, KATA_EN);
  // Menuntut selisih, bukan sekadar unggul: campuran istilah Inggris di
  // kalimat Indonesia lazim, dan menang tipis bukan bukti.
  if (id >= en + 2) return 'id';
  if (en >= id + 2) return 'en';
  return null;
}

/**
 * Bahasa yang dipakai membalas, dengan bawaan yang jelas.
 *
 * Pertanyaan pendek — dan pertanyaan memang sering pendek — menghasilkan
 * `null`. Bawaannya Indonesia karena itulah bahasa produk dan mayoritas
 * penggunanya; menebak Inggris untuk teks yang tak terbaca akan membuat
 * pengunjung Indonesia menerima penolakan berbahasa asing.
 */
export function bahasaBalasan(pertanyaan: string): 'id' | 'en' {
  return deteksiBahasa(pertanyaan) === 'en' ? 'en' : 'id';
}
