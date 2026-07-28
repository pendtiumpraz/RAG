import { sql } from 'drizzle-orm';
import { db, client } from './index';

/**
 * THE tenant-isolation boundary.
 *
 * Runs `fn` inside a transaction with Postgres' `app.current_tenant` pinned
 * to `tenantId`. Combined with the RLS policies (migrations/0001_rls.sql),
 * every statement on a tenant-scoped table is constrained to that tenant —
 * cross-tenant access is impossible by construction, even on buggy queries.
 */
export async function withTenant<T>(
  tenantId: string,
  fn: (tx: typeof db) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    // set_config(..., true) => scoped to this transaction only.
    await tx.execute(sql`select set_config('app.current_tenant', ${tenantId}, true)`);
    return fn(tx as unknown as typeof db);
  });
}

export interface EmbedChatbot {
  id: string; tenant_id: string; enabled: boolean;
  allowed_origins: string[]; theme_config: unknown; greeting: string | null;
  has_logo: boolean;
}

/**
 * Resolusi tenant + chatbot dari `publicKey` widget embed.
 *
 * Berjalan DI LUAR konteks tenant — pengunjung situs pelanggan tak punya sesi
 * dan tenantnya memang belum diketahui. Karena `chatbots` FORCE RLS, query
 * biasa di sini mengembalikan NOL BARIS tanpa galat apa pun; itulah yang
 * membuat setiap widget membalas 404 secara diam-diam.
 *
 * Jalan keluarnya sama dengan login by-email (0002) dan penerimaan undangan
 * (0010): buka policy `chatbots_public_lookup` (migrasi 0013) HANYA di dalam
 * transaksi ini lewat GUC `app.embed_context`. Pencariannya tetap sempit —
 * public_key persis — dan hanya kolom routing yang dikembalikan.
 */
export async function resolveChatbotByPublicKey(publicKey: string): Promise<EmbedChatbot | null> {
  const rows = await client.begin(async (sql) => {
    await sql`select set_config('app.embed_context', 'public_key', true)`;
    return sql`
      select id, tenant_id, enabled, allowed_origins, theme_config, greeting,
             (logo is not null) as has_logo
      from chatbots
      where public_key = ${publicKey} and deleted_at is null
      limit 1
    `;
  });
  return (rows as unknown as EmbedChatbot[])[0] ?? null;
}

/**
 * Byte logo unggahan utk widget (data URL) — query TERPISAH dari resolve:
 * logo bisa ratusan KB dan tak boleh menumpang di setiap resolve config/chat.
 */
export async function resolveChatbotLogoByPublicKey(publicKey: string): Promise<string | null> {
  const rows = await client.begin(async (sql) => {
    await sql`select set_config('app.embed_context', 'public_key', true)`;
    return sql`
      select logo from chatbots
      where public_key = ${publicKey} and deleted_at is null and logo is not null
      limit 1
    `;
  });
  return (rows as unknown as Array<{ logo: string }>)[0]?.logo ?? null;
}
