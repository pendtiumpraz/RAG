/**
 * KUITANSI — penomoran dan susunan datanya.
 *
 * Modul MURNI: tak menyentuh basis data, sehingga bisa diuji tanpa apa pun
 * yang berjalan. Yang dijaga di sini adalah hal-hal yang salahnya tak
 * menimbulkan galat, hanya menimbulkan pertanyaan dari bagian keuangan
 * pelanggan berbulan-bulan kemudian.
 *
 * INI KUITANSI, BUKAN FAKTUR PAJAK. Kuitansi adalah bukti terima uang. Faktur
 * pajak menuntut status PKP dan diterbitkan lewat e-Faktur DJP — tak ada satu
 * pun bagian sistem ini yang boleh mengaku menerbitkannya, dan berkas yang
 * mengaku begitu justru merepotkan pelanggan saat diperiksa.
 */

export interface PembayaranKuitansi {
  id: string;
  plan: string;
  months: number;
  /** Rupiah utuh, bukan sen. */
  amount: number;
  provider: string;
  status: string;
  paidAt: Date | string | null;
  createdAt: Date | string;
}

/**
 * Nomor kuitansi yang STABIL dan bisa dicari.
 *
 * Diturunkan dari tanggal bayar + id transaksi, bukan dari nomor urut. Nomor
 * urut menuntut penghitung yang tak boleh bocor lompatannya, dan lompatan
 * nomor pada dokumen keuangan selalu jadi pertanyaan. Yang ini bisa dihitung
 * ulang kapan saja dari baris yang sama dan tak pernah bertabrakan, karena id
 * transaksinya sendiri unik.
 *
 * Bentuk: KW/2026-07/A1B2C3D4
 */
export function nomorKuitansi(p: Pick<PembayaranKuitansi, 'id' | 'paidAt' | 'createdAt'>): string {
  const t = new Date(p.paidAt ?? p.createdAt);
  if (Number.isNaN(t.getTime())) throw new Error('Tanggal transaksi tidak sah');
  const bulan = `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`;
  const kode = p.id.replace(/-/g, '').slice(0, 8).toUpperCase();
  return `KW/${bulan}/${kode}`;
}

/** Rupiah dengan pemisah ribuan. Nilainya sudah utuh, tak ada sen. */
export function rupiah(n: number): string {
  return `Rp${Math.round(n).toLocaleString('id-ID')}`;
}

/**
 * Terbilang — nominal dalam huruf.
 *
 * Bukan hiasan: kuitansi Indonesia lazim mencantumkannya, dan gunanya nyata —
 * angka yang diubah setelah dicetak akan bertentangan dengan hurufnya.
 */
const SATUAN = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan',
  'sepuluh', 'sebelas'];

/**
 * Bagian rekursifnya mengembalikan STRING KOSONG untuk nol, bukan "nol".
 *
 * Ini bukan kerapian melainkan kebenaran: "nol" hanya sah di tingkat
 * teratas. Di dalam rekursi ia jadi sisa yang ikut tercetak — 20 keluar
 * sebagai "dua puluh nol", dan 1.000.000 sebagai "satu juta nol". Angka
 * bulat justru yang paling sering muncul di kuitansi.
 */
function bagian(x: number): string {
  if (x === 0) return '';
  if (x < 12) return SATUAN[x];
  if (x < 20) return `${SATUAN[x - 10]} belas`;
  if (x < 100) return `${bagian(Math.floor(x / 10))} puluh ${bagian(x % 10)}`.trim();
  if (x < 200) return `seratus ${bagian(x - 100)}`.trim();
  if (x < 1_000) return `${bagian(Math.floor(x / 100))} ratus ${bagian(x % 100)}`.trim();
  if (x < 2_000) return `seribu ${bagian(x - 1_000)}`.trim();
  if (x < 1_000_000) return `${bagian(Math.floor(x / 1_000))} ribu ${bagian(x % 1_000)}`.trim();
  if (x < 1_000_000_000) return `${bagian(Math.floor(x / 1_000_000))} juta ${bagian(x % 1_000_000)}`.trim();
  return `${bagian(Math.floor(x / 1_000_000_000))} miliar ${bagian(x % 1_000_000_000)}`.trim();
}

export function terbilang(n: number): string {
  const x = Math.floor(Math.abs(n));
  return x === 0 ? 'nol' : bagian(x);
}

/** "Tiga ratus dua puluh ribu rupiah" — huruf pertama besar. */
export function terbilangRupiah(n: number): string {
  const kata = terbilang(n).replace(/\s+/g, ' ').trim();
  return `${kata.charAt(0).toUpperCase()}${kata.slice(1)} rupiah`;
}

export const PERIODE_ID: Record<string, string> = {
  pro: 'Langganan Nalar — paket Pro',
  enterprise: 'Langganan Nalar — paket Enterprise',
};

/** Uraian baris kuitansi. Plan tak dikenal tetap terbaca, bukan jadi kosong. */
export function uraian(plan: string, months: number): string {
  const dasar = PERIODE_ID[plan] ?? `Langganan Nalar — paket ${plan}`;
  return `${dasar} · ${months} bulan`;
}

/**
 * Boleh dicetak?
 *
 * HANYA transaksi yang benar-benar lunas. Kuitansi untuk tagihan yang belum
 * dibayar adalah bukti terima uang yang belum diterima — dan ia akan dipakai
 * pelanggan sebagai bukti bahwa mereka sudah membayar.
 */
export function bisaDicetak(status: string): boolean {
  return status === 'paid';
}
