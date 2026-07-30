import { sql, and, eq, isNull } from 'drizzle-orm';
import { db, tenants, usageCounters } from '@/modules/core/db';
import { withTenant } from '@/modules/core/db/tenant-context';
import { type PlanLimits } from '@/modules/core/limits';
import { limitsFor } from '@/modules/core/limits-server';

export class QuotaExceededError extends Error {
  constructor(public limit: number) {
    super(`Kuota pesan bulan ini habis (${limit.toLocaleString('id-ID')} pesan). Upgrade plan untuk lanjut.`);
  }
}

function currentPeriod(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Plan yang BENAR-BENAR berlaku sekarang.
 *
 * Plan berbayar yang sudah lewat masa berlakunya turun ke `free`. Ini dihitung
 * di sini — bukan di UI — supaya masa berlaku benar-benar menegakkan kuota,
 * bukan sekadar tampilan.
 */
export function effectivePlan(plan: string | null | undefined, expiresAt: Date | null | undefined): string {
  if (!plan || plan === 'free') return 'free';
  if (expiresAt && expiresAt.getTime() < Date.now()) return 'free';
  return plan;
}

export const usageService = {
  /** Plan + limit + pemakaian periode berjalan (untuk dashboard & guard). */
  async snapshot(tenantId: string): Promise<{
    plan: string; planOnPaper: string; planExpiresAt: Date | null; expired: boolean;
    /** workspace operator platform — tanpa batas & tak pernah ditagih */
    isPlatform: boolean;
    limits: PlanLimits; period: string;
    messages: number; tokensIn: number; tokensOut: number;
  }> {
    const period = currentPeriod();
    // plan dibaca dari tabel root `tenants` (tanpa RLS)
    const t = await db.select({
      plan: tenants.plan, planExpiresAt: tenants.planExpiresAt, isPlatform: tenants.isPlatform,
    }).from(tenants)
      .where(and(eq(tenants.id, tenantId), isNull(tenants.deletedAt))).limit(1);
    const planOnPaper = t[0]?.plan ?? 'free';
    const planExpiresAt = t[0]?.planExpiresAt ?? null;
    const isPlatform = t[0]?.isPlatform ?? false;
    const plan = effectivePlan(planOnPaper, planExpiresAt);

    const row = await withTenant(tenantId, async (tx) =>
      (await tx.select().from(usageCounters).where(and(
        eq(usageCounters.tenantId, tenantId),
        eq(usageCounters.period, period),
        isNull(usageCounters.deletedAt),
      )).limit(1))[0] ?? null,
    );

    // D12: mode on-premise = SEMUA kuota unlimited, plan apa pun. Ini gerbang
    // kuota utama (assertQuota, batas chatbot & anggota membaca snapshot ini).
    const { platformSettingsService } = await import('@/modules/payments/platform-settings.service');
    const onprem = (await platformSettingsService.mode()) === 'onprem';

    return {
      plan, planOnPaper, planExpiresAt, isPlatform,
      expired: plan !== planOnPaper,
      // Tiga jalan menuju tanpa batas, dan semuanya bertemu di sini karena
      // inilah satu-satunya sumber batas: mode on-premise, workspace operator
      // platform, atau plan berbayar yang memang tanpa batas. Sebelumnya
      // operator hanya dibuka FITURnya di /api/entitlements sementara kuotanya
      // tetap `free` — terbuka pintunya, terkunci jatahnya.
      limits: await limitsFor(onprem || isPlatform ? 'onprem' : plan), period,
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

  /**
   * Rincian pemakaian utk dashboard monitoring: PER CHATBOT + tren harian.
   * Sumber: audit_logs `chat.turn` (tiap giliran mencatat tokensIn/Out dan
   * subject = chatbotId) — tanpa tabel/pelacakan baru, dan tetap di bawah
   * RLS tenant (withTenant). Chatbot terhapus tetap tampil (label khusus)
   * supaya angka periode tak diam-diam menyusut.
   */
  async breakdown(tenantId: string, days = 30): Promise<{
    perChatbot: Array<{ chatbotId: string; name: string; messages: number; tokensIn: number; tokensOut: number }>;
    daily: Array<{ day: string; messages: number }>;
  }> {
    // ISO string, bukan objek Date — driver menolak Date pada query mentah
    // (jebakan yang sama pernah tercatat di ops.service).
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    return withTenant(tenantId, async (tx) => {
      const per = await tx.execute(sql`
        select a.subject as chatbot_id,
               coalesce(c.name, '(chatbot terhapus)') as name,
               count(*)::int as messages,
               coalesce(sum((a.meta->>'tokensIn')::int), 0)::int as tin,
               coalesce(sum((a.meta->>'tokensOut')::int), 0)::int as tout
        from audit_logs a
        left join chatbots c on c.id::text = a.subject
        where a.action = 'chat.turn' and a.deleted_at is null
          and a.created_at >= ${since}
        group by 1, 2
        order by messages desc
      `);
      const daily = await tx.execute(sql`
        select to_char(date_trunc('day', a.created_at), 'YYYY-MM-DD') as day,
               count(*)::int as messages
        from audit_logs a
        where a.action = 'chat.turn' and a.deleted_at is null
          and a.created_at >= ${since}
        group by 1 order by 1
      `);
      return {
        perChatbot: (per as unknown as Array<{ chatbot_id: string; name: string; messages: number; tin: number; tout: number }>)
          .map((r) => ({ chatbotId: r.chatbot_id, name: r.name, messages: Number(r.messages), tokensIn: Number(r.tin), tokensOut: Number(r.tout) })),
        daily: (daily as unknown as Array<{ day: string; messages: number }>)
          .map((r) => ({ day: r.day, messages: Number(r.messages) })),
      };
    });
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
