/**
 * PEMOTONG TEKS — memotong di batas MAKNA, bukan di hitungan karakter.
 *
 * Versi sebelumnya sudah memilih batas kalimat (`. ` atau baris kosong), dan
 * itu benar sejauh yang ia jangkau. Yang tak dijangkaunya adalah bentuk teks
 * yang justru paling sering ditanyakan orang di dokumen perkantoran:
 *
 *   TABEL   Terukur pada tabel 16 baris dengan jendela 400 karakter:
 *           potongan kedua memuat lima baris tabel TANPA satu pun baris
 *           kepala. Model lalu menerima "| 12 | Item 12 | 12000 |" tanpa
 *           tahu kolom itu artinya apa — dan jawaban yang lahir darinya
 *           menyebut angka tanpa menyebut angka apa. Ini kegagalan yang
 *           paling mahal karena hasilnya TERLIHAT masuk akal.
 *   PASAL   "Pasal 12" bisa berakhir di ujung sebuah potongan sementara
 *           isinya ada di potongan berikutnya, sehingga tak satu pun
 *           potongan menjawab "apa bunyi Pasal 12".
 *   SINGKATAN  "No. 45" dan "Jl. Sudirman" adalah titik-spasi yang bukan
 *           akhir kalimat; memotong di sana membelah satu keterangan jadi
 *           dua.
 *
 * TIGA PERBAIKAN, dan yang pertama paling menentukan:
 *   1. Baris kepala tabel DIULANG di tiap potongan lanjutan.
 *   2. Batas dipilih menurut PRIORITAS makna, bukan sekadar yang terdekat.
 *   3. Titik singkatan tak dihitung sebagai akhir kalimat.
 *
 * Mengulang kepala tabel menambah sedikit duplikasi, dan itu ditukar dengan
 * sadar: potongan yang berdiri sendiri jauh lebih berguna bagi retrieval
 * daripada potongan yang hemat tapi tak bisa dibaca tanpa tetangganya —
 * karena tetangganya belum tentu ikut terambil.
 */

/** Titik yang BUKAN akhir kalimat. Memotong di sini membelah satu keterangan. */
const SINGKATAN = [
  'no', 'nomor', 'jl', 'jln', 'gg', 'rp', 'dr', 'ir', 'hj', 'kh', 'st',
  'drs', 'prof', 'a.n', 'u.b', 'u.p', 'dll', 'dsb', 'dst', 'hal', 'tgl',
  'yth', 'sdr', 'pt', 'cv', 'ud', 'no.urut', 'vol', 'ed', 'cet',
];
const SINGKATAN_RE = new RegExp(
  `\\b(${SINGKATAN.map((s) => s.replace(/\./g, '\\.')).join('|')})\\.$`, 'i');

/** Baris yang termasuk bagian dari sebuah tabel. */
export function barisTabel(baris: string): boolean {
  const t = baris.trim();
  if (!t) return false;
  // Tabel markdown/pipa, garis pemisah, atau baris ber-tab (hasil ekstraksi
  // XLSX dan sebagian PDF).
  return (t.startsWith('|') && t.endsWith('|'))
    || /^\|?[\s:-]*[-:]{3,}[\s|:-]*\|?$/.test(t)
    || (t.includes('\t') && t.split('\t').filter(Boolean).length >= 2);
}

/** Awal bagian baru: judul pasal, bab, atau nomor berjenjang. */
export function awalBagian(baris: string): boolean {
  const t = baris.trim();
  if (!t) return false;
  return /^(pasal|bab|bagian|paragraf|lampiran|article|section|chapter)\s+[\dIVXLC]+/i.test(t)
    /* Penomoran BERJENJANG saja (1.2, 1.2.3) — bukan "1." tunggal.
       Versi pertama menerima "1." dan akibatnya setiap BUTIR DAFTAR dianggap
       awal bagian; pada daftar KBLI yang tiap barisnya bernomor, pemotong
       lalu ingin memutus di hampir setiap baris. Daftar bernomor adalah isi
       yang menyambung, bukan sekumpulan bagian — memutusnya di tiap butir
       memecah satu tabel kode jadi belasan potongan tanpa makna. */
    || /^\d+\.\d+(\.\d+)*[.)]?\s+\S/.test(t)
    || /^[A-Z]\.\s+\S/.test(t)                    // A. Ketentuan
    || /^#{1,6}\s+\S/.test(t);                    // markdown heading
}

/**
 * Baris KEPALA dari blok tabel yang dimulai di `mulai`.
 *
 * Maksimum dua baris: satu baris nama kolom dan satu baris pemisah. Mengambil
 * lebih banyak berisiko menyeret baris DATA pertama sebagai kepala, dan
 * mengulang data sebagai kepala jauh lebih menyesatkan daripada tak mengulang
 * apa pun.
 */
function kepalaTabel(baris: string[], mulai: number): string[] {
  const out: string[] = [];
  for (let i = mulai; i < Math.min(mulai + 2, baris.length); i++) {
    if (!barisTabel(baris[i])) break;
    out.push(baris[i]);
  }
  return out;
}

/** Apakah posisi `i` (indeks di dalam `teks`) berada di dalam blok tabel? */
function indeksBarisDi(teks: string, pos: number): number {
  return teks.slice(0, pos).split('\n').length - 1;
}

/**
 * Cari titik potong TERBAIK di dalam jendela [minEnd, maxEnd].
 *
 * Prioritas menurun. Yang pertama ketemu menang, bukan yang paling dekat ke
 * `maxEnd`: potongan yang sedikit lebih pendek tapi utuh maknanya selalu
 * lebih berguna daripada potongan penuh yang terbelah di tengah kalimat.
 */
function cariBatas(teks: string, minEnd: number, maxEnd: number): number | null {
  const jendela = teks.slice(minEnd, maxEnd);

  // 1 · baris kosong = batas paragraf
  const kosong = jendela.lastIndexOf('\n\n');
  if (kosong > 0) return minEnd + kosong + 2;

  /* 2 · awal bagian baru (Pasal / BAB / 1.2) — potong SEBELUM judulnya,
        supaya judul selalu menempel pada isinya.

        Yang dipakai judul TERAKHIR di jendela, bukan yang pertama. Versi
        pertama mengembalikan yang pertama ketemu, dan karena pencarian
        dimulai di separuh jendela, potongannya sering berhenti tepat di
        situ — terukur pada korpus produksi: 39 potongan jadi 45, naik 15%
        tanpa satu pun tambahan makna. Pada produk yang kuota Free-nya 10
        potongan, pemborosan itu langsung terasa di tagihan pelanggan. */
  const barisJendela = jendela.split('\n');
  let jalan = 0, terakhir: number | null = null;
  for (let i = 1; i < barisJendela.length; i++) {
    jalan += barisJendela[i - 1].length + 1;
    if (awalBagian(barisJendela[i])) terakhir = minEnd + jalan;
  }
  if (terakhir != null) return terakhir;

  // 3 · akhir kalimat sungguhan (bukan titik singkatan)
  for (let i = jendela.length - 2; i > 0; i--) {
    if (jendela[i] !== '.' || !/\s/.test(jendela[i + 1])) continue;
    const sebelum = jendela.slice(Math.max(0, i - 12), i + 1);
    if (SINGKATAN_RE.test(sebelum)) continue;      // "No." / "Jl." — bukan akhir
    return minEnd + i + 2;
  }

  // 4 · ganti baris biasa
  const nl = jendela.lastIndexOf('\n');
  if (nl > 0) return minEnd + nl + 1;

  return null;
}

/**
 * Potong teks jadi bagian ±`size` karakter dengan tumpang tindih `overlap`.
 *
 * Kontrak yang TIDAK boleh berubah, karena pernah dilanggar dan akibatnya
 * mematikan: potongan terakhir harus menghentikan loop. Tanpa itu
 * `start = end - overlap` mundur ke posisi yang sama dan loop berputar
 * selamanya untuk SEMUA teks lebih panjang dari `size` — heap penuh potongan
 * identik lalu OOM, dan di lambda ia mati sunyi dengan sync macet di status
 * 'syncing'. Tak pernah ketahuan karena seluruh uji lama memakai teks pendek.
 */
export function chunkText(text: string, size = 800, overlap = 120): string[] {
  const clean = text.replace(/\r\n/g, '\n').trim();
  if (clean.length <= size) return clean ? [clean] : [];

  const semuaBaris = clean.split('\n');
  const chunks: string[] = [];
  let start = 0;

  while (start < clean.length) {
    const maxEnd = Math.min(start + size, clean.length);
    let end = maxEnd;

    if (end < clean.length) {
      // Batas dicari mulai dari separuh jendela: potongan yang jauh lebih
      // pendek dari `size` memboroskan ruang konteks tanpa menambah makna.
      const batas = cariBatas(clean, start + Math.floor(size * 0.5), maxEnd);
      if (batas != null && batas > start) end = batas;
    }

    let isi = clean.slice(start, end).trim();

    /* KEPALA TABEL DIULANG. Kalau potongan ini dimulai di tengah blok tabel,
       baris nama kolomnya ada di potongan SEBELUMNYA — dan potongan ini
       sendirian tak bisa dibaca siapa pun. Diulang di depan, ditandai
       apa adanya supaya tak terbaca sebagai baris data. */
    if (start > 0 && isi && barisTabel(isi.split('\n')[0])) {
      const iBaris = indeksBarisDi(clean, start);
      let awalTabel = iBaris;
      while (awalTabel > 0 && barisTabel(semuaBaris[awalTabel - 1])) awalTabel--;
      const kepala = kepalaTabel(semuaBaris, awalTabel);
      // Hanya bila kepalanya memang belum ada di potongan ini.
      if (kepala.length && !isi.startsWith(kepala[0].trim())) {
        isi = `${kepala.join('\n')}\n${isi}`;
      }
    }

    if (isi) chunks.push(isi);
    if (end >= clean.length) break;
    // `end` DIJAMIN maju: cariBatas tak pernah mengembalikan nilai ≤ start,
    // dan overlap tak boleh menariknya mundur melewati start.
    start = Math.max(start + 1, end - overlap);
  }
  return chunks.filter(Boolean);
}
