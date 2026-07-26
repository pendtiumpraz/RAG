import { randomUUID } from 'node:crypto';
import { audit } from './guardrails';

/**
 * OBSERVABILITY — log terstruktur + pencatatan galat.
 *
 * Sengaja tanpa layanan pihak ketiga: di Vercel, stdout sudah masuk ke log
 * platform, dan di VPS/on-prem `journalctl` menangkapnya. Satu baris JSON per
 * peristiwa bisa langsung di-grep atau disedot ke agregator apa pun nanti,
 * tanpa mengunci proyek ke satu vendor.
 *
 * Yang TIDAK boleh masuk ke sini: isi dokumen tenant, pertanyaan pengguna,
 * token, atau API key. Log dibaca lebih banyak orang daripada database.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogFields {
  event: string;
  requestId?: string;
  tenantId?: string;
  chatbotId?: string;
  route?: string;
  status?: number;
  durationMs?: number;
  [k: string]: unknown;
}

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const MIN_LEVEL = LEVEL_ORDER[(process.env.LOG_LEVEL as LogLevel) ?? 'info'] ?? 20;

/** Buang nilai yang berpotensi rahasia sebelum menulis log. */
const SECRET_KEYS = /token|password|secret|apikey|api_key|authorization|cookie/i;

function sanitize(fields: LogFields): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (SECRET_KEYS.test(k)) { out[k] = '[redacted]'; continue; }
    // Teks panjang hampir selalu berarti konten pengguna — jangan disalin ke log.
    out[k] = typeof v === 'string' && v.length > 200 ? `${v.slice(0, 200)}…[dipotong]` : v;
  }
  return out;
}

export function log(level: LogLevel, fields: LogFields): void {
  if (LEVEL_ORDER[level] < MIN_LEVEL) return;
  const line = JSON.stringify({ level, ts: new Date().toISOString(), ...sanitize(fields) });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const newRequestId = (): string => randomUUID();

/** Ukur durasi sebuah operasi lalu catat hasilnya (sukses maupun gagal). */
export async function timed<T>(fields: LogFields, fn: () => Promise<T>): Promise<T> {
  const t0 = Date.now();
  try {
    const out = await fn();
    log('info', { ...fields, durationMs: Date.now() - t0, ok: true });
    return out;
  } catch (err) {
    log('error', {
      ...fields, durationMs: Date.now() - t0, ok: false,
      error: (err as Error).message,
    });
    throw err;
  }
}

/**
 * Catat galat ke log DAN ke audit_logs, supaya terlihat di dashboard ops.
 * Sengaja tidak pernah melempar: kegagalan pencatatan tak boleh menjatuhkan
 * permintaan yang sedang ditangani.
 */
export async function recordError(
  tenantId: string | null,
  actor: string,
  err: unknown,
  context: Record<string, unknown> = {},
): Promise<void> {
  const e = err as Error;
  log('error', { event: 'error', tenantId: tenantId ?? undefined, error: e?.message, ...context });
  if (!tenantId) return;      // audit_logs ber-tenant; tanpa tenant tak ada tempatnya
  try {
    await audit(tenantId, actor, 'error', undefined, {
      message: e?.message?.slice(0, 500) ?? 'unknown',
      name: e?.name,
      ...context,
    });
  } catch { /* sudah dicatat ke stdout di atas */ }
}
