/**
 * PLAN LIMITS + RATE LIMITER — proteksi biaya LLM.
 *
 * • PLAN_LIMITS: kuota bulanan & laju per plan (kolom `tenants.plan`).
 * • rateLimit(): token-bucket in-memory — tanpa Redis, ramah on-prem &
 *   single-instance. Untuk multi-instance SaaS nanti tinggal tukar
 *   implementasi (interface sama) ke Redis/Upstash.
 */

export interface PlanLimits {
  /** pesan chat per bulan (giliran user). Infinity = tak terbatas. */
  messagesPerMonth: number;
  /** laju endpoint embed per chatbot: burst & isi-ulang per detik */
  chatBurst: number;
  chatRefillPerSec: number;
  /** jumlah chatbot maksimum */
  maxChatbots: number;
  /** kursi anggota per tenant — anggota aktif + undangan yang masih berlaku */
  maxMembers: number;
  /** jumlah knowledge base maksimum */
  maxKnowledgeBases: number;
  /**
   * Jumlah POTONGAN maksimum di seluruh tenant — kuota penyimpanan yang
   * sebenarnya.
   *
   * Dibatasi per potongan, bukan per megabyte teks, karena potonganlah
   * satuan biaya yang nyata: tiap potongan menempati 8.189 byte baris
   * (terukur dengan pg_column_size di produksi) plus ±1.570 byte indeks
   * vektor yang HARUS residen di RAM pada mode langsung. Membatasi "MB teks"
   * akan menyesatkan — teks yang sama bisa jadi dua kali lipat potongan bila
   * pemenggalannya berubah.
   */
  maxChunks: number;
}

/**
 * Ukuran nyata satu potongan di basis data — diukur dengan pg_column_size
 * pada data produksi, bukan diperkirakan. Dipakai untuk MENERJEMAHKAN kuota
 * potongan jadi angka yang dimengerti manusia ("±160 MB teks").
 */
export const BYTES_PER_CHUNK = 8_189;
/** Indeks vektor berdimensi asli, per potongan. Residen di RAM (mode datar). */
export const INDEX_BYTES_PER_CHUNK = 1_572;
/** Rata-rata potongan per dokumen perkantoran (±800 karakter per potongan). */
export const CHUNKS_PER_DOC = 10;

/**
 * Kuota per plan.
 *
 * ANGKA PENYIMPANANNYA DITENTUKAN OLEH KEGUNAANNYA, bukan oleh atap
 * infrastruktur. Sasaran SaaS ini adalah chatbot yang ditanam di landing page
 * perusahaan — pengetahuan yang dijawabnya berupa profil perusahaan, katalog
 * produk, daftar harga, FAQ, dan ketentuan layanan. Itu puluhan dokumen,
 * bukan arsip. Kuota yang jauh lebih besar dari kebutuhan bukan kemurahan
 * hati; ia mengundang pemakaian yang tak pernah jadi pendapatan, dan biayanya
 * ditanggung platform.
 *
 * Terjemahan tiap angka (±10 potongan per dokumen, ±680 karakter per potongan):
 *
 *      10 potongan  ≈   1 dokumen pendek ·  ±7 KB teks · ±29 KB di basis data
 *     100 potongan  ≈  10 dokumen        · ±68 KB teks · ±290 KB di basis data
 *   1.000 potongan  ≈ 100 dokumen        ·  ±0,7 MB teks · ±2,9 MB di basis data
 *
 * ANGKA-ANGKA INI HANYA DEFAULT. Sejak migrasi 0036 superadmin bisa
 * menyetelnya dari panel Billing tanpa deploy — karena berapa yang cukup
 * menarik tanpa membuat orang betah gratis selamanya hanya bisa dijawab
 * dengan mencoba, mengamati, lalu menyesuaikan.
 *
 * `onprem` sengaja TANPA BATAS pada semuanya, dan satu-satunya yang tak bisa
 * ditimpa jadi berhingga: memaksakan kuota buatan di atas perangkat yang
 * sudah mereka bayar hanya akan terasa mengada-ada.
 */
export const PLAN_LIMITS: Record<string, PlanLimits> = {
  free: {
    /* FREE ADALAH RUANG COBA, BUKAN PAKET PEMAKAIAN — dan itu keputusan
       sadar. Angkanya sengaja dibuat tanggung: cukup untuk MELIHAT produknya
       bekerja pada dokumen sungguhan, tak cukup untuk memakainya.

       Yang harus dijaga agar keputusan ini tak berbalik jadi kerugian:
       pesan penolakannya harus MENYEBUT sebabnya dan menawarkan jalan
       keluarnya (QuotaError → 402, bukan galat generik). Batas yang menolak
       tanpa menjelaskan tak dibaca sebagai batas, melainkan sebagai produk
       yang rusak. */
    messagesPerMonth: 10, chatBurst: 5, chatRefillPerSec: 0.2,
    maxChatbots: 1, maxMembers: 1,
    // ±1 dokumen pendek. Sengaja: satu berkas cukup membuktikan jawabannya
    // benar-benar bersumber dari dokumen yang diunggah.
    maxKnowledgeBases: 1, maxChunks: 10,
  },
  pro: {
    messagesPerMonth: 5_000, chatBurst: 40, chatRefillPerSec: 5,
    maxChatbots: 10, maxMembers: 15,
    // ±10 dokumen. Cukup untuk chatbot landing page yang sungguhan: profil
    // perusahaan, katalog, daftar harga, FAQ.
    maxKnowledgeBases: 5, maxChunks: 100,
  },
  enterprise: {
    messagesPerMonth: 50_000, chatBurst: 120, chatRefillPerSec: 20,
    maxChatbots: Infinity, maxMembers: Infinity,
    // ±100 dokumen. BERHINGGA dengan sengaja: pada SaaS, kuota tanpa batas
    // berarti platform menanggung biaya yang tak bisa diperkirakan. Angkanya
    // dinaikkan per pelanggan lewat panel admin — yang tak boleh adalah tak
    // ada angkanya sama sekali.
    maxKnowledgeBases: 25, maxChunks: 1_000,
  },
  onprem: {
    // SATU-SATUNYA yang tanpa batas, dan tak bisa ditimpa jadi berhingga
    // (lihat limitsFor): di sana batasnya server milik pelanggan sendiri.
    messagesPerMonth: Infinity, chatBurst: 240, chatRefillPerSec: 40,
    maxChatbots: Infinity, maxMembers: Infinity,
    maxKnowledgeBases: Infinity, maxChunks: Infinity,
  },
};


/* Kuota EFEKTIF (default + penimpa admin) hidup di limits-server.ts —
   berkas ini sengaja tak menyentuh basis data sama sekali, karena
   konstantanya dipakai komponen klien di Dataroom. */
export function limitsForPlan(plan: string | null | undefined): PlanLimits {
  return PLAN_LIMITS[plan ?? 'free'] ?? PLAN_LIMITS.free;
}

/* ── Fitur per plan (D14) ─────────────────────────────────────────────
 * Kuota membatasi BERAPA BANYAK; daftar ini membatasi FITUR MANA.
 *
 * Free sengaja tetap FUNGSIONAL (chat + KB + 1 chatbot + riwayat) —
 * mengunci semuanya di depan membunuh konversi: orang tak membayar produk
 * yang belum pernah dilihatnya bekerja. Yang dikunci adalah kemampuan yang
 * baru terasa perlu setelah produknya dipakai serius.
 */
export type Feature =
  | 'analytics' | 'memory' | 'branding' | 'team' | 'usage' | 'onprem';

export const PLAN_FEATURES: Record<string, Feature[]> = {
  free: [],
  pro: ['analytics', 'memory', 'branding', 'team'],
  enterprise: ['analytics', 'memory', 'branding', 'team', 'usage'],
  onprem: ['analytics', 'memory', 'branding', 'team', 'usage', 'onprem'],
};

/** Plan minimum yang membuka fitur — dipakai UI utk mengarahkan upgrade. */
export const FEATURE_MIN_PLAN: Record<Feature, string> = {
  analytics: 'pro', memory: 'pro', branding: 'pro', team: 'pro',
  usage: 'enterprise', onprem: 'onprem',
};

export function planHasFeature(plan: string | null | undefined, feature: Feature): boolean {
  return (PLAN_FEATURES[plan ?? 'free'] ?? []).includes(feature);
}

/* ── Token bucket ─────────────────────────────────────────────────── */

interface Bucket { tokens: number; last: number; }
const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 50_000;                // backstop memori
let lastSweep = Date.now();

export interface RateResult { ok: boolean; retryAfterSec: number; }

/**
 * Ambil 1 token dari bucket `key`. ok=false ⇒ balas 429 + Retry-After.
 * Key yang disarankan: `chat:${publicKey}` dan `ip:${ip}` (dua lapis).
 */
export function rateLimit(key: string, burst: number, refillPerSec: number): RateResult {
  const now = Date.now();
  sweep(now);

  let b = buckets.get(key);
  if (!b) { b = { tokens: burst, last: now }; buckets.set(key, b); }

  // isi ulang proporsional waktu
  b.tokens = Math.min(burst, b.tokens + ((now - b.last) / 1000) * refillPerSec);
  b.last = now;

  if (b.tokens >= 1) { b.tokens -= 1; return { ok: true, retryAfterSec: 0 }; }
  return { ok: false, retryAfterSec: Math.ceil((1 - b.tokens) / refillPerSec) };
}

/** Bersihkan bucket idle >10 menit; jalan paling sering tiap 60 dtk. */
function sweep(now: number) {
  if (now - lastSweep < 60_000 && buckets.size < MAX_BUCKETS) return;
  lastSweep = now;
  for (const [k, b] of buckets) {
    if (now - b.last > 600_000) buckets.delete(k);
  }
}

/** Estimasi kasar token dari teks (≈4 char/token) — cukup utk metering. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
