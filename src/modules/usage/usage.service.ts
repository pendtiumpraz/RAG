import { sql, and, eq, isNull } from 'drizzle-orm';
import { db, tenants, usageCounters } from '@/modules/core/db';
import { withTenant } from '@/modules/core/db/tenant-context';
import { limitsForPlan, type PlanLimits } from '@/modules/core/limits';

export class QuotaExceededError extends Error {
  constructor(public limit: number) {
    super(`Kuota pesan bulan ini habis (${limit.toLocaleString('id-ID')} pesan). Upgrade plan untuk lanjut.`);
  }
}

function currentPeriod(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export const usageService = {
  /** Plan + limit + pemakaian periode berjalan (untuk dashboard & guard). */
  async snapshot(tenantId: string): Promise<{
    plan: string; limits: PlanLimits; period: string;
    messages: number; tokensIn: number; tokensOut: number;
  }> {
    const period = currentPeriod();
    // plan dibaca dari tabel root `tenants` (tanpa RLS)
    const t = await db.select({ plan: tenants.plan }).from(tenants)
      .where(and(eq(tenants.id, tenantId), isNull(tenants.deletedAt))).limit(1);
    const plan = t[0]?.plan ?? 'free';

    const row = await withTenant(tenantId, async (tx) =>
      (await tx.select().from(usageCounters).where(and(
        eq(usageCounters.tenantId, tenantId),
        eq(usageCounters.period, period),
        isNull(usageCounters.deletedAt),
      )).limit(1))[0] ?? null,
    );

    return {
      plan, limits: limitsForPlan(plan), period,
      messages: row?.messages ?? 0,
      tokensIn: row?.tokensIn ?? 0,
      tokensOut: row?.tokensOut ?? 0,
    };
  },

  /** Guard kuota — panggil SEBELUM giliran chat dimulai. */
  async assertQuota(tenantId: string): Promise<void> {
    const s = await this.snapshot(tenantId);
    if (s.messages >= s.limits.messagesPerMonth) {
      throw new QuotaExceededError(s.limits.messagesPerMonth);
    }
  },

  /** Increment atomik setelah giliran selesai (upsert per tenant+periode). */
  async recordTurn(tenantId: string, tokensIn: number, tokensOut: number): Promise<void> {
    const period = currentPeriod();
    await withTenant(tenantId, async (tx) => {
      await tx.execute(sql`
        insert into usage_counters (tenant_id, period, messages, tokens_in, tokens_out)
        values (${tenantId}, ${period}, 1, ${tokensIn}, ${tokensOut})
        on conflict (tenant_id, period) where deleted_at is null
        do update set
          messages   = usage_counters.messages + 1,
          tokens_in  = usage_counters.tokens_in + ${tokensIn},
          tokens_out = usage_counters.tokens_out + ${tokensOut},
          updated_at = now()
      `);
    });
  },
};
