/**
 * PRATINJAU SUMBER — apa yang akan diserap, SEBELUM satu byte pun diunduh.
 *
 * KENAPA ADA. Saran paling berdampak untuk korpus 700 GB bukan soal mesin:
 * jangan indeks semuanya. Hampir pasti sebagian besarnya lampiran email,
 * salinan berulang, dan berkas yang tak pernah ditanyakan siapa pun. 20 GB
 * terpilih mengalahkan 700 GB tanpa pilih — bukan karena mesinnya lebih baik,
 * melainkan karena pengganggunya jauh lebih sedikit, dan pengganggu itulah
 * yang menenggelamkan jawaban benar di lapisan pertama (lihat chat/tier1.ts:
 * di atas ±200 ribu dokumen, membesarkan ambang tak membeli apa pun lagi).
 *
 * KEPUTUSANNYA HARUS JATUH SEBELUM UNDUH. `dedupe.ts` sudah ada tapi bekerja
 * SESUDAH berkasnya ditarik — pada 700 GB, "sudah diunduh lalu dibuang"
 * berarti biayanya sudah dibayar penuh: bandwidth, waktu sync, dan pada jalur
 * embedding API juga uang.
 *
 * SELURUHNYA DARI METADATA. Pendaftaran berkas (`connect()`) sudah memberi
 * nama, ukuran, dan versi tanpa mengunduh apa pun. Modul ini tak menambah
 * satu pun permintaan jaringan di luar yang sudah dilakukan sync.
 */
import { folderDari } from './saring';

/** Bentuk berkas yang cukup untuk pratinjau — sengaja lebih sempit dari RemoteFile. */
export interface BerkasPratinjau {
  name: string;
  size?: number;
  path?: string;
  mimeType?: string;
}

export interface BarisFolder {
  /** Jalur folder; string kosong = akar sumber. */
  jalur: string;
  berkas: number;
  byte: number;
  /** Berkas yang formatnya tak bisa dibaca — diserap NOL potongan. */
  takTerbaca: number;
  perkiraanPotongan: number;
}

export interface Pratinjau {
  folder: BarisFolder[];
  total: BarisFolder;
  /** Pendaftaran kena batas: yang di bawah ini BUKAN seluruh isinya. */
  terpotong: boolean;
}

/**
 * Berapa bagian sebuah berkas yang benar-benar teks.
 *
 * ANGKA INI KASAR, dan harus dibaca begitu. Rasio teks terhadap ukuran berkas
 * sumber terukur 2–3% untuk dokumen perkantoran (docs/ONPREM.md §6), tapi ia
 * berayun jauh: PDF hasil pemindaian nyaris nol teks, PDF hasil ekspor bisa
 * 10%. Yang dijanjikan pratinjau bukan ketepatan melainkan URUTAN BESARAN —
 * cukup untuk menjawab "folder mana yang akan menghabiskan kuota", dan itu
 * memang satu-satunya pertanyaan yang perlu dijawab sebelum mencentang.
 *
 * Berkas teks polos dihitung mendekati satu: isinya memang teks.
 */
const RASIO_TEKS: Record<string, number> = {
  txt: 0.95, md: 0.95, csv: 0.9, json: 0.7, html: 0.3, htm: 0.3,
  pdf: 0.02, docx: 0.03, doc: 0.03, pptx: 0.02, ppt: 0.02, xlsx: 0.05, xls: 0.05,
};
const RASIO_BAWAAN = 0.03;

/**
 * Karakter teks baru per potongan.
 *
 * Potongan 800 karakter dengan tumpang tindih 120 (chunker.ts), jadi tiap
 * potongan menambah 680 karakter yang belum pernah dilihat. Memakai 800 akan
 * meremehkan jumlah potongan ±18% — dan pratinjau yang meremehkan justru
 * bentuk kesalahan yang paling merugikan di sini, karena orang mencentang
 * folder yang ternyata menghabiskan kuotanya.
 */
export const KARAKTER_PER_POTONGAN = 680;

export function rasioTeks(nama: string): number {
  const titik = nama.lastIndexOf('.');
  if (titik <= 0) return RASIO_BAWAAN;
  return RASIO_TEKS[nama.slice(titik + 1).toLowerCase()] ?? RASIO_BAWAAN;
}

/**
 * Perkiraan jumlah potongan dari ukuran berkas.
 *
 * Berkas yang terbaca SELALU menghasilkan minimal satu potongan — berkas
 * sekecil apa pun tetap satu baris di basis data dan tetap memakan kuota.
 * Membulatkannya ke nol akan membuat folder berisi ribuan berkas kecil
 * tampak gratis, padahal justru itu bentuk korpus yang paling boros baris.
 */
export function perkiraanPotongan(nama: string, byte: number | undefined): number {
  const n = Number(byte);
  if (!Number.isFinite(n) || n <= 0) return 1;
  const karakter = n * rasioTeks(nama);
  return Math.max(1, Math.ceil(karakter / KARAKTER_PER_POTONGAN));
}

/**
 * Ringkas daftar berkas jadi tabel per folder.
 *
 * MURNI — tanpa jaringan, tanpa waktu. Pemanggilnya yang menyediakan daftar
 * berkas dan penentu keterbacaan format, supaya seluruh aturan pembulatan &
 * pengelompokan di sini bisa diuji tanpa satu pun permintaan keluar.
 *
 * @param terbaca penentu apakah format berkas bisa diekstrak. Disuntikkan,
 *   bukan diimpor: `isExtractable` tinggal di sync.service yang menarik
 *   seluruh konektor saat diimpor — dan menyeretnya ke sini akan membuat tes
 *   modul kecil ini menuntut separuh aplikasi ikut dimuat.
 */
export function ringkasPerFolder(
  berkas: BerkasPratinjau[],
  terbaca: (nama: string, mime?: string) => boolean,
  terpotong = false,
): Pratinjau {
  const peta = new Map<string, BarisFolder>();
  const total: BarisFolder = { jalur: '', berkas: 0, byte: 0, takTerbaca: 0, perkiraanPotongan: 0 };

  for (const f of berkas) {
    /* Jalur dulu, nama belakangan. Konektor yang tahu hierarkinya mengisi
       `path`; yang tidak (Notion, Slack) tak punya folder sama sekali, dan
       seluruh berkasnya jatuh ke akar — itu jawaban yang benar, bukan
       kekurangan yang perlu ditambal dengan folder karangan. */
    const jalur = folderDari(f.path ?? null) ?? '';
    const baris = peta.get(jalur) ?? { jalur, berkas: 0, byte: 0, takTerbaca: 0, perkiraanPotongan: 0 };

    baris.berkas += 1;
    baris.byte += Number(f.size) || 0;
    total.berkas += 1;
    total.byte += Number(f.size) || 0;

    if (!terbaca(f.name, f.mimeType)) {
      /* Format tak terbaca DIHITUNG TERPISAH, bukan disembunyikan. Folder
         berisi 5.000 gambar akan tampak besar di kolom byte sementara
         potongannya nol — dan tanpa kolom ini orang menyimpulkan pratinjaunya
         rusak, bukan bahwa berkasnya memang tak terbaca. */
      baris.takTerbaca += 1;
      total.takTerbaca += 1;
    } else {
      const p = perkiraanPotongan(f.name, f.size);
      baris.perkiraanPotongan += p;
      total.perkiraanPotongan += p;
    }
    peta.set(jalur, baris);
  }

  /* Diurutkan dari yang paling berat — itulah yang orang cari saat memutuskan
     apa yang tak perlu diserap. */
  const folder = [...peta.values()].sort((a, b) => b.perkiraanPotongan - a.perkiraanPotongan);
  return { folder, total, terpotong };
}

/**
 * Saring berkas mengikuti folder yang dicentang pemiliknya.
 *
 * Daftar KOSONG berarti SEMUA, bukan tak satu pun. Arti sebaliknya akan
 * membuat setiap sumber yang sudah ada berhenti menyerap apa pun pada detik
 * fitur ini dipasang — tanpa galat, tanpa jejak, dan tanpa siapa pun tahu
 * sebabnya sampai ada yang bertanya kenapa knowledge base-nya menyusut.
 *
 * Dicocokkan sebagai prefiks BERPEMISAH, sama seperti penyaring pencarian:
 * "kebijakan" tak boleh ikut menyeret "kebijakan-lama".
 */
export function saringFolderTerpilih<T extends { path?: string }>(
  berkas: T[],
  terpilih: string[] | null | undefined,
): T[] {
  const pilih = (terpilih ?? []).map((s) => s.replace(/^\/+|\/+$/g, '')).filter(Boolean);
  if (!pilih.length) return berkas;
  return berkas.filter((f) => {
    const jalur = folderDari(f.path ?? null) ?? '';
    return pilih.some((p) => jalur === p || jalur.startsWith(`${p}/`));
  });
}
