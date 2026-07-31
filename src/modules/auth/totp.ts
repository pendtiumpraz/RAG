import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * TOTP (RFC 6238) — MURNI, tanpa I/O dan tanpa pustaka pihak ketiga.
 *
 * Ditulis sendiri karena algoritmanya kecil dan seluruhnya ada di pustaka
 * standar Node (HMAC-SHA1 + base32). Menambah dependensi untuk 60 baris
 * kripto berarti menambah satu rantai pasok lagi ke jalur LOGIN — tempat
 * yang paling tak layak menanggung risiko itu.
 *
 * DIBUKTIKAN DENGAN VEKTOR UJI RFC 6238, bukan dengan contoh buatan sendiri.
 * Bedanya menentukan: implementasi TOTP yang salah tetap menghasilkan angka
 * enam digit yang berubah tiap 30 detik dan terlihat benar sepenuhnya —
 * sampai pengguna memasang aplikasi authenticator sungguhan dan tak satu pun
 * kodenya diterima. Contoh yang ditulis penulisnya sendiri akan cocok dengan
 * bug-nya sendiri.
 */

/** Langkah waktu standar. Mengubahnya membuat aplikasi authenticator gagal. */
export const PERIODE_DETIK = 30;
/** Panjang kode. 6 digit adalah yang dipahami setiap aplikasi authenticator. */
export const DIGIT = 6;

/**
 * Toleransi geser waktu, dalam LANGKAH.
 *
 * 1 berarti kode dari 30 detik lalu dan 30 detik ke depan ikut diterima —
 * total jendela 90 detik. Itu batas yang lazim, dan alasannya dua arah:
 * jam ponsel yang meleset beberapa detik adalah hal biasa, sementara
 * memperlebarnya jadi 2-3 langkah memberi penyerang jendela menebak yang
 * berlipat tanpa menolong pengguna yang jamnya benar.
 */
export const TOLERANSI_LANGKAH = 1;

/* ── base32 (RFC 4648, tanpa padding) ───────────────────────────────── */

const ALFABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer): string {
  let bit = 0, nilai = 0, out = '';
  for (const b of buf) {
    nilai = (nilai << 8) | b;
    bit += 8;
    while (bit >= 5) {
      out += ALFABET[(nilai >>> (bit - 5)) & 31];
      bit -= 5;
    }
  }
  if (bit > 0) out += ALFABET[(nilai << (5 - bit)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  // Spasi dan padding dibuang: aplikasi authenticator menampilkan rahasia
  // berkelompok empat huruf, dan orang menyalinnya apa adanya.
  const bersih = s.toUpperCase().replace(/[\s=-]/g, '');
  let bit = 0, nilai = 0;
  const out: number[] = [];
  for (const c of bersih) {
    const i = ALFABET.indexOf(c);
    if (i < 0) throw new Error(`Karakter base32 tak sah: ${c}`);
    nilai = (nilai << 5) | i;
    bit += 5;
    if (bit >= 8) {
      out.push((nilai >>> (bit - 8)) & 255);
      bit -= 8;
    }
  }
  return Buffer.from(out);
}

/* ── inti TOTP ──────────────────────────────────────────────────────── */

/**
 * Rahasia baru. 20 byte = 160 bit, panjang yang direkomendasikan RFC 4226
 * untuk HMAC-SHA1 — lebih pendek melemahkannya, lebih panjang tak menambah
 * apa pun karena HMAC-SHA1 memampatkannya ke 160 bit juga.
 */
export function buatRahasia(): string {
  return base32Encode(randomBytes(20));
}

/** Kode untuk satu penghitung (HOTP, RFC 4226). */
export function hotp(rahasia: Buffer, penghitung: number): string {
  const buf = Buffer.alloc(8);
  // Penghitung ditulis sebagai big-endian 64-bit. writeBigUInt64BE dipakai
  // supaya tetap benar setelah tahun 2038 — pergeseran 32-bit akan meluap
  // diam-diam, dan bug yang muncul bertahun-tahun kemudian adalah bug yang
  // tak seorang pun hubungkan dengan baris ini.
  buf.writeBigUInt64BE(BigInt(penghitung));
  const h = createHmac('sha1', rahasia).update(buf).digest();
  const offset = h[h.length - 1] & 0x0f;
  const kode = ((h[offset] & 0x7f) << 24)
    | ((h[offset + 1] & 0xff) << 16)
    | ((h[offset + 2] & 0xff) << 8)
    | (h[offset + 3] & 0xff);
  return String(kode % 10 ** DIGIT).padStart(DIGIT, '0');
}

/** Langkah waktu untuk sebuah cap waktu (ms). */
export const langkahUntuk = (ms: number) => Math.floor(ms / 1000 / PERIODE_DETIK);

/** Kode yang berlaku pada saat `ms`. */
export function totp(rahasiaBase32: string, ms = Date.now()): string {
  return hotp(base32Decode(rahasiaBase32), langkahUntuk(ms));
}

/** Perbandingan waktu-tetap. Panjang beda → langsung gagal, tanpa membocorkan. */
function samaAman(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  if (x.length !== y.length) return false;
  return timingSafeEqual(x, y);
}

export interface HasilVerifikasi {
  sah: boolean;
  /**
   * Langkah waktu kode yang diterima.
   *
   * WAJIB disimpan pemanggil dan ditolak bila terulang. Tanpa itu, kode yang
   * sama bisa dipakai berkali-kali selama 90 detik — dan penyerang yang
   * sempat melihat layar korban, membaca notifikasi, atau mencegat satu kode
   * punya jendela penuh untuk memakainya lagi. Ini bukan kehalusan teori:
   * satu kode SATU KALI adalah inti dari "sesuatu yang kamu punya".
   */
  langkah: number | null;
}

/**
 * Verifikasi kode terhadap jendela toleransi.
 *
 * `langkahTerakhir` = langkah yang sudah pernah dipakai akun ini. Kode pada
 * langkah itu atau sebelumnya DITOLAK walau angkanya benar.
 */
export function verifikasiTotp(
  rahasiaBase32: string,
  kode: string,
  opts: { ms?: number; langkahTerakhir?: number | null } = {},
): HasilVerifikasi {
  const bersih = kode.replace(/\s/g, '');
  if (!/^\d+$/.test(bersih) || bersih.length !== DIGIT) return { sah: false, langkah: null };

  const rahasia = base32Decode(rahasiaBase32);
  const kini = langkahUntuk(opts.ms ?? Date.now());

  for (let d = -TOLERANSI_LANGKAH; d <= TOLERANSI_LANGKAH; d++) {
    const langkah = kini + d;
    if (opts.langkahTerakhir != null && langkah <= opts.langkahTerakhir) continue;
    if (samaAman(hotp(rahasia, langkah), bersih)) return { sah: true, langkah };
  }
  return { sah: false, langkah: null };
}

/* ── URL otpauth (untuk QR) ─────────────────────────────────────────── */

/**
 * URI yang dipindai aplikasi authenticator.
 *
 * Label memuat penerbit DUA KALI (di path dan di parameter) — itu bukan
 * kelalaian melainkan tuntutan spesifikasi Key Uri Format: aplikasi lama
 * membaca yang di path, yang baru membaca parameternya, dan menghilangkan
 * salah satu membuat entri muncul tanpa nama di sebagian aplikasi.
 */
export function otpauthUrl(rahasia: string, email: string, penerbit = 'Nalar'): string {
  const label = encodeURIComponent(`${penerbit}:${email}`);
  const p = new URLSearchParams({
    secret: rahasia, issuer: penerbit,
    algorithm: 'SHA1', digits: String(DIGIT), period: String(PERIODE_DETIK),
  });
  return `otpauth://totp/${label}?${p.toString()}`;
}

/* ── kode cadangan ──────────────────────────────────────────────────── */

/** Berapa kode cadangan diberikan saat pendaftaran. */
export const JUMLAH_CADANGAN = 10;

/**
 * Kode cadangan sekali pakai.
 *
 * Ada karena kehilangan ponsel adalah kejadian biasa, bukan luar biasa —
 * dan 2FA tanpa jalan pulih hanya memindahkan risiko dari "akun dibobol"
 * ke "akun hilang selamanya". Yang kedua lebih sering terjadi.
 *
 * Formatnya huruf-angka tanpa vokal: menghilangkan kemungkinan kode acak
 * membentuk kata yang tak pantas, sekaligus menghapus kebingungan O/0 dan
 * I/1 saat orang menyalinnya dari kertas.
 */
const ALFABET_CADANGAN = '23456789BCDFGHJKMNPQRSTVWXYZ';

export function buatKodeCadangan(n = JUMLAH_CADANGAN): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const b = randomBytes(10);
    let s = '';
    for (const x of b) s += ALFABET_CADANGAN[x % ALFABET_CADANGAN.length];
    out.push(`${s.slice(0, 5)}-${s.slice(5, 10)}`);
  }
  return out;
}

/** Normalisasi sebelum dibandingkan — orang mengetiknya dengan spasi & huruf kecil. */
export const normalisasiCadangan = (s: string) =>
  s.toUpperCase().replace(/[^0-9A-Z]/g, '');
