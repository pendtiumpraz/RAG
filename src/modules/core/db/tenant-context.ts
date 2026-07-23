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

/**
 * Resolves tenant + chatbot for a public embed `publicKey`. Runs OUTSIDE
 * tenant scope (tenant is unknown yet); exposes routing fields only and
 * ignores soft-deleted chatbots.
 */
export async function resolveChatbotByPublicKey(publicKey: string) {
  const rows = await client<
    Array<{ id: string; tenant_id: string; enabled: boolean; allowed_origins: string[]; theme_config: unknown }>
  >`
    select id, tenant_id, enabled, allowed_origins, theme_config
    from chatbots
    where public_key = ${publicKey} and deleted_at is null
    limit 1
  `;
  return rows[0] ?? null;
}
