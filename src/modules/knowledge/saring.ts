/**
 * METADATA YANG BISA DISARING — dan penyaringnya.
 *
 * KENAPA ADA. Pertanyaan "SOP pengadaan 2024" tak perlu menyentuh 3,5 juta
 * dokumen; ia perlu menyentuh beberapa ribu. Satu `WHERE` berindeks
 * mengalahkan setiap pengoptimalan vektor yang bisa ditulis di lapisan mana
 * pun — dan bedanya membesar justru saat korpusnya membesar, tepat ketika
 * segala hal lain memburuk.
 *
 * KOLOM, BUKAN JSONB. `documents.metadata` sudah ada dan menggoda, tapi
 * penyaring di atas jsonb tak bisa digabung dengan pra-penyaringan indeks
 * vektor: Postgres tak punya statistik yang bisa dipercaya untuk `->>`, dan
 * rencana kuerinya jatuh ke pemindaian penuh persis di korpus tempat
 * penyaring ini seharusnya menolong.
 *
 * TIGA, dan hanya tiga. Tiap kolom di sini harus bisa diisi DENGAN ANDAL oleh
 * konektor yang sudah ada. Kolom yang hanya terisi pada sebagian sumber
 * membuat penyaring yang tampak bekerja lalu diam-diam membuang dokumen yang
 * sebenarnya cocok — kegagalan yang jauh lebih buruk daripada tak punya
 * penyaring sama sekali.
 */

/** Penyaring yang boleh dikirim pemanggil. Semua opsional; kosong = tanpa saring. */
export interface SaringDokumen {
  /** Ekstensi tanpa titik, huruf kecil: `pdf`, `docx`. Kosong = semua. */
  ext?: string[];
  /** Awalan jalur folder. Dicocokkan sebagai PREFIKS, bukan sama-persis. */
  folder?: string;
  /** Batas bawah waktu ubah upstream (inklusif). */
  sejak?: Date | null;
  /** Batas atas waktu ubah upstream (inklusif). */
  sampai?: Date | null;
}

/**
 * Ekstensi dari nama berkas.
 *
 * Dinormalkan ke huruf kecil karena SharePoint & Drive mengembalikan `.PDF`
 * dan `.pdf` bergantian untuk berkas yang sama-sama PDF — penyaring yang
 * peka huruf besar-kecil akan membuang separuhnya tanpa alasan yang bisa
 * dilihat siapa pun.
 *
 * Nama tanpa titik, atau yang titiknya di ujung, tak punya ekstensi — bukan
 * ekstensi kosong. Bedanya penting: string kosong akan cocok dengan
 * penyaring `ext=''` yang tak pernah dimaksudkan siapa pun.
 */
export function ekstensi(nama: string | null | undefined): string | null {
  if (!nama) return null;
  const bersih = nama.trim().replace(/[?#].*$/, '');       // buang query string URL
  const titik = bersih.lastIndexOf('.');
  if (titik <= 0 || titik === bersih.length - 1) return null;
  const ext = bersih.slice(titik + 1).toLowerCase();
  /* Ekstensi yang masuk akal itu pendek dan alfanumerik. Tanpa penjagaan ini,
     nama berkas seperti "Rapat 12.03.2026 revisi final" menghasilkan ekstensi
     "03 2026 revisi final" dan mengotori daftar pilihan penyaring. */
  return /^[a-z0-9]{1,12}$/.test(ext) ? ext : null;
}

/**
 * Folder dari jalur upstream.
 *
 * S3 memberi kunci penuh (`kebijakan/2026/sop.pdf`), Drive publik memberi
 * jalur yang dirangkai saat menelusuri. Yang tak punya hierarki sama sekali
 * (Notion, Slack) mengembalikan null — dan itu jawaban yang benar, bukan
 * kekurangan yang perlu ditambal dengan string kosong.
 */
export function folderDari(jalur: string | null | undefined): string | null {
  if (!jalur) return null;
  const bersih = jalur.replace(/^\/+/, '').replace(/\\/g, '/');
  const garis = bersih.lastIndexOf('/');
  if (garis <= 0) return null;                              // di akar, bukan di folder
  return bersih.slice(0, garis);
}

/**
 * Waktu ubah upstream, bila penanda versinya memang sebuah waktu.
 *
 * Google Drive memberi `modifiedTime` RFC3339 — bisa dipakai apa adanya.
 * Microsoft Graph memberi eTag (`"{GUID},3"`) yang BUKAN waktu, dan S3
 * memberi ETag berupa hash. Memaksa keduanya jadi tanggal akan menghasilkan
 * kolom yang terisi angka acak, dan penyaring rentang tanggal di atasnya
 * membuang dokumen yang sebenarnya cocok.
 *
 * Jadi: yang tak bisa diurai jadi NULL, dan penyaring tanggal sengaja tidak
 * berlaku untuk sumber-sumber itu. Lebih baik penyaring yang jujur tak
 * tersedia daripada penyaring yang menjawab salah.
 */
export function waktuUbah(versi: string | null | undefined): Date | null {
  if (!versi) return null;
  const v = versi.trim();
  /* Wajib berbentuk tanggal ISO. `Date.parse` sendirian terlalu longgar —
     ia menerima "3" dan mengembalikan tahun 2001. */
  if (!/^\d{4}-\d{2}-\d{2}[T ]/.test(v)) return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : new Date(t);
}

/** Kosongkan penyaring yang tak berisi apa pun — supaya SQL-nya tak tumbuh sia-sia. */
export function adaSaring(s: SaringDokumen | null | undefined): boolean {
  if (!s) return false;
  return Boolean(s.ext?.length) || Boolean(s.folder?.trim()) || Boolean(s.sejak) || Boolean(s.sampai);
}

/**
 * Bersihkan penyaring dari luar (badan HTTP).
 *
 * Ekstensi dinormalkan dan dibatasi jumlahnya: daftar `ext` sepanjang seribu
 * entri menghasilkan `IN (...)` yang membuat perencana kueri menyerah dan
 * jatuh ke pemindaian penuh — persis kebalikan dari gunanya penyaring ini.
 */
export const MAKS_EXT = 20;

export function bersihkanSaring(masuk: unknown): SaringDokumen {
  const m = (masuk ?? {}) as Record<string, unknown>;
  const out: SaringDokumen = {};

  if (Array.isArray(m.ext)) {
    const ext = [...new Set(m.ext
      .filter((x): x is string => typeof x === 'string')
      .map((x) => x.replace(/^\./, '').trim().toLowerCase())
      .filter((x) => /^[a-z0-9]{1,12}$/.test(x)))].slice(0, MAKS_EXT);
    if (ext.length) out.ext = ext;
  }

  if (typeof m.folder === 'string' && m.folder.trim()) {
    out.folder = m.folder.trim().replace(/^\/+/, '').replace(/\\/g, '/').replace(/\/+$/, '');
  }

  for (const [kunci, nilai] of [['sejak', m.sejak], ['sampai', m.sampai]] as const) {
    if (typeof nilai !== 'string' || !nilai.trim()) continue;
    const t = Date.parse(nilai);
    /* Tanggal NGAWUR MELEMPAR, tidak diam-diam jadi "tanpa penyaring".
       Penyaring yang diam-diam hilang membuat orang melihat hasil dari
       SELURUH korpus sambil mengira ia sedang melihat satu folder. */
    if (Number.isNaN(t)) throw new Error(`Tanggal ${kunci} tidak sah: ${nilai}`);
    out[kunci] = new Date(t);
  }

  return out;
}
