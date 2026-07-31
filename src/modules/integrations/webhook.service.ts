import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { webhooks } from '@/modules/core/db';
import { withTenant } from '@/modules/core/db/tenant-context';
import { encryptSecret, decryptSecret } from '@/modules/core/crypto';
import { audit } from '@/modules/core/guardrails';
import { on, type NalarEvents } from '@/modules/core/events';
import { enqueueJob, registerJobHandler } from '@/modules/core/jobs';
import { assertPublicHttpUrl } from '@/modules/core/net';

/**
 * WEBHOOK KELUAR — pintu keluar programatik.
 *
 * Menumpang bus event yang sudah ada (`core/events.ts`) alih-alih membangun
 * pipa baru: modul yang menerbitkan kejadian tak perlu tahu webhook ada, dan
 * menambah kejadian baru cukup menambahkannya di daftar di bawah.
 *
 * Pengiriman lewat job runner, BUKAN di dalam permintaan yang memicunya.
 * Endpoint pelanggan bisa lambat atau mati; menunggunya berarti sync dan chat
 * ikut melambat karena hal yang bukan urusan mereka.
 *
 * Tiap kiriman ditandatangani HMAC-SHA256 atas body MENTAH. Tanpa itu siapa
 * pun yang tahu URL-nya bisa mengirim kejadian palsu.
 */

/** Kejadian yang boleh dilanggan — himpunan bagian dari NalarEvents. */
export const WEBHOOK_EVENTS = [
  'document.ingested',
  'document.deleted',
  'source.connected',
  'conversation.turn',
  'chatbot.created',
  'chatbot.deleted',
  'alert.raised',
] as const satisfies ReadonlyArray<keyof NalarEvents>;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export const EVENT_LABEL: Record<WebhookEvent, string> = {
  'document.ingested': 'Dokumen masuk ke knowledge base',
  'document.deleted': 'Dokumen dihapus',
  'source.connected': 'Sumber data dihubungkan',
  'conversation.turn': 'Giliran percakapan baru',
  'chatbot.created': 'Chatbot dibuat',
  'chatbot.deleted': 'Chatbot dihapus',
  'alert.raised': 'Peringatan: sync gagal, kuota nyaris habis, galat melonjak',
};

export interface WebhookRow {
  id: string; url: string; events: WebhookEvent[]; enabled: boolean;
  lastStatus: number | null; lastAttemptAt: Date | null; lastError: string | null;
  failCount: number; createdAt: Date;
}

const JOB = 'webhook.deliver';
/** Batas waktu ketukan — endpoint mati tak boleh menahan lambda. */
const TIMEOUT_MS = 8_000;
/** Setelah sekian gagal beruntun, webhook dimatikan sendiri. */
const MAX_FAILS = 20;

/** Tanda tangan kiriman: hex HMAC-SHA256 atas body mentah. */
export function signPayload(secret: string, body: string): string {
  return createHmac('sha256', secret).update(body, 'utf8').digest('hex');
}

/** Untuk penerima (dan tes): verifikasi waktu-tetap. */
export function verifySignature(secret: string, body: string, signature: string): boolean {
  const expected = signPayload(secret, body);
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature ?? '', 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

export const webhookService = {
  async list(tenantId: string): Promise<WebhookRow[]> {
    const rows = await withTenant(tenantId, (tx) =>
      tx.select().from(webhooks).where(isNull(webhooks.deletedAt)).orderBy(desc(webhooks.createdAt)));
    return rows.map(toRow);
  },

  /** Buat webhook. Rahasianya dikembalikan SEKALI supaya bisa dipasang di sisi penerima. */
  async create(
    actor: { id: string; tenantId: string },
    input: { url: string; events: WebhookEvent[] },
  ): Promise<{ secret: string; row: WebhookRow }> {
    const url = assertDeliverableUrl(input.url);
    const secret = `whsec_${randomBytes(24).toString('base64url')}`;
    const events = input.events.filter((e) => (WEBHOOK_EVENTS as readonly string[]).includes(e));

    const row = await withTenant(actor.tenantId, async (tx) =>
      (await tx.insert(webhooks).values({
        tenantId: actor.tenantId, url,
        encryptedSecret: encryptSecret(secret),
        events,
      }).returning())[0]);

    await audit(actor.tenantId, actor.id, 'webhook.created', row.id, { url, events });
    return { secret, row: toRow(row) };
  },

  async update(
    actor: { id: string; tenantId: string },
    id: string,
    input: { url?: string; events?: WebhookEvent[]; enabled?: boolean },
  ): Promise<void> {
    await withTenant(actor.tenantId, (tx) =>
      tx.update(webhooks).set({
        ...(input.url ? { url: assertDeliverableUrl(input.url) } : {}),
        ...(input.events ? { events: input.events.filter((e) => (WEBHOOK_EVENTS as readonly string[]).includes(e)) } : {}),
        ...(input.enabled !== undefined ? { enabled: input.enabled, ...(input.enabled ? { failCount: 0 } : {}) } : {}),
        updatedAt: new Date(),
      }).where(and(eq(webhooks.id, id), isNull(webhooks.deletedAt))));
    await audit(actor.tenantId, actor.id, 'webhook.updated', id, input as Record<string, unknown>);
  },

  async remove(actor: { id: string; tenantId: string }, id: string): Promise<void> {
    await withTenant(actor.tenantId, (tx) =>
      tx.update(webhooks).set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(webhooks.id, id)));
    await audit(actor.tenantId, actor.id, 'webhook.deleted', id, {});
  },

  /** Ketuk sekali dengan kejadian uji — cara membuktikan pemasangan tanpa menunggu kejadian nyata. */
  async test(tenantId: string, id: string): Promise<{ ok: boolean; status: number | null; error: string | null }> {
    const row = (await withTenant(tenantId, (tx) =>
      tx.select().from(webhooks).where(and(eq(webhooks.id, id), isNull(webhooks.deletedAt))).limit(1)))[0];
    if (!row) return { ok: false, status: null, error: 'Webhook tidak ditemukan' };
    return deliverOne(tenantId, row, 'webhook.test', { message: 'Kiriman uji dari Nalar' });
  },

  /** Antre kiriman utk semua webhook tenant yang melanggan kejadian ini. */
  async fanout(tenantId: string, event: WebhookEvent, payload: unknown): Promise<void> {
    const rows = await withTenant(tenantId, (tx) =>
      tx.select().from(webhooks).where(and(eq(webhooks.enabled, true), isNull(webhooks.deletedAt))));
    const targets = rows.filter((r) => (r.events ?? []).includes(event));
    if (!targets.length) return;
    for (const r of targets) {
      enqueueJob(JOB, `${r.id}:${Date.now()}:${Math.random()}`, { tenantId, id: r.id, event, payload });
    }
  },
};

/* ── pengiriman ─────────────────────────────────────────────────────── */

interface DeliverPayload { tenantId: string; id: string; event: string; payload: unknown }

registerJobHandler(JOB, async (raw) => {
  const { tenantId, id, event, payload } = raw as DeliverPayload;
  const row = (await withTenant(tenantId, (tx) =>
    tx.select().from(webhooks).where(and(eq(webhooks.id, id), isNull(webhooks.deletedAt))).limit(1)))[0];
  if (!row || !row.enabled) return;
  await deliverOne(tenantId, row, event, payload);
});

async function deliverOne(
  tenantId: string, row: typeof webhooks.$inferSelect, event: string, payload: unknown,
): Promise<{ ok: boolean; status: number | null; error: string | null }> {
  const body = JSON.stringify({
    event,
    // Waktu kejadian ikut ditandatangani, jadi penerima bisa menolak kiriman
    // lama yang diputar ulang penyerang.
    sentAt: new Date().toISOString(),
    tenantId,
    data: payload,
  });
  const secret = decryptSecret(row.encryptedSecret);

  let status: number | null = null;
  let error: string | null = null;
  try {
    const res = await fetch(row.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Nalar-Event': event,
        'X-Nalar-Signature': signPayload(secret, body),
      },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    status = res.status;
    if (!res.ok) error = `HTTP ${res.status}`;
  } catch (e) {
    error = (e as Error).message.slice(0, 200);
  }

  const ok = !error;
  const fails = ok ? 0 : row.failCount + 1;
  await withTenant(tenantId, (tx) =>
    tx.update(webhooks).set({
      lastStatus: status, lastAttemptAt: new Date(), lastError: error,
      failCount: fails,
      // Endpoint yang mati berhari-hari tak boleh terus diketuk selamanya —
      // matikan sendiri dan biarkan pemiliknya menyalakan lagi setelah benar.
      ...(fails >= MAX_FAILS ? { enabled: false } : {}),
      updatedAt: new Date(),
    }).where(eq(webhooks.id, row.id)));

  return { ok, status, error };
}

/**
 * URL tujuan wajib https dan bukan alamat internal.
 *
 * Tanpa penjagaan ini webhook jadi alat SSRF: siapa pun yang punya akun bisa
 * menyuruh server kita mengetuk 169.254.169.254 (metadata cloud) atau layanan
 * di jaringan privat, dan membaca hasilnya lewat status yang kita catat.
 * Loopback dikecualikan agar pengembangan lokal & on-prem tetap bisa menguji.
 */
export function assertDeliverableUrl(raw: string): string {
  // Aturannya tinggal di core/net karena sumber pengetahuan dari URL memakai
  // penjagaan yang sama persis — dua salinan berarti dua peluang menyimpang.
  return assertPublicHttpUrl(raw, { allowLoopback: true, label: 'URL webhook' });
}

function toRow(r: typeof webhooks.$inferSelect): WebhookRow {
  return {
    id: r.id, url: r.url, events: (r.events ?? []) as WebhookEvent[], enabled: r.enabled,
    lastStatus: r.lastStatus, lastAttemptAt: r.lastAttemptAt, lastError: r.lastError,
    failCount: r.failCount, createdAt: r.createdAt,
  };
}

/* ── langganan bus event ────────────────────────────────────────────── */
let wired = false;
/**
 * Dipasang sekali. Dipanggil dari titik masuk API (bukan saat impor) supaya
 * urutan pemuatan modul tak menentukan apakah webhook hidup — kesalahan yang
 * gampang terjadi dan sulit terlihat.
 */
export function wireWebhooks(): void {
  if (wired) return;
  wired = true;
  for (const ev of WEBHOOK_EVENTS) {
    on(ev, async (payload) => {
      const p = payload as { tenantId?: string };
      if (!p?.tenantId) return;
      try { await webhookService.fanout(p.tenantId, ev, payload); }
      catch (e) { console.error(`[webhook] fanout ${ev} gagal:`, e); }
    });
  }
}
