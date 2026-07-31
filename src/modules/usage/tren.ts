/**
 * TREN PEMAKAIAN HARIAN — bentuk deret dan ringkasannya.
 *
 * Dipisah dari komponen supaya bisa diuji tanpa peramban, dan karena
 * kesalahannya bukan kesalahan yang melempar: grafik yang salah tetap
 * tergambar rapi, dan orang membacanya sebagai kenyataan.
 */

export interface TitikTren {
  /** YYYY-MM-DD (UTC). */
  hari: string;
  pesan: number;
}

const HARI_MS = 86_400_000;

/** Hari UTC dari sebuah waktu, YYYY-MM-DD. */
function hariUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Isi hari yang TIDAK ADA datanya dengan nol.
 *
 * Ini bukan kerapian, ini kebenaran. `usageService.breakdown()` memakai
 * `group by day`, jadi hari tanpa satu pun percakapan sama sekali tak muncul
 * di hasilnya. Menggambar deret itu apa adanya akan merapatkan hari-hari
 * yang berjauhan: tiga hari sibuk yang tersebar sepanjang sebulan tampak
 * seperti tiga hari berturut-turut yang ramai, dan grafiknya menceritakan
 * pertumbuhan yang tak pernah terjadi.
 *
 * Deretnya juga dipaksa sepanjang `hari` penuh dan berakhir HARI INI, supaya
 * sumbu waktunya tetap sama meski datanya berubah — grafik yang sumbunya
 * ikut menyusut membuat dua tangkapan layar tak bisa dibandingkan.
 */
export function isiHariKosong(
  data: Array<{ day: string; messages: number }>,
  hari: number,
  sekarangMs: number,
): TitikTren[] {
  if (hari < 1) throw new Error('Jendela minimal 1 hari');
  const peta = new Map<string, number>();
  for (const d of data) {
    // Dijumlahkan, bukan ditimpa: sumber yang mengirim satu hari dua kali
    // (mis. dua model) tak boleh diam-diam kehilangan salah satunya.
    peta.set(d.day, (peta.get(d.day) ?? 0) + Number(d.messages || 0));
  }
  const keluar: TitikTren[] = [];
  for (let i = hari - 1; i >= 0; i--) {
    const h = hariUtc(sekarangMs - i * HARI_MS);
    keluar.push({ hari: h, pesan: peta.get(h) ?? 0 });
  }
  return keluar;
}

export interface RingkasTren {
  total: number;
  /** Rata-rata per hari sepanjang jendela, termasuk hari kosong. */
  rerata: number;
  /** Hari tersibuk, atau null bila tak ada aktivitas sama sekali. */
  puncak: TitikTren | null;
  /**
   * Arah tren, atau NULL bila belum cukup data untuk mengatakannya.
   * null bukan 'datar' — yang satu berarti "belum bisa tahu", yang lain
   * berarti "sudah tahu, dan jawabannya tidak berubah".
   */
  arah: 'naik' | 'turun' | 'datar' | null;
  /** Perubahan persen paruh akhir terhadap paruh awal; null bila arah null. */
  persen: number | null;
}

/** Jendela minimum sebelum arah tren boleh disebut. */
export const MIN_HARI_TREN = 14;
/** Perubahan di bawah ini disebut datar — bukan naik/turun karena derau. */
const AMBANG_DATAR = 0.1;

/**
 * Ringkas deret jadi angka yang boleh ditampilkan.
 *
 * Arah tren SENGAJA menolak menjawab pada jendela pendek atau paruh awal yang
 * kosong. Tenant baru selalu punya paruh awal nol, dan membaginya menghasilkan
 * "naik tak terhingga" — angka yang bukan cuma jelek, tapi memberi kesan
 * pertumbuhan kepada orang yang baru memakai produknya satu hari.
 */
export function ringkasTren(titik: TitikTren[]): RingkasTren {
  const total = titik.reduce((a, t) => a + t.pesan, 0);
  const rerata = titik.length ? total / titik.length : 0;
  const puncak = titik.reduce<TitikTren | null>(
    (best, t) => (t.pesan > 0 && (!best || t.pesan > best.pesan) ? t : best), null);

  if (titik.length < MIN_HARI_TREN) return { total, rerata, puncak, arah: null, persen: null };

  const tengah = Math.floor(titik.length / 2);
  const awal = titik.slice(0, tengah).reduce((a, t) => a + t.pesan, 0);
  const akhir = titik.slice(tengah).reduce((a, t) => a + t.pesan, 0);
  if (awal === 0) return { total, rerata, puncak, arah: null, persen: null };

  const rasio = (akhir - awal) / awal;
  const arah = Math.abs(rasio) < AMBANG_DATAR ? 'datar' : rasio > 0 ? 'naik' : 'turun';
  return { total, rerata, puncak, arah, persen: Math.round(rasio * 100) };
}

/**
 * Tinggi batang dalam persen, relatif hari tersibuk.
 *
 * Hari kosong diberi tinggi 0 dan bukan tinggi minimum: batang kecil yang
 * selalu terlihat membuat jeda panjang tampak seperti aktivitas rendah yang
 * berkelanjutan, padahal tak ada apa-apa di sana.
 */
export function tinggiBatang(pesan: number, maks: number): number {
  if (maks <= 0 || pesan <= 0) return 0;
  return Math.max(2, Math.round((pesan / maks) * 100));
}
