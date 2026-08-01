/**
 * DEMO PUBLIK — aturan remnya, murni.
 *
 * Keputusan pemilik produk (1 Agu 2026): pengunjung boleh mencoba tanpa
 * mendaftar, karena orang perlu melihat produknya bekerja sebelum membuat
 * akun. Remnya yang dicentang: matikan otomatis saat kuota bulanan habis.
 *
 * Tiap jawaban demo dibayar dengan token yang tak pernah jadi pendapatan,
 * dan pengunjungnya anonim — tak ada yang bisa ditagih, diperingatkan, atau
 * dibatasi selain oleh angka ini. Karena itu remnya harus KERAS dan bekerja
 * tanpa siapa pun menonton.
 */

export type KeadaanDemo = 'jalan' | 'kuota-habis' | 'mati';

export interface PutusanDemo {
  keadaan: KeadaanDemo;
  boleh: boolean;
  terpakai: number;
  batas: number;
  /** Kalimat untuk pengunjung — kosong bila demonya jalan. */
  pesan: string;
}

/**
 * Kalimat saat kuota habis.
 *
 * TIDAK menyebut angka kuotanya, dan itu bukan kerahasiaan berlebihan:
 * pengunjung tak bisa berbuat apa-apa dengan angka itu, sementara
 * menyebutkannya memberi tahu penyerang persis berapa permintaan yang
 * diperlukan untuk mematikan demo bulan berikutnya.
 *
 * Menawarkan jalan keluar, bukan cuma menutup pintu — orang yang tertarik
 * justru datang di saat yang salah, dan pintu buntu mengubah minat jadi
 * kepergian.
 */
export const PESAN_DEMO_HABIS =
  'Demo publik sedang istirahat sampai bulan depan. Buat akun gratis untuk '
  + 'mencobanya dengan dokumen Anda sendiri — tanpa antre, dan jawabannya '
  + 'bersumber dari berkas Anda, bukan dari contoh.';

/** Penanda periode bulanan — sama bentuknya dengan usage_counters. */
export function periodeDemo(saat: Date): string {
  return `${saat.getUTCFullYear()}-${String(saat.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Boleh atau tidak satu permintaan demo dilayani.
 *
 * Batas 0 berarti MATI TOTAL, bukan tanpa batas — kebalikannya akan membuat
 * "matikan demo" (cara paling wajar orang menuliskannya) justru membuka
 * kerannya lebar-lebar. `null` yang berarti tanpa batas sengaja TIDAK
 * disediakan: demo tanpa batas adalah lubang biaya yang hanya kelihatan di
 * tagihan bulan berikutnya, dan pemilik produk memilih rem, bukan keran.
 */
export function putusanDemo(input: {
  chatbotId: string | null;
  terpakai: number;
  batas: number;
}): PutusanDemo {
  const batas = Math.max(0, Math.floor(input.batas));
  const terpakai = Math.max(0, Math.floor(input.terpakai));

  if (!input.chatbotId) {
    return { keadaan: 'mati', boleh: false, terpakai, batas, pesan: PESAN_DEMO_HABIS };
  }
  if (terpakai >= batas) {
    return { keadaan: 'kuota-habis', boleh: false, terpakai, batas, pesan: PESAN_DEMO_HABIS };
  }
  return { keadaan: 'jalan', boleh: true, terpakai, batas, pesan: '' };
}

/**
 * Berapa persen kuota demo yang sudah terpakai — untuk panel superadmin.
 *
 * Batas nol menghasilkan 100%, bukan pembagian dengan nol: demonya memang
 * tak punya sisa sama sekali, dan NaN di layar akan terbaca sebagai kerusakan
 * alih-alih sebagai keadaan yang disengaja.
 */
export function persenTerpakai(terpakai: number, batas: number): number {
  if (batas <= 0) return 100;
  return Math.min(100, Math.round((terpakai / batas) * 100));
}
