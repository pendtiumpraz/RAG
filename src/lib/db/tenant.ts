import { sql } from 'drizzle-orm';
import { db, client } from './index';

/**
 * Runs `fn` inside a transaction where Postgres' `app.current_tenant`
 * setting is pinned to `tenantId`. Combined with the RLS policies in
 * migrations/0001_rls.sql, every SELECT/INSERT/UPDATE/DELETE on a
 * tenant-scoped table is transparently constrained to that tenant.
 *
 * This is THE isolation boundary: even a query with no explicit
 * tenant filter cannot touch another tenant's rows. Cross-tenant
 * knowledge-base access is therefore impossible by construction.
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
 * Resolves the tenant + chatbot for a public embed `publicKey`.
 * Runs OUTSIDE tenant scope (we don't know the tenant yet) using a
 * narrow, security-definer lookup that only exposes routing fields.
 */
export async function resolveChatbotByPublicKey(publicKey: string) {
  const rows = await client<
    Array<{ id: string; tenant_id: string; enabled: boolean; allowed_origins: string[] }>
  >`
    select id, tenant_id, enabled, allowed_origins
    from chatbots
    where public_key = ${publicKey}
    limit 1
  `;
  return rows[0] ?? null;
}
