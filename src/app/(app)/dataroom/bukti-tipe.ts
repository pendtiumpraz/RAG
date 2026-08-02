/**
 * DATAROOM · BUKTI FITUR — bentuk laporan tur.
 *
 * Dipakai bersama oleh `scripts/tur-*.mts` (yang menghasilkan) dan tab Bukti
 * Fitur (yang menampilkan). Satu definisi, dua sisi: kalau bentuknya berubah
 * dan salah satu sisi lupa ikut, `tsc` yang memberi tahu — bukan halaman
 * kosong di depan calon pelanggan.
 */

export type StatusBukti = 'bekerja' | 'sebagian' | 'gagal' | 'dilewati';

export interface LangkahBukti {
  n: number;
  nama: string;
  /** Nama berkas di /bukti/ — null bila memotret pun gagal. */
  gambar: string | null;
  status: StatusBukti;
  catatan: string;
  http: number | null;
  galat: string[];
  ms: number;
}

export interface AdeganBukti {
  id: string;
  fitur: string;
  jalur: string;
  butuhLogin: boolean;
  status: StatusBukti;
  ringkas: string;
  langkah: LangkahBukti[];
}

export interface LaporanTur {
  basis: string;
  pada: string;
  masuk: boolean;
  mode: string;
  dibuatLaluDihapus: { chatbotId?: string; kbId?: string };
  jejakBersih: string[];
  ringkas: { total: number; bekerja: number; sebagian: number; gagal: number; dilewati: number };
  adegan: AdeganBukti[];
}
