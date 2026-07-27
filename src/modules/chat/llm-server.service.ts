import { eq, and, isNull, isNotNull, desc } from 'drizzle-orm';
import { db, llmServers } from '@/modules/core/db';
import { encryptSecret, decryptSecret } from '@/modules/core/crypto';
import { ValidationError } from '@/modules/chatbot/chatbot.service';
import { assertSecureEndpoint } from '@/modules/knowledge/embeddings/selfhosted';

/**
 * SERVER LLM SENDIRI (on-prem / VPS).
 *
 * Semua runtime populer — Ollama, vLLM, LM Studio, LocalAI, llama.cpp server —
 * berbicara protokol OpenAI, jadi satu jalur `/v1/chat/completions` cukup untuk
 * semuanya. Tak ada adaptor khusus per-runtime.
 *
 * Semua rutenya WAJIB `requireRole('superadmin')`: tabelnya tak dilindungi RLS,
 * dan menerima URL sembarang dari pihak tak tepercaya akan membuka SSRF.
 */

export interface PublicLlmServer {
  id: string; name: string; baseUrl: string; enabled: boolean; hasToken: boolean;
  models: Array<{ id: string }>;
  lastCheckedAt: Date | null; lastError: string | null;
}

type Row = typeof llmServers.$inferSelect;

function toPublic(r: Row): PublicLlmServer {
  return {
    id: r.id, name: r.name, baseUrl: r.baseUrl, enabled: r.enabled,
    hasToken: !!r.encryptedToken, models: r.models ?? [],
    lastCheckedAt: r.lastCheckedAt, lastError: r.lastError,
  };
}

/**
 * Berbeda dari server embedding: token BOLEH kosong. Ollama atau LM Studio di
 * jaringan tertutup lazim berjalan tanpa auth, dan memaksakan token di sana
 * hanya akan membuat orang mengarang nilai.
 *
 * Pengaman `https` tetap berlaku lewat assertSecureEndpoint — HTTP polos hanya
 * diizinkan ke loopback.
 */
function normalizeUrl(raw: string): string {
  const url = raw.trim().replace(/\/+$/, '');
  if (!url) throw new ValidationError('Alamat server wajib diisi');
  assertSecureEndpoint(url);
  return url;
}

export const llmServerService = {
  async list(): Promise<PublicLlmServer[]> {
    const rows = await db.select().from(llmServers)
      .where(isNull(llmServers.deletedAt)).orderBy(desc(llmServers.createdAt));
    return rows.map(toPublic);
  },

  async listTrashed(): Promise<PublicLlmServer[]> {
    const rows = await db.select().from(llmServers)
      .where(isNotNull(llmServers.deletedAt)).orderBy(desc(llmServers.deletedAt));
    return rows.map(toPublic);
  },

  async create(input: { name: string; baseUrl: string; token?: string }): Promise<PublicLlmServer> {
    const baseUrl = normalizeUrl(input.baseUrl);
    if (!input.name?.trim()) throw new ValidationError('Nama server wajib diisi');
    const dup = await db.select({ id: llmServers.id }).from(llmServers)
      .where(and(eq(llmServers.baseUrl, baseUrl), isNull(llmServers.deletedAt))).limit(1);
    if (dup[0]) throw new ValidationError(`Server dengan alamat ${baseUrl} sudah terdaftar`);

    const rows = await db.insert(llmServers).values({
      name: input.name.trim(), baseUrl,
      encryptedToken: input.token?.trim() ? encryptSecret(input.token.trim()) : null,
      models: [],
    }).returning();
    return toPublic(rows[0]);
  },

  async update(id: string, input: Partial<{ name: string; baseUrl: string; token: string; enabled: boolean }>) {
    const values: Record<string, unknown> = {};
    if (input.name !== undefined) {
      if (!input.name.trim()) throw new ValidationError('Nama server wajib diisi');
      values.name = input.name.trim();
    }
    if (input.baseUrl !== undefined) {
      const baseUrl = normalizeUrl(input.baseUrl);
      const clash = await db.select({ id: llmServers.id }).from(llmServers)
        .where(and(eq(llmServers.baseUrl, baseUrl), isNull(llmServers.deletedAt))).limit(1);
      if (clash[0] && clash[0].id !== id) throw new ValidationError(`Alamat ${baseUrl} dipakai server lain`);
      values.baseUrl = baseUrl;
      // Alamat berubah ⇒ daftar model lama belum tentu berlaku.
      values.models = []; values.lastCheckedAt = null;
    }
    if (input.token !== undefined) {
      values.encryptedToken = input.token.trim() ? encryptSecret(input.token.trim()) : null;
    }
    if (input.enabled !== undefined) values.enabled = input.enabled;

    const rows = await db.update(llmServers).set({ ...values, updatedAt: new Date() })
      .where(and(eq(llmServers.id, id), isNull(llmServers.deletedAt))).returning();
    if (!rows[0]) throw new ValidationError('Server tidak ditemukan');
    return toPublic(rows[0]);
  },

  async softDelete(id: string) {
    const rows = await db.update(llmServers)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(llmServers.id, id), isNull(llmServers.deletedAt))).returning();
    if (!rows[0]) throw new ValidationError('Server tidak ditemukan');
    return toPublic(rows[0]);
  },

  async restore(id: string) {
    const rows = await db.update(llmServers)
      .set({ deletedAt: null, updatedAt: new Date() })
      .where(and(eq(llmServers.id, id), isNotNull(llmServers.deletedAt))).returning();
    if (!rows[0]) throw new ValidationError('Server tidak ada di Sampah');
    return toPublic(rows[0]);
  },

  /** Uji koneksi + baca daftar model dari `/v1/models` (standar OpenAI). */
  async testAndDiscover(id: string): Promise<PublicLlmServer> {
    const server = (await db.select().from(llmServers)
      .where(and(eq(llmServers.id, id), isNull(llmServers.deletedAt))).limit(1))[0];
    if (!server) throw new ValidationError('Server tidak ditemukan');

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 15_000);
    try {
      const res = await fetch(`${server.baseUrl}/models`, {
        signal: ac.signal,
        headers: server.encryptedToken
          ? { Authorization: `Bearer ${decryptSecret(server.encryptedToken)}` }
          : {},
      });
      if (!res.ok) throw new Error(res.status === 401 ? 'token ditolak server' : `HTTP ${res.status}`);

      const json = await res.json() as { data?: Array<{ id?: string }>; models?: Array<{ name?: string }> };
      // OpenAI/vLLM: {data:[{id}]} · Ollama versi lama: {models:[{name}]}
      const ids = (json.data?.map((m) => m.id) ?? json.models?.map((m) => m.name) ?? [])
        .filter((x): x is string => typeof x === 'string' && x.length > 0);
      if (ids.length === 0) throw new Error('server tak melaporkan satu model pun');

      const rows = await db.update(llmServers)
        .set({ models: ids.map((i) => ({ id: i })), lastCheckedAt: new Date(), lastError: null, updatedAt: new Date() })
        .where(eq(llmServers.id, id)).returning();
      return toPublic(rows[0]);
    } catch (err) {
      const e = err as Error;
      const message = e.name === 'AbortError' ? 'server tak menjawab dalam 15 detik' : e.message;
      await db.update(llmServers)
        .set({ lastCheckedAt: new Date(), lastError: message, models: [], updatedAt: new Date() })
        .where(eq(llmServers.id, id));
      throw new ValidationError(`Uji koneksi gagal: ${message}`);
    } finally {
      clearTimeout(timer);
    }
  },

  /**
   * Cari server aktif yang melayani `modelId`. Mengembalikan kredensial
   * terdekripsi — HANYA untuk pemakaian server-side.
   */
  async resolveForModel(modelId: string): Promise<{ baseUrl: string; token: string | null } | null> {
    const rows = await db.select().from(llmServers)
      .where(and(isNull(llmServers.deletedAt), eq(llmServers.enabled, true)));
    for (const s of rows) {
      if ((s.models ?? []).some((m) => m.id === modelId)) {
        return {
          baseUrl: s.baseUrl,
          token: s.encryptedToken ? decryptSecret(s.encryptedToken) : null,
        };
      }
    }
    return null;
  },
};
