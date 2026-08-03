/**
 * TABEL — cari, saring, urutkan, penggal. Satu logika untuk seluruh modul.
 *
 * ADA KARENA setiap halaman bertabel di aplikasi ini menggambar `rows.map()`
 * langsung ke `<tbody>`. Pada data demo itu tak terlihat salah; pada data
 * pelanggan ia berarti seluruh baris dirender sekaligus, tanpa cara mencari,
 * dan tanpa cara tahu ada berapa banyak. Halaman Dokumen sudah punya pencarian
 * & penggalan — tapi punya SENDIRI, di server, dengan bentuk yang berbeda. Dua
 * salinan aturan yang sama akan menyimpang, dan yang menyimpang diam-diam
 * adalah yang tak pernah dites.
 *
 * MURNI, TANPA REACT, supaya bisa diuji tanpa merender apa pun. Komponennya
 * ada di `_components/tabel.tsx` dan hanya membungkus berkas ini.
 *
 * TIGA HAL YANG GAMPANG SALAH, dan karena itu dijaga tes:
 *
 * 1. NOMOR BARIS ITU GLOBAL. Baris pertama halaman 2 bernomor 11, bukan 1.
 *    Menomori dari indeks halaman terlihat benar di halaman pertama — satu-
 *    satunya halaman yang biasanya dilihat saat membangunnya.
 * 2. MENGUBAH PENCARIAN/PENYARING MENGEMBALIKAN KE HALAMAN 1. Tanpa itu,
 *    mengetik kata kunci saat berada di halaman 7 memberi tabel KOSONG, dan
 *    yang membacanya menyimpulkan datanya tak ada — bukan bahwa ia sedang
 *    berdiri di halaman yang sudah tak punya isi.
 * 3. NILAI KOSONG SELALU DI BAWAH, di kedua arah urutan. Kalau kosong ikut
 *    dibalik, membalik urutan "tanggal terakhir sync" akan menaruh sumber yang
 *    BELUM PERNAH sync di puncak — persis tempat mata mencari yang paling baru.
 */

export type Arah = 'naik' | 'turun';

export interface KeadaanTabel {
  q: string;
  saring: Record<string, string>;
  urut: string | null;
  arah: Arah;
  halaman: number;
  ukuran: number;
}

export interface OpsiTabel<T> {
  /** Teks yang ikut dicari. Semua bagiannya digabung, jadi satu kotak cari
   *  cukup untuk nama + email + status sekaligus. */
  cari?: (row: T) => Array<string | null | undefined>;
  /** Nilai yang dibandingkan penyaring, per kunci penyaring. */
  saring?: Record<string, (row: T) => string | null | undefined>;
  /** Nilai yang diurutkan, per kunci kolom. */
  urut?: Record<string, (row: T) => string | number | Date | null | undefined>;
}

export interface HasilTabel<T> {
  /** Baris yang benar-benar digambar. */
  tampil: T[];
  /** Banyak baris SETELAH cari+saring, sebelum dipenggal. */
  total: number;
  /** Banyak baris sebelum apa pun disaring — untuk membedakan "belum ada data"
   *  dari "tak ada yang cocok", dua keadaan kosong yang butuh kalimat berbeda. */
  totalMentah: number;
  halaman: number;
  halamanTotal: number;
  /** Indeks global baris pertama halaman ini (0-based). Nomor baris ke-i
   *  adalah `mulai + i + 1`. */
  mulai: number;
}

export const UKURAN_BAWAAN = 10;
export const PILIHAN_UKURAN = [10, 25, 50, 100] as const;

export function keadaanAwal(ukuran = UKURAN_BAWAAN): KeadaanTabel {
  return { q: '', saring: {}, urut: null, arah: 'naik', halaman: 1, ukuran };
}

/** Casefold + rapikan spasi. Cukup untuk teks Indonesia/Inggris; tak mencoba
 *  melipat diakritik karena bahasa yang dipakai produk ini tak memerlukannya. */
export function normalisasi(v: unknown): string {
  return String(v ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Cocok bila SETIAP kata kunci muncul di suatu tempat pada baris.
 *
 * Ber-AND antar kata, bukan mencocokkan frasa utuh: orang mengetik "budi
 * admin" berharap menemukan Budi yang berperan admin, dan tak ada satu kolom
 * pun yang memuat kedua kata itu berurutan.
 */
export function cocokCari(teks: string, q: string): boolean {
  const kata = normalisasi(q).split(' ').filter(Boolean);
  if (!kata.length) return true;
  return kata.every((k) => teks.includes(k));
}

/** null/undefined/'' → null, supaya seluruh perbandingan punya satu bentuk kosong. */
function nilaiUrut(v: string | number | Date | null | undefined): string | number | null {
  if (v == null) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.getTime();
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = v.trim();
  return s === '' ? null : s.toLowerCase();
}

function banding(a: string | number | null, b: string | number | null, arah: Arah): number {
  // Kosong selalu di bawah — lihat catatan (3) di kepala berkas.
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const d = typeof a === 'number' && typeof b === 'number'
    ? a - b
    : String(a).localeCompare(String(b), 'id-ID', { numeric: true, sensitivity: 'base' });
  return arah === 'naik' ? d : -d;
}

/**
 * Jalankan cari → saring → urut → penggal, dalam urutan itu.
 *
 * Urutannya menentukan: mengurutkan sebelum menyaring berarti mengurutkan
 * baris yang akan dibuang, dan memenggal sebelum menyaring memberi halaman
 * yang isinya berubah-ubah jumlahnya.
 */
export function olahTabel<T>(
  rows: readonly T[] | null | undefined,
  opsi: OpsiTabel<T>,
  keadaan: KeadaanTabel,
): HasilTabel<T> {
  const semua = rows ?? [];
  let hasil = semua.slice();

  if (keadaan.q.trim() && opsi.cari) {
    hasil = hasil.filter((r) => cocokCari(normalisasi(opsi.cari!(r).join(' ')), keadaan.q));
  }

  for (const [kunci, nilai] of Object.entries(keadaan.saring)) {
    if (!nilai) continue; // '' = semua
    const ambil = opsi.saring?.[kunci];
    if (!ambil) continue;
    hasil = hasil.filter((r) => String(ambil(r) ?? '') === nilai);
  }

  const total = hasil.length;

  if (keadaan.urut && opsi.urut?.[keadaan.urut]) {
    const ambil = opsi.urut[keadaan.urut];
    /* Dihias-urut-lepas, bukan sort() langsung: Array#sort di V8 memang
       stabil, tapi kestabilan yang kita butuhkan adalah terhadap urutan ASLI,
       dan `hasil` sudah tersaring. Menyimpan indeksnya membuat baris berbobot
       sama tetap pada urutan yang sama tiap render — tanpa itu tabel bisa
       terlihat "berkedip" menukar dua baris tanpa sebab. */
    hasil = hasil
      .map((r, i) => ({ r, i, v: nilaiUrut(ambil(r)) }))
      .sort((a, b) => banding(a.v, b.v, keadaan.arah) || a.i - b.i)
      .map((x) => x.r);
  }

  const ukuran = Math.max(1, keadaan.ukuran);
  const halamanTotal = Math.max(1, Math.ceil(total / ukuran));
  // Dijepit, bukan dipercaya: penyaring yang mengecilkan hasil bisa membuat
  // halaman yang sedang dibuka tak ada lagi, dan halaman kosong terbaca
  // sebagai data hilang.
  const halaman = Math.min(Math.max(1, Math.floor(keadaan.halaman) || 1), halamanTotal);
  const mulai = (halaman - 1) * ukuran;

  return {
    tampil: hasil.slice(mulai, mulai + ukuran),
    total,
    totalMentah: semua.length,
    halaman,
    halamanTotal,
    mulai,
  };
}

/**
 * Nilai unik sebuah kolom, untuk mengisi dropdown penyaring sendiri.
 *
 * Diambil dari DATA, bukan dari daftar yang ditulis tangan: daftar tetap akan
 * menawarkan pilihan yang tak ada isinya dan menyembunyikan nilai baru yang
 * belum sempat ditambahkan ke daftarnya.
 */
export function nilaiUnik<T>(rows: readonly T[] | null | undefined, ambil: (r: T) => string | null | undefined): string[] {
  const set = new Set<string>();
  for (const r of rows ?? []) {
    const v = ambil(r);
    if (v != null && String(v).trim() !== '') set.add(String(v));
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'id-ID', { numeric: true, sensitivity: 'base' }));
}

/**
 * Keadaan berikutnya saat sebuah kepala kolom diklik.
 *
 * Klik pertama menaik, klik kedua menurun, klik KETIGA melepas urutan sama
 * sekali — mengembalikan urutan asli, yang untuk sebagian tabel (antrean,
 * papan prioritas) justru urutan yang bermakna dan tak bisa dilahirkan
 * kembali oleh kolom mana pun.
 */
export function klikUrut(keadaan: KeadaanTabel, kunci: string): KeadaanTabel {
  if (keadaan.urut !== kunci) return { ...keadaan, urut: kunci, arah: 'naik', halaman: 1 };
  if (keadaan.arah === 'naik') return { ...keadaan, arah: 'turun', halaman: 1 };
  return { ...keadaan, urut: null, arah: 'naik', halaman: 1 };
}

/** Ubah kata kunci — SELALU kembali ke halaman 1. Lihat catatan (2). */
export function ubahCari(keadaan: KeadaanTabel, q: string): KeadaanTabel {
  return { ...keadaan, q, halaman: 1 };
}

/** Ubah satu penyaring — SELALU kembali ke halaman 1. Lihat catatan (2). */
export function ubahSaring(keadaan: KeadaanTabel, kunci: string, nilai: string): KeadaanTabel {
  return { ...keadaan, saring: { ...keadaan.saring, [kunci]: nilai }, halaman: 1 };
}

/** Ubah besar halaman — kembali ke halaman 1, karena "halaman 7" pada ukuran
 *  10 dan pada ukuran 100 menunjuk baris yang sama sekali berbeda. */
export function ubahUkuran(keadaan: KeadaanTabel, ukuran: number): KeadaanTabel {
  return { ...keadaan, ukuran: Math.max(1, ukuran), halaman: 1 };
}

/** Apakah ada cari/saring yang sedang aktif — untuk memilih kalimat kosong
 *  yang benar, dan untuk memutuskan perlu tidaknya tombol "bersihkan". */
export function adaPenyaring(keadaan: KeadaanTabel): boolean {
  return keadaan.q.trim() !== '' || Object.values(keadaan.saring).some(Boolean);
}
