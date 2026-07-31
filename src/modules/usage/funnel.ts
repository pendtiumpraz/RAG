/**
 * FUNNEL PRODUK — di titik mana pendaftar berhenti.
 *
 * Modul MURNI: tak menyentuh basis data, sehingga bisa diuji tanpa apa pun
 * yang berjalan.
 *
 * KENAPA DIBANGUN SEKARANG, SAAT PENGGUNANYA MASIH DUA. Pelajaran dari kartu
 * a-plan-quota-eval: kartu itu bertahun-tahun disebut "menunggu pengguna",
 * dan ternyata penolakan kuota TAK PERNAH dicatat ke mana pun — jadi menunggu
 * lebih lama takkan memperbaiki apa pun. Funnel punya bentuk masalah yang
 * sama: pertanyaan "di mana orang berhenti" hanya bisa dijawab bila keadaan
 * tiap tahap sudah terekam saat orangnya lewat. Bedanya, seluruh bahan funnel
 * ini SUDAH ada di basis data — tak ada pelacakan baru yang perlu ditambahkan,
 * hanya pembacaan yang belum pernah dilakukan.
 */

/** Satu tahap perjalanan tenant, dari mendaftar sampai membayar. */
export interface Tahap {
  kunci: string;
  label: string;
  /** Kenapa tahap ini penting — dicetak di laporan, bukan disimpan di kepala. */
  arti: string;
}

/**
 * Tahapnya BERSARANG: tiap tahap adalah bagian dari tahap sebelumnya.
 *
 * Itu yang membuat funnel bisa dibaca. Tahap yang saling lepas menghasilkan
 * angka yang naik-turun tanpa arti — dan "80% membuat chatbot, 90% verifikasi
 * email" tak memberi tahu siapa pun di mana orang berhenti.
 */
export const TAHAP: Tahap[] = [
  { kunci: 'daftar', label: 'Mendaftar', arti: 'Akun dibuat — pintu masuk paling atas.' },
  { kunci: 'terverifikasi', label: 'Email terverifikasi', arti: 'Hanya ditegakkan bila SMTP aktif; tanpa SMTP tahap ini otomatis lolos.' },
  { kunci: 'disetujui', label: 'Disetujui superadmin', arti: 'Gerbang manual. Tertahan di sini berarti ANTREAN KITA, bukan keraguan pengguna.' },
  { kunci: 'punyaChatbot', label: 'Membuat chatbot', arti: 'Langkah pertama yang benar-benar dilakukan sendiri.' },
  { kunci: 'punyaPengetahuan', label: 'Mengisi pengetahuan', arti: 'Potongan dokumen masuk. Tanpa ini chatbotnya tak bisa menjawab apa pun.' },
  { kunci: 'punyaPercakapan', label: 'Menerima pertanyaan', arti: 'Bukti produknya benar-benar dipakai, bukan sekadar disiapkan.' },
  { kunci: 'membayar', label: 'Membayar', arti: 'Transaksi lunas pertama. Berhenti di sini berarti produknya sudah dipakai tapi belum cukup berharga untuk dibayar — pertanyaan harga, bukan pertanyaan produk.' },
];

/** Keadaan satu tenant pada tiap tahap. */
export type KeadaanTenant = Record<string, boolean>;

export interface BarisFunnel {
  kunci: string;
  label: string;
  arti: string;
  jumlah: number;
  /**
   * Bagian yang bertahan dari tahap SEBELUMNYA, atau null bila tahap
   * sebelumnya nol — pembagian dengan nol menghasilkan angka yang terlihat
   * pasti dan tak berarti apa pun.
   */
  lanjutDariSebelumnya: number | null;
  /** Berapa yang berhenti tepat di sini. */
  berhenti: number;
}

/**
 * Ambang di bawah mana persentase TIDAK ditampilkan.
 *
 * Dengan tiga pendaftar, satu orang yang berhenti adalah "33% drop-off" —
 * angka yang terlihat seperti temuan dan sebenarnya satu orang. Menampilkan
 * persen pada N kecil bukan sekadar tak berguna; ia mengundang keputusan
 * produk yang diambil dari derau.
 */
export const MIN_UNTUK_PERSEN = 20;

/**
 * Hitung funnel dari keadaan tiap tenant.
 *
 * Tahap dipaksa BERSARANG: sebuah tenant hanya dihitung pada satu tahap bila
 * ia juga memenuhi seluruh tahap sebelumnya. Tanpa pemaksaan itu, tenant yang
 * dibuat lewat jalur admin (mis. dibuatkan manual lalu langsung diisi
 * dokumen) akan muncul di tahap akhir tanpa pernah melewati yang awal, dan
 * grafiknya menanjak di tengah — pemandangan yang mustahil pada funnel dan
 * langsung menghapus kepercayaan pada seluruh angkanya.
 */
export function hitungFunnel(tenant: KeadaanTenant[]): BarisFunnel[] {
  const keluar: BarisFunnel[] = [];
  let sebelumnya: number | null = null;

  for (let i = 0; i < TAHAP.length; i++) {
    const t = TAHAP[i];
    const sampaiSini = TAHAP.slice(0, i + 1).map((x) => x.kunci);
    const jumlah = tenant.filter((k) => sampaiSini.every((s) => k[s])).length;

    keluar.push({
      kunci: t.kunci,
      label: t.label,
      arti: t.arti,
      jumlah,
      lanjutDariSebelumnya: sebelumnya === null ? null
        : sebelumnya === 0 ? null
        : jumlah / sebelumnya,
      berhenti: sebelumnya === null ? 0 : Math.max(0, sebelumnya - jumlah),
    });
    sebelumnya = jumlah;
  }
  return keluar;
}

/** Boleh menampilkan persentase pada populasi sebesar ini? */
export function bolehPersen(totalPendaftar: number): boolean {
  return totalPendaftar >= MIN_UNTUK_PERSEN;
}

/**
 * Tahap dengan kebocoran terbesar — atau null bila belum layak disimpulkan.
 *
 * Menolak menjawab pada N kecil adalah bagian dari gunanya. Laporan yang
 * selalu menunjuk "tahap terburuk" akan menunjuk sesuatu bahkan ketika
 * datanya tiga orang, dan yang membacanya akan memperbaiki tahap yang tak
 * pernah rusak.
 */
export function tahapPalingBocor(baris: BarisFunnel[]): BarisFunnel | null {
  const total = baris[0]?.jumlah ?? 0;
  if (!bolehPersen(total)) return null;
  const kandidat = baris.slice(1).filter((b) => b.berhenti > 0);
  if (!kandidat.length) return null;
  return kandidat.reduce((a, b) => (b.berhenti > a.berhenti ? b : a));
}

/** Persen dengan satu desimal; null tetap null, bukan "0%". */
export function persen(x: number | null): string {
  return x === null ? '—' : `${(x * 100).toFixed(1)}%`;
}
