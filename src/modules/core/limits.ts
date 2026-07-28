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
}

export const PLAN_LIMITS: Record<string, PlanLimits> = {
  free:       { messagesPerMonth: 1_000,    chatBurst: 10,  chatRefillPerSec: 0.5, maxChatbots: 1,        maxMembers: 2 },
  pro:        { messagesPerMonth: 50_000,   chatBurst: 40,  chatRefillPerSec: 5,   maxChatbots: 10,       maxMembers: 15 },
  enterprise: { messagesPerMonth: Infinity, chatBurst: 120, chatRefillPerSec: 20,  maxChatbots: Infinity, maxMembers: Infinity },
  onprem:     { messagesPerMonth: Infinity, chatBurst: 240, chatRefillPerSec: 40,  maxChatbots: Infinity, maxMembers: Infinity },
};

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
