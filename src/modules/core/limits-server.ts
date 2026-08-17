import { PLAN_LIMITS, limitsForPlan, type PlanLimits } from './limits';

/**
 * KUOTA EFEKTIF — default kode ditimpa setelan admin.
 *
 * TERPISAH dari `limits.ts` dengan sengaja, dan bukan demi kerapian:
 * `limits.ts` memuat konstanta yang dipakai KOMPONEN KLIEN (kalkulator
 * kapasitas & slide batas langganan di Dataroom). Begitu berkas itu menyentuh
 * `db` — bahkan lewat impor dinamis — webpack menyeret seluruh driver
 * Postgres ke bundle browser dan build gagal mencari modul `tls`.
 *
 * Jadi pembagiannya tegas: `limits.ts` = angka murni, aman di mana pun.
 * Berkas ini = yang membaca basis data, hanya untuk server.
 */

interface QuotaOverride { [plan: string]: Partial<PlanLimits> | undefined }

let cache: { at: number; data: QuotaOverride } | null = null;

/** 60 detik: perubahan admin terasa hampir seketika, tapi jalur chat tak
 *  pernah menyentuh basis data lebih dari sekali per menit. */
const TTL_MS = 60_000;

/** Dipanggil setelah admin menyimpan — supaya perubahannya langsung terasa. */
export function invalidatePlanLimits(): void { cache = null; }

async function overrides(): Promise<QuotaOverride> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;
  try {
    const { db, platformSettings } = await import('./db');
    const row = (await db.select({ q: platformSettings.planQuotas })
      .from(platformSettings).limit(1))[0];
    cache = { at: Date.now(), data: (row?.q as QuotaOverride) ?? {} };
  } catch (err) {
    // Basis data tak terjangkau TIDAK boleh mematikan penegakan kuota.
    // Default di kode adalah jawaban yang aman: ia membatasi, bukan
    // membebaskan — kegagalan yang menutup pintu, bukan membukanya.
    console.error('[limits] gagal membaca penimpa kuota, memakai default:', err);
    cache = { at: Date.now(), data: {} };
  }
  return cache.data;
}

/**
 * Kuota efektif sebuah plan.
 *
 * `onprem` sengaja TAK BISA ditimpa jadi berhingga. Membiarkannya bisa
 * berarti satu salah ketik di panel admin mematikan pemasangan on-premise
 * pelanggan — di server yang sudah mereka bayar sendiri.
 */
export async function limitsFor(plan: string | null | undefined): Promise<PlanLimits> {
  const dasar = limitsForPlan(plan);
  if ((plan ?? 'free') === 'onprem') return dasar;

  const o = (await overrides())[plan ?? 'free'];
  if (!o) return dasar;

  const ambil = (k: keyof PlanLimits): number => {
    const v = o[k];
    // `null` di JSON berarti TANPA BATAS: Infinity tak punya padanan di JSON,
    // jadi ia harus diterjemahkan di sini — bukan di UI, yang bisa lupa.
    if (v === null) return Infinity;
    return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : dasar[k];
  };

  return {
    messagesPerMonth: ambil('messagesPerMonth'),
    chatBurst: ambil('chatBurst'),
    chatRefillPerSec: ambil('chatRefillPerSec'),
    maxChatbots: ambil('maxChatbots'),
    maxMembers: ambil('maxMembers'),
    maxKnowledgeBases: ambil('maxKnowledgeBases'),
    maxChunks: ambil('maxChunks'),
    storageBytes: ambil('storageBytes'),
  };
}

export { PLAN_LIMITS };
