/**
 * KUERI LEKSIKAL — mengubah pertanyaan manusia jadi tsquery yang berguna.
 *
 * MASALAH YANG DIPERBAIKI. Sebelumnya kaki leksikal memakai
 * `plainto_tsquery('simple', pertanyaan)`, dan itu menggabungkan SELURUH
 * kata dengan AND. Karena konfigurasinya `simple` — dipilih dengan sengaja,
 * sebab Postgres tak punya kamus bahasa Indonesia — tak ada satu pun
 * stopword yang dibuang. Akibatnya kata tanya ikut jadi syarat WAJIB:
 *
 *   "berapa NPWP perusahaan"  → 'berapa' & 'npwp' & 'perusahaan' → 0 potongan
 *   "NPWP"                    → 'npwp'                           → 3 potongan
 *
 * Terukur di korpus produksi 31 Jul 2026: tiga dari empat pertanyaan alami
 * mencocoki NOL potongan. Kaki leksikal praktis mati, penggabungan peringkat
 * jatuh ke vektor murni, dan hybrid search yang dijual tiga kaki berjalan
 * satu setengah — dengan yang mati justru kaki yang seharusnya menangkap
 * nomor kontrak, nama orang, dan kode pasal.
 *
 * PERBAIKANNYA: buang kata fungsi, gabungkan sisanya dengan OR.
 *
 * Kenapa OR dan bukan AND, sekalipun sesudah stopword dibuang: pertanyaan
 * "kode dan nama KBLI perusahaan" menyisakan `kode & kbli & perusahaan`, dan
 * potongan yang memuat "Kode KBLI: 58200" tanpa kata "perusahaan" tetap
 * gugur. OR tidak mengorbankan ketepatan karena `ts_rank_cd` sudah menilai
 * potongan yang mencocoki LEBIH BANYAK istilah lebih tinggi — jadi urutannya
 * tetap benar, hanya saja yang cocok sebagian tak lagi dibuang mentah-mentah.
 * Penggabungan peringkat RRF di hilir juga bekerja atas POSISI, jadi cocokan
 * lemah menyumbang sedikit dan tak merusak apa pun.
 */

/**
 * Kata yang dibuang sebelum membangun kuery.
 *
 * Dua kelompok, dan keduanya perlu:
 *  • KATA TANYA — "berapa", "siapa", "apa", "what", "who". Ia menyatakan
 *    BENTUK pertanyaan, tak pernah muncul di dokumen resmi, dan pada mode
 *    AND ialah yang paling sering membunuh seluruh hasil.
 *  • KATA FUNGSI — "yang", "dan", "the", "of". Ada di hampir setiap
 *    potongan, jadi ia tak membedakan apa pun sambil menambah derau.
 *
 * Daftar ini SENGAJA pendek dan jelas. Daftar stopword yang panjang mulai
 * membuang kata yang kadang justru menentukan ("pusat", "utama", "induk"),
 * dan kehilangan satu kata kunci lebih mahal daripada menyimpan satu kata
 * umum yang toh nilainya rendah di ts_rank_cd.
 */
const KATA_ABAIKAN = new Set([
  // kata tanya & penanda kalimat tanya — Indonesia
  'apa', 'apakah', 'siapa', 'siapakah', 'berapa', 'berapakah', 'kapan',
  'mana', 'dimana', 'di', 'ke', 'dari', 'bagaimana', 'kenapa', 'mengapa',
  'adakah', 'bisakah', 'tolong', 'sebutkan', 'jelaskan', 'carikan',
  // kata fungsi — Indonesia
  'yang', 'dan', 'atau', 'untuk', 'dengan', 'pada', 'dalam', 'oleh',
  'adalah', 'ialah', 'itu', 'ini', 'ada', 'juga', 'saja', 'akan', 'sudah',
  'telah', 'punya', 'milik', 'tentang', 'terhadap', 'sebagai', 'agar',
  // kata tanya & fungsi — Inggris
  'what', 'who', 'whom', 'whose', 'when', 'where', 'which', 'how', 'why',
  'is', 'are', 'was', 'were', 'the', 'a', 'an', 'of', 'for', 'with', 'in',
  'on', 'at', 'to', 'and', 'or', 'that', 'this', 'these', 'those', 'does',
  'do', 'did', 'can', 'could', 'would', 'should', 'please', 'tell', 'me',
  'about', 'there', 'their', 'its', 'it', 'be', 'been', 'has', 'have', 'had',
]);

/** Panjang minimum sebuah token supaya dianggap membawa arti. */
const MIN_PANJANG = 2;
/** Atap jumlah istilah — pertanyaan panjang tak boleh melahirkan kuery raksasa. */
const MAX_ISTILAH = 12;

/**
 * Pertanyaan → tsquery ber-OR, atau `null` bila tak ada kata isi sama sekali.
 *
 * `null` berarti pemanggil harus MELEWATI kaki leksikal seluruhnya — bukan
 * mengirim kuery kosong. Perilaku itu memang benar: pertanyaan yang isinya
 * hanya kata tanya ("apa itu?") tak punya istilah untuk dicari, dan
 * penggabungan peringkat jatuh ke vektor, persis seperti seharusnya.
 *
 * Keluarannya hanya berisi [a-z0-9] dan pemisah ` | `, jadi aman dikirim ke
 * `to_tsquery` — tapi ia tetap dikirim sebagai PARAMETER, bukan dirangkai ke
 * dalam SQL. Membangun string yang "sudah pasti aman" lalu menempelkannya
 * adalah kebiasaan yang cepat atau lambat dipakai pada string yang ternyata
 * tidak aman.
 */
export function lexicalTsquery(pertanyaan: string): string | null {
  const token = (pertanyaan.toLowerCase().match(/[a-z0-9]+/g) ?? [])
    .filter((t) => t.length >= MIN_PANJANG && !KATA_ABAIKAN.has(t));

  // Duplikat dibuang: "izin usaha izin lokasi" tak perlu menyebut 'izin' dua
  // kali, dan tsquery yang mengulang istilah tidak menaikkan peringkatnya.
  const unik = [...new Set(token)].slice(0, MAX_ISTILAH);
  return unik.length ? unik.join(' | ') : null;
}
