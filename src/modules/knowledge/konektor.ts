/**
 * DAFTAR KONEKTOR & SAKLARNYA.
 *
 * Diminta pemilik produk (1 Agu 2026): superadmin memilih konektor mana yang
 * boleh dipakai, dan yang dimatikan tak boleh muncul sebagai pilihan.
 *
 * SATU DAFTAR, DIPAKAI BERSAMA. Sebelum ini jenis sumber tertulis tiga kali —
 * di zod route, di `connect()` sync.service, dan di dropdown halaman
 * Knowledge — dan ketiganya harus diingat serentak. Daftar yang tercecer
 * seperti itu selalu berakhir sama: satu tempat ketinggalan, dan konektor
 * yang "sudah dimatikan" masih bisa dipakai lewat jalan lain.
 *
 * Berkas ini tak menyentuh basis data. Ia cuma daftar dan aturan gabungnya.
 */

export type JenisKonektor =
  | 'gdrive' | 'gdrive_public' | 'onedrive' | 'sharepoint'
  | 'upload' | 'url' | 's3' | 'notion' | 'slack';

export interface Konektor {
  jenis: JenisKonektor;
  label: string;
  /**
   * Sudah ada adaptornya di sync.service? Yang belum TIDAK bisa dinyalakan —
   * saklar yang bisa dinyalakan untuk sesuatu yang belum ada hanya
   * memindahkan kegagalan ke pengguna, dan galatnya muncul jauh dari
   * sebabnya.
   */
  tersedia: boolean;
  /**
   * true = menuntut KITA mendaftarkan aplikasi OAuth dan memegang client
   * secret-nya. Inilah yang membedakan Notion/Slack dari S3: pada S3
   * pelanggan memasok kuncinya sendiri, jadi tak ada yang perlu ditunggu.
   */
  butuhAplikasiKita: boolean;
  /** Bawaan saat platform_settings belum menyebut apa pun tentangnya. */
  bawaanNyala: boolean;
  keterangan: string;
}

export const KONEKTOR: Konektor[] = [
  {
    jenis: 'gdrive', label: 'Google Drive (akun tersambung)', tersedia: true,
    butuhAplikasiKita: true, bawaanNyala: true,
    keterangan: 'Menelusuri folder Drive milik akun yang tersambung.',
  },
  {
    jenis: 'gdrive_public', label: 'Google Drive — folder publik', tersedia: true,
    butuhAplikasiKita: true, bawaanNyala: true,
    keterangan: 'Tempel URL folder yang sudah dibagikan; tanpa login pengguna.',
  },
  {
    jenis: 'onedrive', label: 'OneDrive', tersedia: true,
    butuhAplikasiKita: true, bawaanNyala: true,
    keterangan: 'Berkas OneDrive milik akun Microsoft yang tersambung.',
  },
  {
    jenis: 'sharepoint', label: 'SharePoint', tersedia: true,
    butuhAplikasiKita: true, bawaanNyala: true,
    keterangan: 'Document library situs SharePoint atau tautan berbagi folder.',
  },
  {
    jenis: 'upload', label: 'Unggah berkas dari komputer', tersedia: true,
    butuhAplikasiKita: false, bawaanNyala: true,
    keterangan: 'Tanpa integrasi apa pun. Mematikannya menutup satu-satunya jalur '
      + 'yang tak bergantung pihak ketiga — pertimbangkan lagi.',
  },
  {
    jenis: 'url', label: 'Halaman web (URL)', tersedia: true,
    butuhAplikasiKita: false, bawaanNyala: true,
    keterangan: 'Satu halaman publik, disinkronkan ulang lewat ETag/Last-Modified.',
  },
  {
    jenis: 's3', label: 'S3 / penyimpanan objek (MinIO, R2, Wasabi)', tersedia: true,
    butuhAplikasiKita: false, bawaanNyala: true,
    keterangan: 'Pelanggan memasok kunci aksesnya sendiri — tak ada yang perlu kita daftarkan.',
  },
  {
    jenis: 'notion', label: 'Notion', tersedia: false,
    butuhAplikasiKita: true, bawaanNyala: false,
    keterangan: 'Belum tersedia: menuntut aplikasi OAuth Notion yang kita daftarkan sendiri.',
  },
  {
    jenis: 'slack', label: 'Slack', tersedia: false,
    butuhAplikasiKita: true, bawaanNyala: false,
    keterangan: 'Belum tersedia: menuntut aplikasi Slack yang kita daftarkan sendiri.',
  },
];

const PETA = new Map(KONEKTOR.map((k) => [k.jenis, k]));

export function konektor(jenis: string): Konektor | null {
  return PETA.get(jenis as JenisKonektor) ?? null;
}

/**
 * Apakah konektor ini boleh dipakai sekarang.
 *
 * Konektor yang BELUM TERSEDIA selalu tertutup, apa pun isi pengaturannya —
 * baris pengaturan yang tertinggal dari percobaan lama tak boleh bisa
 * menyalakan adaptor yang tak pernah ditulis.
 *
 * Jenis yang TAK DIKENAL juga tertutup. Itu bukan kehati-hatian berlebihan:
 * `kind` datang dari badan permintaan HTTP, dan daftar yang menjawab "boleh"
 * untuk apa pun yang tak dikenalnya adalah daftar yang tak menjaga apa-apa.
 */
export function konektorBoleh(
  jenis: string,
  pengaturan: Record<string, boolean> | null | undefined,
): boolean {
  const k = konektor(jenis);
  if (!k || !k.tersedia) return false;
  const disetel = pengaturan?.[jenis];
  return typeof disetel === 'boolean' ? disetel : k.bawaanNyala;
}

/** Daftar lengkap beserta keadaan nyalanya — dipakai panel admin & halaman Knowledge. */
export function daftarKonektor(pengaturan: Record<string, boolean> | null | undefined) {
  return KONEKTOR.map((k) => ({ ...k, nyala: konektorBoleh(k.jenis, pengaturan) }));
}

/**
 * Bersihkan kiriman panel admin.
 *
 * Kunci yang tak dikenal DIBUANG, bukan disimpan: pengaturan yang menumpuk
 * kunci sampah akan terbaca sebagai daftar yang lebih panjang dari
 * kenyataannya, dan suatu hari seseorang menyimpulkan ada konektor yang
 * sebenarnya tak pernah ada. Yang belum tersedia dipaksa mati, sekali lagi,
 * di sisi tulis — supaya keadaan tak sah tak pernah sempat tersimpan.
 */
export function bersihkanPengaturan(masuk: Record<string, unknown>): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const k of KONEKTOR) {
    const v = masuk[k.jenis];
    if (typeof v !== 'boolean') continue;
    out[k.jenis] = k.tersedia ? v : false;
  }
  return out;
}
