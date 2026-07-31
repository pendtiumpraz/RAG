/**
 * PASANGAN WARNA yang benar-benar dipakai antarmuka.
 *
 * Daftarnya ditulis tangan, bukan hasil perkalian semua token. Mengalikan
 * semua kombinasi akan melaporkan puluhan kegagalan untuk pasangan yang tak
 * pernah muncul di layar — dan daftar peringatan yang sebagian besar palsu
 * akan diabaikan seluruhnya, termasuk yang benar.
 *
 * `besar: true` untuk teks besar/tebal dan komponen antarmuka (garis, ikon,
 * batang), yang ambangnya 3:1 menurut WCAG 1.4.11 — bukan kelonggaran, tapi
 * ambang yang memang berbeda.
 */
export interface PasanganKontras {
  depan: string;
  belakang: string;
  /** Ambang 3:1 (teks besar / komponen antarmuka) alih-alih 4,5:1. */
  besar?: boolean;
  /** Di mana ini terlihat — supaya kegagalannya bisa ditelusuri. */
  pakai: string;
}

export const PASANGAN: PasanganKontras[] = [
  { depan: '--ink', belakang: '--card', pakai: 'teks utama di kartu' },
  { depan: '--ink', belakang: '--bg', pakai: 'teks utama di latar halaman' },
  { depan: '--ink', belakang: '--card-2', pakai: 'teks di kartu bertingkat' },
  { depan: '--ink', belakang: '--card-3', pakai: 'teks di kartu bertingkat 3' },
  { depan: '--muted', belakang: '--card', pakai: 'subjudul, keterangan' },
  { depan: '--muted', belakang: '--bg', pakai: 'subjudul di latar halaman' },
  { depan: '--muted', belakang: '--card-2', pakai: 'keterangan di kartu bertingkat' },
  // `--faint` dipakai sebagai TEKS di .microlabel, bukan hanya dekorasi.
  { depan: '--faint', belakang: '--card', pakai: 'microlabel (TEKS, bukan hiasan)' },
  { depan: '--faint', belakang: '--bg', pakai: 'microlabel di latar halaman' },
  { depan: '--on-signal', belakang: '--signal', pakai: 'teks tombol utama' },
  { depan: '--signal', belakang: '--card', pakai: 'tautan & angka signal' },
  { depan: '--signal', belakang: '--bg', pakai: 'tautan di latar halaman' },
  { depan: '--source', belakang: '--card', pakai: 'teks sitasi/sumber' },
  { depan: '--good', belakang: '--card', pakai: 'teks status berhasil' },
  { depan: '--warn', belakang: '--card', pakai: 'teks peringatan' },
  { depan: '--danger', belakang: '--card', pakai: 'teks galat' },
  { depan: '--line-strong', belakang: '--card', besar: true, pakai: 'garis input & pembatas' },
  { depan: '--source-mark', belakang: '--card', besar: true, pakai: 'penanda amber (isian)' },
  { depan: '--good-mark', belakang: '--card', besar: true, pakai: 'lampu status hidup' },
];
