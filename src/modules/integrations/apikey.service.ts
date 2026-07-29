import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { apiKeys } from '@/modules/core/db';
import { client } from '@/modules/core/db';
import { withTenant } from '@/modules/core/db/tenant-context';
import { audit } from '@/modules/core/guardrails';

/**
 * API KEY per tenant — pintu masuk programatik.
 *
 * Sebelum ini satu-satunya cara memanggil Nalar dari luar adalah cookie sesi
 * browser, yang berarti sistem pelanggan tak bisa berintegrasi sama sekali.
 *
 * BENTUK KUNCI: `nk_live_<43 karakter base64url>`. Awalannya sengaja khas
 * supaya pemindai rahasia (GitHub secret scanning, gitleaks) bisa mengenalinya
 * bila tanpa sengaja ter-commit.
 *
 * YANG DISIMPAN hanya sha256-nya. Kunci mentah ditampilkan sekali saat dibuat
 * lalu tak bisa dilihat lagi — bocornya database tidak dengan sendirinya
 * menyerahkan akses API. sha256 polos (bukan scrypt) memang disengaja di sini:
 * kunci ini 256 bit acak, bukan kata sandi pilihan manusia, jadi tak ada yang
 * bisa ditebak dengan kamus — dan hashing lambat pada tiap permintaan API
 * justru akan jadi beban di jalur panas.
 */

const PREFIX = 'nk_live_';
/** Bagian awal yang ditampilkan di UI — cukup membedakan, tak cukup dipakai. */
const SHOWN = PREFIX.length + 6;

export type Scope = 'read' | 'write' | 'chat';
export const SCOPES: Scope[] = ['read', 'write', 'chat'];

export const SCOPE_LABEL: Record<Scope, string> = {
  read: 'Baca — chatbot, knowledge base, dokumen, percakapan',
  write: 'Tulis — ingest dokumen, kelola sumber',
  chat: 'Chat — ajukan pertanyaan & pencarian semantik',
};

export interface ApiKeyRow {
  id: string; name: string; prefix: string; scopes: Scope[];
  lastUsedAt: Date | null; expiresAt: Date | null; revokedAt: Date | null;
  createdAt: Date;
}

/** Identitas hasil autentikasi — cukup untuk menjalankan withTenant(). */
export interface ApiCaller { tenantId: string; keyId: string; scopes: Scope[] }

function hash(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

/** Bandingkan hash dalam waktu tetap — hindari membocorkan lewat lama proses. */
function sameHash(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'hex'), bb = Buffer.from(b, 'hex');
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export const apikeyService = {
  /**
   * Buat kunci baru. Mengembalikan kunci MENTAH — satu-satunya kesempatan
   * pemanggil melihatnya; pemanggil wajib meneruskannya ke pengguna sekali itu.
   */
  async create(
    actor: { id: string; tenantId: string },
    input: { name: string; scopes?: Scope[]; expiresAt?: Date | null },
  ): Promise<{ key: string; row: ApiKeyRow }> {
    const raw = PREFIX + randomBytes(32).toString('base64url');
    const scopes = (input.scopes?.length ? input.scopes : (['read'] as Scope[]))
      .filter((s) => SCOPES.includes(s));

    const row = await withTenant(actor.tenantId, async (tx) =>
      (await tx.insert(apiKeys).values({
        tenantId: actor.tenantId,
        name: input.name.trim() || 'Kunci tanpa nama',
        prefix: raw.slice(0, SHOWN),
        keyHash: hash(raw),
        scopes,
        createdBy: actor.id,
        expiresAt: input.expiresAt ?? null,
      }).returning())[0]);

    await audit(actor.tenantId, actor.id, 'apikey.created', row.id, { name: row.name, scopes });
    return { key: raw, row: toRow(row) };
  },

  async list(tenantId: string): Promise<ApiKeyRow[]> {
    const rows = await withTenant(tenantId, (tx) =>
      tx.select().from(apiKeys)
        .where(isNull(apiKeys.deletedAt))
        .orderBy(desc(apiKeys.createdAt)));
    return rows.map(toRow);
  },

  /** Cabut — kunci tetap tercatat (jejak audit) tapi tak bisa dipakai lagi. */
  async revoke(actor: { id: string; tenantId: string }, id: string): Promise<void> {
    await withTenant(actor.tenantId, (tx) =>
      tx.update(apiKeys)
        .set({ revokedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(apiKeys.id, id), isNull(apiKeys.deletedAt))));
    await audit(actor.tenantId, actor.id, 'apikey.revoked', id, {});
  },

  /**
   * Autentikasi kunci mentah → pemanggil.
   *
   * Berjalan DI LUAR konteks tenant: tenant-nya justru yang sedang dicari.
   * `api_keys` FORCE RLS, jadi query biasa di sini akan mengembalikan NOL
   * BARIS tanpa galat — dan setiap permintaan ber-API key dijawab 401 secara
   * diam-diam. Karena itu policy `api_keys_auth_lookup` dibuka HANYA di dalam
   * transaksi ini lewat GUC `app.api_context`, dengan pencarian sempit
   * (key_hash persis) dan hanya kolom routing yang diambil. Pola yang sama
   * dipakai widget embed (0013) dan login by-email (0002).
   *
   * Mengembalikan null untuk SEMUA sebab kegagalan — tak dikenal, dicabut,
   * kedaluwarsa — supaya pemanggil tak bisa membedakan kunci yang pernah ada
   * dari yang tak pernah ada.
   */
  async resolve(rawKey: string): Promise<ApiCaller | null> {
    const key = rawKey?.trim();
    if (!key || !key.startsWith(PREFIX)) return null;
    const h = hash(key);

    const rows = await client.begin(async (sql) => {
      await sql`select set_config('app.api_context', 'api_key', true)`;
      const found = await sql`
        select id, tenant_id, key_hash, scopes, revoked_at, expires_at
        from api_keys
        where key_hash = ${h} and deleted_at is null
        limit 1`;
      // Stempel pemakaian di transaksi yang sama — satu perjalanan ke DB,
      // dan policy UPDATE-nya sudah terbuka di sini.
      if (found.length) {
        await sql`update api_keys set last_used_at = now() where id = ${found[0].id}`;
      }
      return found;
    });

    const r = (rows as unknown as Array<{
      id: string; tenant_id: string; key_hash: string;
      scopes: Scope[]; revoked_at: Date | null; expires_at: Date | null;
    }>)[0];
    if (!r) return null;
    if (!sameHash(r.key_hash, h)) return null;
    if (r.revoked_at) return null;
    if (r.expires_at && r.expires_at.getTime() < Date.now()) return null;

    return { tenantId: r.tenant_id, keyId: r.id, scopes: r.scopes ?? ['read'] };
  },
};

function toRow(r: typeof apiKeys.$inferSelect): ApiKeyRow {
  return {
    id: r.id, name: r.name, prefix: r.prefix, scopes: (r.scopes ?? []) as Scope[],
    lastUsedAt: r.lastUsedAt, expiresAt: r.expiresAt, revokedAt: r.revokedAt,
    createdAt: r.createdAt,
  };
}
