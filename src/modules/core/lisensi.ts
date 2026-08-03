import { createPublicKey, verify } from 'node:crypto';

/**
 * LISENSI ON-PREMISE — kunci bertanda tangan yang diperiksa DI TEMPAT.
 *
 * Sampai kartu ini, siapa pun yang menerima image kita bisa menjalankannya di
 * berapa pun server tanpa satu pun pemeriksaan, dan panduan on-prem menulis
 * itu apa adanya. Untuk on-prem ketiadaan lisensi bukan sekadar soal
 * pendapatan: tanpa kunci berbatas waktu tak ada cara memberi masa percobaan,
 * tak ada cara membedakan pemasangan yang didukung dari yang tidak, dan tak
 * ada cara tahu berapa pemasangan yang hidup.
 *
 * TIGA KEPUTUSAN YANG MEMBENTUK SELURUH BERKAS INI:
 *
 * 1. DIPERIKSA LOKAL, TANPA PANGGILAN KELUAR. Pelanggan on-premise justru
 *    memilih on-premise supaya tak ada panggilan keluar. Lisensi yang menelepon
 *    pulang akan ditolak bagian keamanan mereka — dan kalaupun lolos, ia
 *    berarti pemasangan mati saat jaringan kita mati. Ed25519: tanda tangan
 *    dibuat dengan kunci privat yang tak pernah meninggalkan mesin kita, dan
 *    diperiksa dengan kunci publik yang boleh dilihat siapa pun.
 *
 * 2. GAGAL DENGAN LEMBUT — MEMPERINGATKAN, BUKAN MEMATIKAN. Ini mesin
 *    pengetahuan yang sedang dipakai orang bekerja. Mematikannya karena
 *    lisensi kedaluwarsa berarti menghukum seluruh karyawan pelanggan atas
 *    urusan yang sepenuhnya antara dua bagian keuangan — dan yang pertama
 *    menelepon bukan yang bisa memperbaikinya. Perangkat lunak yang mengunci
 *    dirinya sendiri di tengah hari kerja tak pernah dibeli dua kali.
 *
 * 3. TAK BERLAKU DI SaaS. Di SaaS batasnya paket berlangganan, dan sudah
 *    ditegakkan di limits.ts. Memeriksa lisensi di sana berarti dua sistem
 *    membatasi hal yang sama, lalu suatu hari tidak sepakat.
 *
 * SENGAJA MURNI (tanpa I/O, tanpa DB): seluruh keputusannya bisa diuji tanpa
 * memasang apa pun, dan itu penting untuk kode yang kegagalannya baru terlihat
 * di server orang lain.
 */

export type StatusLisensi =
  /** Tak diperlukan — pemasangan SaaS. */
  | 'tak-berlaku'
  /** Tak ada kunci sama sekali. */
  | 'kosong'
  /** Kunci ada tapi tak bisa dibaca / tanda tangannya salah. */
  | 'tidak-sah'
  /** Sah, masih berlaku. */
  | 'aktif'
  /** Sah tapi masa berlakunya lewat. */
  | 'kedaluwarsa';

export interface IsiLisensi {
  /** Nama organisasi pemegang lisensi — muncul di konsol. */
  untuk: string;
  /** ISO date. Kosong/ketiadaan = tanpa masa berlaku (lisensi abadi). */
  sampai?: string;
  /** Batas lunak yang DILAPORKAN, tak ditegakkan. Lihat catatan (2). */
  maksPengguna?: number;
  maksChatbot?: number;
  /** Label edisi bebas ('enterprise', 'percobaan', …). */
  edisi?: string;
  /** Nomor seri — supaya dua pemasangan bisa dibedakan di dukungan. */
  seri?: string;
}

export interface HasilLisensi {
  status: StatusLisensi;
  isi: IsiLisensi | null;
  /** Kalimat untuk manusia. Selalu terisi, termasuk saat sehat. */
  pesan: string;
  /** Sisa hari; negatif berarti sudah lewat. null = tanpa masa berlaku. */
  sisaHari: number | null;
  /**
   * Perlukah diperlihatkan menonjol di konsol?
   *
   * Nyala saat kedaluwarsa, tidak sah, kosong, ATAU tinggal < 30 hari.
   * Ambang 30 hari bukan hiasan: pengadaan korporasi butuh berminggu-minggu,
   * dan peringatan yang muncul di hari terakhir datang terlalu telat untuk
   * bisa ditindaklanjuti siapa pun.
   */
  perluPerhatian: boolean;
}

/** Ambang peringatan dini, dalam hari. Lihat catatan pada `perluPerhatian`. */
export const AMBANG_PERINGATAN_HARI = 30;

/**
 * Kunci publik penerbit — boleh dilihat siapa pun; ia hanya bisa MEMERIKSA.
 *
 * Dapat ditimpa lewat `LICENSE_PUBLIC_KEY` untuk pemasangan yang menerbitkan
 * lisensinya sendiri (mis. distributor). Bawaannya kosong, dan kekosongan itu
 * BUKAN kegagalan: pemasangan SaaS tak pernah memeriksanya, dan pemasangan
 * on-prem tanpa kunci publik memang tak bisa memvalidasi apa pun — yang
 * dilaporkan apa adanya, bukan disamarkan jadi "aktif".
 */
function kunciPublik(env: NodeJS.ProcessEnv): string {
  return (env.LICENSE_PUBLIC_KEY ?? '').trim();
}

/**
 * Bentuk kunci: `<payload-base64url>.<signature-base64url>`.
 *
 * Payload adalah JSON `IsiLisensi`. Titik dipakai sebagai pemisah karena ia
 * bukan karakter base64url — jadi pemisahannya tak pernah ambigu, dan kunci
 * yang terpotong saat disalin akan gagal terbaca alih-alih terbaca separuh.
 */
export function uraiKunci(kunci: string): { isi: IsiLisensi; data: Buffer; sig: Buffer } | null {
  const bagian = String(kunci ?? '').trim().split('.');
  if (bagian.length !== 2 || !bagian[0] || !bagian[1]) return null;
  try {
    const data = Buffer.from(bagian[0], 'base64url');
    const sig = Buffer.from(bagian[1], 'base64url');
    if (!data.length || !sig.length) return null;
    const isi = JSON.parse(data.toString('utf8')) as IsiLisensi;
    if (!isi || typeof isi !== 'object' || typeof isi.untuk !== 'string' || !isi.untuk.trim()) return null;
    return { isi, data, sig };
  } catch { return null; }
}

/** Selisih hari dari `sekarang` ke `sampai`; null bila tanpa masa berlaku. */
export function sisaHari(sampai: string | undefined, sekarang: Date): number | null {
  if (!sampai || !String(sampai).trim()) return null;
  const t = Date.parse(sampai);
  if (Number.isNaN(t)) return null;
  return Math.floor((t - sekarang.getTime()) / 86_400_000);
}

/**
 * Periksa lisensi. MURNI: env & waktu disuntikkan, tak dibaca dari global.
 *
 * Menyuntikkan `sekarang` bukan kerapian belaka — tanpa itu, seluruh perilaku
 * di sekitar kedaluwarsa hanya bisa diuji dengan mengubah jam sistem, jadi
 * tak pernah diuji sama sekali.
 */
export function periksaLisensi(
  env: NodeJS.ProcessEnv = process.env,
  sekarang: Date = new Date(),
): HasilLisensi {
  const kosongan = (status: StatusLisensi, pesan: string, perlu: boolean): HasilLisensi =>
    ({ status, isi: null, pesan, sisaHari: null, perluPerhatian: perlu });

  if (env.DEPLOYMENT_MODE !== 'onprem') {
    return kosongan('tak-berlaku',
      'Pemasangan SaaS — batasnya paket berlangganan, bukan kunci lisensi.', false);
  }

  const kunci = (env.LICENSE_KEY ?? '').trim();
  if (!kunci) {
    return kosongan('kosong',
      'Belum ada kunci lisensi. Pemasangan tetap berjalan penuh; '
      + 'hubungi penyedia untuk menerbitkan kunci.', true);
  }

  const pub = kunciPublik(env);
  if (!pub) {
    return kosongan('tidak-sah',
      'LICENSE_PUBLIC_KEY belum diisi, jadi kunci lisensi tak bisa diperiksa. '
      + 'Pemasangan tetap berjalan penuh.', true);
  }

  const urai = uraiKunci(kunci);
  if (!urai) {
    return kosongan('tidak-sah',
      'Kunci lisensi tak terbaca — kemungkinan terpotong saat disalin. '
      + 'Pemasangan tetap berjalan penuh.', true);
  }

  let sah = false;
  try {
    const key = createPublicKey(pub.includes('BEGIN')
      ? pub
      : { key: Buffer.from(pub, 'base64'), format: 'der', type: 'spki' });
    /* Ed25519: algoritmanya null, sesuai kontrak node:crypto. */
    sah = verify(null, urai.data, key, urai.sig);
  } catch {
    sah = false;
  }
  if (!sah) {
    return kosongan('tidak-sah',
      'Tanda tangan kunci lisensi tidak cocok. Pemasangan tetap berjalan penuh, '
      + 'tapi kunci ini tidak diterbitkan untuk pemasangan ini.', true);
  }

  const sisa = sisaHari(urai.isi.sampai, sekarang);
  if (sisa !== null && sisa < 0) {
    return {
      status: 'kedaluwarsa', isi: urai.isi, sisaHari: sisa, perluPerhatian: true,
      pesan: `Lisensi untuk ${urai.isi.untuk} berakhir ${Math.abs(sisa)} hari lalu. `
        + 'Tak ada fitur yang dimatikan — perpanjang lewat penyedia.',
    };
  }
  return {
    status: 'aktif', isi: urai.isi, sisaHari: sisa,
    perluPerhatian: sisa !== null && sisa <= AMBANG_PERINGATAN_HARI,
    pesan: sisa === null
      ? `Lisensi aktif untuk ${urai.isi.untuk}, tanpa masa berlaku.`
      : `Lisensi aktif untuk ${urai.isi.untuk} — sisa ${sisa} hari.`,
  };
}

/**
 * Satu baris untuk log saat proses menyala.
 *
 * Ada karena pemasangan on-prem tak punya siapa pun yang membuka konsol pada
 * hari biasa. Baris log saat menyala adalah satu-satunya tempat lisensi yang
 * hampir habis pasti terlihat oleh tim IT yang sedang menyalakan ulang
 * layanan — yaitu orang yang benar-benar bisa menindaklanjutinya.
 */
export function barisLogLisensi(h: HasilLisensi): string | null {
  if (h.status === 'tak-berlaku') return null;
  const tanda = h.perluPerhatian ? '[lisensi] PERHATIAN:' : '[lisensi]';
  return `${tanda} ${h.pesan}`;
}
