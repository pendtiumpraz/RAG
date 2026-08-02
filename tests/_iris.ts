/**
 * IRIS KODE SUMBER — untuk tes yang memverifikasi kode dengan membacanya.
 *
 * KENAPA ADA. Banyak tes di sini menegakkan aturan struktural dengan membaca
 * berkas sumber dan mencocokkan pola di sekitar sebuah penanda. Cara termudah
 * membatasi "di sekitar" adalah menghitung karakter — dan cara itu rusak
 * secara diam-diam:
 *
 *   const blok = SVC.slice(i, i + 900);          // iris-bebas: contoh
 *
 * Jendela 900 karakter bergeser tiap kali satu komentar ditambahkan di
 * atasnya. Lebih buruk lagi, ia bergeser karena hal yang sama sekali BUKAN
 * kode: `tests/divisi.test.ts` menaruh `repo.countActive` di posisi 882 dari
 * 900 — lulus dengan akhiran baris LF, GAGAL begitu berkasnya ditulis ulang
 * dengan CRLF, karena satu byte per baris sudah cukup mendorongnya keluar.
 * Ketahuan tanpa sengaja saat `git checkout` menormalkan akhiran baris.
 *
 * Dua arah kerusakannya sama-sama buruk: tes yang LULUS karena jendelanya
 * kebetulan pas tidak menjaga apa pun, dan tes yang GAGAL karena akhiran
 * baris membuat orang berhenti memercayai seluruh suite.
 *
 * Batas yang benar adalah batas SINTAKSIS — akhir fungsi, awal fungsi
 * berikutnya, penanda kedua — karena itulah batas yang dipahami penulis
 * kodenya juga.
 */

/** Pola pembuka anggota/fungsi berikutnya di dalam sebuah objek layanan. */
/**
 * Kata kunci yang BENTUKNYA sama dengan deklarasi metode.
 *
 * `  if (!model) return;` di dalam badan fungsi tingkat atas terlihat persis
 * seperti `  namaMetode(` di dalam objek. Tanpa pengecualian ini, irisannya
 * berhenti di percabangan pertama — dan tesnya lalu menuduh kode yang sudah
 * benar. Ketahuan saat helper ini baru dipakai untuk memeriksa `mungkinRerank`:
 * dua asersi gagal terhadap kode yang isinya persis seperti yang diminta.
 */
const KATA_KUNCI = /(?:if|for|while|switch|catch|return|do|else|try|await|typeof|new|delete|void|yield)\b/;

const BATAS = [
  new RegExp(`\\n {2}(?!${KATA_KUNCI.source})(?:async )?[a-zA-Z_$][\\w$]*\\s*[(<]`), // metode objek
  /\n {2}(?:export )?function /,
  /\nfunction /,
  /\n {2}useEffect\(/,
  /\nexport /,                                  // deklarasi tingkat atas berikutnya
  /\n\}[)\]]*;/,                                // penutup blok tingkat atas: `}));` `};`
  /\n\}(?:\r?\n|$)/,                            // `}` sendirian — penutup fungsi tingkat atas
];

/**
 * Iris dari `penanda` sampai batas sintaksis berikutnya.
 *
 * @param sumber isi berkas
 * @param penanda teks awal blok (mis. `'async create('`)
 * @param lewati berapa karakter setelah penanda yang tak ikut dicari batasnya
 *   — dipakai bila penandanya sendiri komentar, sehingga batas yang dicari
 *   adalah batas SESUDAH konstruksi yang diterangkannya.
 */
export function irisBlok(sumber: string, penanda: string, lewati = 1): string {
  const i = sumber.indexOf(penanda);
  if (i < 0) throw new Error(`penanda tak ditemukan: ${penanda}`);
  const dari = i + lewati;
  let akhir = -1;
  for (const pola of BATAS) {
    const m = pola.exec(sumber.slice(dari));
    if (m && (akhir < 0 || dari + m.index < akhir)) akhir = dari + m.index;
  }
  /* MELEMPAR, bukan mengembalikan sisa berkas.
     Kalau batasnya tak dikenali dan potongannya diam-diam membentang sampai
     akhir berkas, asersi POSITIF (`/x/.test(blok)`) jadi lolos terlalu mudah —
     ia menemukan `x` di fungsi lain, dan tesnya berhenti menjaga apa pun tanpa
     satu pun tanda. Kejadian nyata saat helper ini baru dipakai: irisan tabel
     `rate_buckets` menembus ke deklarasi berikutnya dan menyeret `tenant_id`
     milik tabel lain. Yang itu KETAHUAN hanya karena asersinya kebetulan
     negatif; yang positif akan lolos diam-diam selamanya. */
  if (akhir < 0) {
    throw new Error(
      `batas blok tak ditemukan sesudah "${penanda}" — tambahkan polanya ke BATAS `
      + 'di tests/_iris.ts, jangan biarkan irisannya membentang sampai akhir berkas');
  }
  return sumber.slice(i, akhir);
}

/** Iris antara dua penanda. Batasnya eksplisit, jadi tak bisa bergeser. */
export function irisAntara(sumber: string, mulai: string, sampai: string): string {
  const i = sumber.indexOf(mulai);
  if (i < 0) throw new Error(`penanda awal tak ditemukan: ${mulai}`);
  const j = sumber.indexOf(sampai, i + mulai.length);
  return sumber.slice(i, j < 0 ? sumber.length : j);
}

/** Iris satu aturan CSS lengkap — dari selektornya sampai `}` penutup. */
export function irisAturanCss(sumber: string, selektor: string): string {
  const i = sumber.indexOf(selektor);
  if (i < 0) throw new Error(`selektor tak ditemukan: ${selektor}`);
  const j = sumber.indexOf('}', i);
  return sumber.slice(i, j < 0 ? sumber.length : j + 1);
}
