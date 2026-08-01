/**
 * PILIHAN DI KARTU BACKLOG — keputusan yang bisa dicentang, bukan dijawab
 * lewat percakapan.
 *
 * SEBABNYA. Sembilan kartu berhenti bergerak selama berjam-jam bukan karena
 * pekerjaannya sulit, melainkan karena jawabannya hidup di kepala pemilik
 * produk dan tak punya tempat mendarat. Menjawab lewat percakapan berarti
 * keputusannya menguap bersama percakapan itu: kartu tetap tampak "todo",
 * dan siapa pun yang membacanya besok tak tahu ia sudah diputuskan.
 *
 * BENTUKNYA SENGAJA TEKS BIASA, di dalam kolom `why` yang sudah ada — bukan
 * tabel baru. Tiga alasan, dan yang ketiga paling menentukan:
 *   1. tak perlu migrasi, jadi tak ada risiko skema untuk fitur papan;
 *   2. keputusan dan ALASANNYA tinggal di satu tempat, tak bisa terpisah;
 *   3. yang tercentang tetap terbaca sebagai kalimat oleh manusia MAUPUN
 *      oleh agen yang membaca papan lewat SQL. Kalau pilihannya disimpan
 *      sebagai angka di kolom lain, kartu yang dibaca tanpa aplikasi jadi
 *      tak bisa dimengerti — dan papan ini justru sering dibaca begitu.
 *
 * SINTAKSNYA meniru daftar tugas Markdown supaya tak perlu dipelajari:
 *
 *   PILIHAN (pilih satu):
 *   - ( ) Pakai Redis
 *   - (x) Pakai Postgres
 *
 *   PILIHAN (boleh lebih dari satu):
 *   - [ ] Microsoft Entra
 *   - [x] Google Workspace
 *
 * Kurung BULAT = saling meniadakan (mencentang satu mematikan saudaranya);
 * kurung SIKU = boleh banyak. Bedanya kelihatan sebelum diklik, dan itu
 * penting: orang yang mengira pilihannya tunggal padahal ganda akan mengira
 * ia sudah memutuskan padahal separuhnya masih menggantung.
 */

export interface Pilihan {
  /** Nomor baris opsi di dalam `why`, dihitung dari 0. Ini yang dikirim UI. */
  indeks: number;
  /** Baris di dalam teks (0-based) — dipakai menulis ulang tepat baris itu. */
  baris: number;
  teks: string;
  dipilih: boolean;
  /** true = kurung bulat, saling meniadakan dalam satu blok. */
  tunggal: boolean;
  /** Nomor blok; opsi tunggal hanya saling meniadakan dalam blok yang sama. */
  blok: number;
}

const POLA = /^(\s*)-\s*(\(|\[)([ xX])(\)|\])\s*(.*)$/;
/** Baris judul blok: "PILIHAN (pilih satu):" atau bebas asal diawali PILIHAN. */
const JUDUL = /^\s*PILIHAN\b/i;

/**
 * Baca semua opsi dari sebuah teks `why`.
 *
 * Baris yang bentuknya bukan opsi diabaikan diam-diam — kolom ini berisi
 * prosa panjang, dan pengurai yang cerewet akan menolak kartu yang isinya
 * sah hanya karena ada tanda hubung di tengah kalimat.
 */
export function bacaPilihan(why: string | null | undefined): Pilihan[] {
  if (!why) return [];
  const baris = why.split('\n');
  const out: Pilihan[] = [];
  let blok = 0;
  let didalamBlok = false;

  let adaOpsiDiBlok = false;

  for (let i = 0; i < baris.length; i++) {
    if (JUDUL.test(baris[i])) { blok++; didalamBlok = true; adaOpsiDiBlok = false; continue; }
    const m = POLA.exec(baris[i]);
    if (!m) {
      /* Baris kosong TIDAK memutus blok — daftar opsi sering diberi jarak.
         Prosa memutus, tapi HANYA setelah blok itu punya opsi: judul yang
         terlalu panjang membungkus ke baris kedua, dan baris kedua itu prosa.
         Tanpa syarat ini, tiap judul yang membungkus akan membuang bloknya
         sendiri — opsi di bawahnya jatuh ke blok 0 dan berhenti saling
         meniadakan, persis yang terjadi pada kartu a-landing-demo. */
      if (baris[i].trim() !== '' && adaOpsiDiBlok) didalamBlok = false;
      continue;
    }
    adaOpsiDiBlok = true;
    out.push({
      indeks: out.length,
      baris: i,
      teks: m[5].trim(),
      dipilih: m[3].toLowerCase() === 'x',
      tunggal: m[2] === '(',
      blok: didalamBlok ? blok : 0,
    });
  }
  return out;
}

/**
 * Centang atau lepas satu opsi, kembalikan teks `why` yang baru.
 *
 * MENULIS ULANG SATU BARIS SAJA, bukan menyusun ulang seluruh teks: kolom
 * ini memuat catatan panjang yang mahal ditulis, dan penyusun ulang yang
 * sedikit meleset akan merusak catatan itu tanpa bisa dikembalikan.
 *
 * Melempar bila indeksnya tak ada — bukan diam. Indeks yang tak cocok
 * berarti UI dan basis data melihat kartu yang berbeda (kartu sudah berubah
 * sejak halaman dimuat), dan mencentang "opsi ke-3" pada teks yang sudah
 * bergeser akan memutuskan hal yang sama sekali lain.
 */
export function centang(why: string, indeks: number, pilih: boolean): string {
  const semua = bacaPilihan(why);
  const target = semua.find((p) => p.indeks === indeks);
  if (!target) throw new RangeError(`Opsi ke-${indeks} tidak ada di kartu ini`);

  const baris = why.split('\n');
  const tulis = (p: Pilihan, nilai: boolean) => {
    const m = POLA.exec(baris[p.baris])!;
    baris[p.baris] = `${m[1]}- ${m[2]}${nilai ? 'x' : ' '}${m[4]} ${m[5]}`;
  };

  tulis(target, pilih);

  /* Opsi tunggal: mencentang satu MELEPAS saudaranya di blok yang sama.
     Kalau tidak, dua jawaban yang saling bertentangan bisa tercentang
     bersamaan — dan kartu yang begitu tak lebih menjawab daripada kartu
     yang kosong. Melepas centang TIDAK menyalakan yang lain: "batal
     memilih" adalah keadaan yang sah. */
  if (pilih && target.tunggal) {
    for (const p of semua) {
      if (p.indeks !== indeks && p.tunggal && p.blok === target.blok && p.dipilih) {
        tulis(p, false);
      }
    }
  }
  return baris.join('\n');
}

/** Ringkasan untuk papan: berapa blok yang sudah terjawab. */
export function ringkasPilihan(why: string | null | undefined): {
  total: number; terjawab: number; menunggu: boolean;
} {
  const semua = bacaPilihan(why);
  if (!semua.length) return { total: 0, terjawab: 0, menunggu: false };
  const blok = new Set(semua.map((p) => p.blok));
  let terjawab = 0;
  for (const b of blok) {
    if (semua.some((p) => p.blok === b && p.dipilih)) terjawab++;
  }
  return { total: blok.size, terjawab, menunggu: terjawab < blok.size };
}

/**
 * Teks kartu TANPA baris pilihan dan tanpa judul bloknya.
 *
 * Dipakai kartu ringkas di papan. Sebelum ini kartu ringkas menampilkan
 * `why` apa adanya, jadi baris "- ( ) Tunggu Redis" muncul sebagai teks
 * mati yang PERSIS terlihat seperti pilihan — orang mengkliknya dan tak
 * terjadi apa-apa. Kendali yang tak bisa dipakai lebih buruk daripada tak
 * ada kendali: yang pertama membuat orang mengira produknya rusak.
 */
export function tanpaPilihan(why: string | null | undefined): string {
  if (!why) return '';
  const opsi = new Set(bacaPilihan(why).map((p) => p.baris));
  return why.split('\n')
    .filter((b, i) => !opsi.has(i) && !JUDUL.test(b))
    .join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Awalan penanda catatan bebas dari pemilik produk. */
export const AWALAN_CATATAN = 'CATATAN PEMILIK PRODUK';

/**
 * Tempelkan catatan bebas ke kartu.
 *
 * DITAMBAHKAN DI BAWAH, tak pernah menimpa: catatan yang saling menimpa
 * membuat riwayat pertimbangan hilang, dan justru riwayat itulah yang
 * menjelaskan kenapa sebuah kartu berbelok. Bertanggal supaya urutannya
 * terbaca tanpa perlu tabel terpisah.
 */
export function tempelCatatan(why: string, teks: string, saat: Date): string {
  const bersih = teks.trim();
  if (!bersih) throw new RangeError('Catatan kosong');
  const tanggal = saat.toISOString().slice(0, 10);
  return `${why.trimEnd()}\n\n${AWALAN_CATATAN} (${tanggal}):\n${bersih}\n`;
}
