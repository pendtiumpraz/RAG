import { sql } from 'drizzle-orm';
import { db } from '@/modules/core/db';

/**
 * OPS — ringkasan operasional lintas tenant untuk superadmin.
 *
 * Datanya NYATA, dari `audit_logs` dan `usage_counters` yang memang sudah
 * ditulis pipeline (guardrail L5, metering chat, aksi admin). Tidak ada angka
 * karangan di sini.
 *
 * `audit_logs` FORCE RLS per tenant, sementara pandangan ini justru harus
 * menembusnya — dibuka lewat GUC `app.admin_context` (policy
 * `audit_logs_platform_admin_read`, migrasi 0012), diset HANYA di berkas ini
 * dan hanya dipanggil rute yang sudah lolos requireRole('superadmin').
 */

export interface OpsSummary {
  window: string;
  actions: Array<{ action: string; count: number }>;
  errors: Array<{ at: string; tenantId: string; message: string }>;
  guardrail: { flagged: number };
  usage: { tenants: number; messages: number; tokensIn: number; tokensOut: number; period: string };
  topTenants: Array<{ tenantId: string; name: string; messages: number }>;
}

function withPlatformAdmin<T>(fn: (tx: typeof db) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.admin_context', 'platform_admin', true)`);
    return fn(tx as unknown as typeof db);
  });
}

function currentPeriod(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

const rows = <T>(r: unknown): T[] => (r as unknown as T[]) ?? [];

export const opsService = {
  /** @param hours jendela waktu untuk aksi & galat (default 24 jam). */
  async summary(hours = 24): Promise<OpsSummary> {
    const period = currentPeriod();
    // ISO string, bukan objek Date: driver menolak Date pada query mentah.
    const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();

    return withPlatformAdmin(async (tx) => {
      const actions = rows<{ action: string; n: string }>(await tx.execute(sql`
        select action, count(*)::int as n
        from audit_logs
        where created_at >= ${since} and deleted_at is null
        group by action order by n desc limit 20
      `));

      const errs = rows<{ created_at: string; tenant_id: string; meta: Record<string, unknown> }>(
        await tx.execute(sql`
          select created_at, tenant_id, meta
          from audit_logs
          where action = 'error' and created_at >= ${since} and deleted_at is null
          order by created_at desc limit 25
        `));

      // Guardrail L5 menandai pelanggaran lewat meta.flagged pada giliran chat.
      const flagged = rows<{ n: string }>(await tx.execute(sql`
        select count(*)::int as n from audit_logs
        where created_at >= ${since} and deleted_at is null
          and (meta->>'flagged') = 'true'
      `));

      const usage = rows<{ tenants: string; messages: string; tin: string; tout: string }>(
        await tx.execute(sql`
          select count(*)::int as tenants,
                 coalesce(sum(messages),0)::int as messages,
                 coalesce(sum(tokens_in),0)::int as tin,
                 coalesce(sum(tokens_out),0)::int as tout
          from usage_counters
          where period = ${period} and deleted_at is null
        `));

      const top = rows<{ tenant_id: string; name: string; messages: string }>(
        await tx.execute(sql`
          select uc.tenant_id, t.name, uc.messages
          from usage_counters uc
          join tenants t on t.id = uc.tenant_id
          where uc.period = ${period} and uc.deleted_at is null and t.deleted_at is null
          order by uc.messages desc limit 10
        `));

      return {
        window: `${hours}h`,
        actions: actions.map((a) => ({ action: a.action, count: Number(a.n) })),
        errors: errs.map((e) => ({
          at: new Date(e.created_at).toISOString(),
          tenantId: String(e.tenant_id),
          message: String(e.meta?.message ?? 'tanpa pesan'),
        })),
        guardrail: { flagged: Number(flagged[0]?.n ?? 0) },
        usage: {
          tenants: Number(usage[0]?.tenants ?? 0),
          messages: Number(usage[0]?.messages ?? 0),
          tokensIn: Number(usage[0]?.tin ?? 0),
          tokensOut: Number(usage[0]?.tout ?? 0),
          period,
        },
        topTenants: top.map((t) => ({
          tenantId: String(t.tenant_id), name: String(t.name), messages: Number(t.messages),
        })),
      };
    });
  },
};
