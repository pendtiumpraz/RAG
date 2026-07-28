import { sql, eq, and, isNull, desc, count } from 'drizzle-orm';
import { db, tenants, users, chatbots, usageCounters } from '@/modules/core/db';
import { withTenant } from '@/modules/core/db/tenant-context';
import { limitsForPlan, PLAN_LIMITS } from '@/modules/core/limits';
import { effectivePlan } from './usage.service';
import { ValidationError } from '@/modules/chatbot/chatbot.service';
import { audit } from '@/modules/core/guardrails';

/**
 * BILLING — pengelolaan plan per tenant.
 *
 * Sengaja NETRAL terhadap penyedia pembayaran. Yang dibangun di sini adalah
 * fondasinya: plan, masa berlaku, dan pemakaian nyata dibanding kuota. Dengan
 * itu penagihan manual (transfer → superadmin mengaktifkan sampai tanggal
 * tertentu) sudah bisa berjalan penuh. Integrasi gateway kelak cukup memanggil
 * `setPlan()` yang sama — tak ada penegakan kuota yang perlu diubah.
 *
 * Tabel invoice/langganan SENGAJA belum dibuat: bentuknya ditentukan penyedia
 * yang dipilih, dan menebaknya sekarang hanya melahirkan skema yang salah.
 */

export const PLAN_IDS = Object.keys(PLAN_LIMITS);

export interface TenantBilling {
  tenantId: string;
  tenantName: string;
  planOnPaper: string;
  plan: string;             // yang benar-benar berlaku
  planExpiresAt: Date | null;
  expired: boolean;
  members: number;
  chatbots: number;
  messages: number;
  tokensIn: number;
  tokensOut: number;
}

function currentPeriod(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export const billingService = {
  /** Ringkasan plan + pemakaian satu tenant (untuk halaman Billing tenant). */
  async forTenant(tenantId: string): Promise<TenantBilling & { limits: ReturnType<typeof limitsForPlan> }> {
    const t = (await db.select().from(tenants)
      .where(and(eq(tenants.id, tenantId), isNull(tenants.deletedAt))).limit(1))[0];
    if (!t) throw new ValidationError('Tenant tidak ditemukan');

    const period = currentPeriod();
    const { memberCount, botCount, usage } = await withTenant(tenantId, async (tx) => {
      const m = await tx.select({ n: count() }).from(users).where(isNull(users.deletedAt));
      const b = await tx.select({ n: count() }).from(chatbots).where(isNull(chatbots.deletedAt));
      const u = await tx.select().from(usageCounters).where(and(
        eq(usageCounters.tenantId, tenantId), eq(usageCounters.period, period),
        isNull(usageCounters.deletedAt),
      )).limit(1);
      return { memberCount: m[0]?.n ?? 0, botCount: b[0]?.n ?? 0, usage: u[0] ?? null };
    });

    const plan = effectivePlan(t.plan, t.planExpiresAt);
    return {
      tenantId: t.id, tenantName: t.name,
      planOnPaper: t.plan, plan, planExpiresAt: t.planExpiresAt,
      expired: plan !== t.plan,
      members: Number(memberCount), chatbots: Number(botCount),
      messages: usage?.messages ?? 0,
      tokensIn: usage?.tokensIn ?? 0,
      tokensOut: usage?.tokensOut ?? 0,
      limits: limitsForPlan(plan),
    };
  },

  /**
   * Semua tenant + pemakaiannya (untuk superadmin menjalankan bisnisnya).
   *
   * Satu query agregat, BUKAN N+1 per tenant: daftar ini tumbuh seiring jumlah
   * pelanggan, dan memanggil forTenant() dalam loop akan menyiksa DB.
   * `usage_counters` di-join langsung dan RLS-nya dilewati secara sadar karena
   * ini pandangan platform — pemanggilnya wajib superadmin.
   */
  async listAllTenants(): Promise<TenantBilling[]> {
    const period = currentPeriod();
    // GUC platform_admin WAJIB: tanpa ini join usage_counters/users/chatbots
    // tersaring RLS jadi NOL SEMUA secara diam-diam (bug nyata sebelum 0017 —
    // komentar lama mengklaim "dilewati secara sadar" tanpa mekanisme apa pun).
    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.admin_context', 'platform_admin', true)`);
      return tx.execute<{
      id: string; name: string; plan: string; plan_expires_at: Date | null;
      members: string; chatbots: string; messages: string; tokens_in: string; tokens_out: string;
    }>(sql`
      select t.id, t.name, t.plan, t.plan_expires_at,
             (select count(*) from users u    where u.tenant_id = t.id and u.deleted_at is null)    as members,
             (select count(*) from chatbots c where c.tenant_id = t.id and c.deleted_at is null)    as chatbots,
             coalesce(uc.messages, 0)   as messages,
             coalesce(uc.tokens_in, 0)  as tokens_in,
             coalesce(uc.tokens_out, 0) as tokens_out
      from tenants t
      left join usage_counters uc
        on uc.tenant_id = t.id and uc.period = ${period} and uc.deleted_at is null
      where t.deleted_at is null
      order by t.created_at desc
    `);
    });

    return (rows as unknown as Array<Record<string, unknown>>).map((r) => {
      const planOnPaper = String(r.plan);
      const planExpiresAt = r.plan_expires_at ? new Date(r.plan_expires_at as string) : null;
      const plan = effectivePlan(planOnPaper, planExpiresAt);
      return {
        tenantId: String(r.id), tenantName: String(r.name),
        planOnPaper, plan, planExpiresAt, expired: plan !== planOnPaper,
        members: Number(r.members), chatbots: Number(r.chatbots),
        messages: Number(r.messages), tokensIn: Number(r.tokens_in), tokensOut: Number(r.tokens_out),
      };
    });
  },

  /** Ubah plan sebuah tenant. `expiresAt` null = tanpa batas waktu. */
  async setPlan(
    actor: { id: string; tenantId: string },
    tenantId: string,
    plan: string,
    expiresAt: Date | null,
  ): Promise<TenantBilling> {
    if (!PLAN_IDS.includes(plan)) {
      throw new ValidationError(`Plan tak dikenal: ${plan}. Pilihan: ${PLAN_IDS.join(', ')}`);
    }
    // Plan berbayar tanpa masa berlaku itu sah (mis. kontrak enterprise), tapi
    // masa berlaku yang sudah lewat hampir pasti salah ketik.
    if (expiresAt && expiresAt.getTime() < Date.now()) {
      throw new ValidationError('Masa berlaku sudah lewat — plan akan langsung turun ke free');
    }

    const rows = await db.update(tenants)
      .set({ plan, planExpiresAt: expiresAt, updatedAt: new Date() })
      .where(and(eq(tenants.id, tenantId), isNull(tenants.deletedAt)))
      .returning({ id: tenants.id });
    if (!rows[0]) throw new ValidationError('Tenant tidak ditemukan');

    await audit(actor.tenantId, actor.id, 'billing.plan.set', tenantId, {
      plan, expiresAt: expiresAt?.toISOString() ?? null,
    });
    return this.forTenant(tenantId);
  },
};

/** Daftar plan + kuotanya, untuk ditampilkan di halaman Billing. */
export function planCatalog() {
  return PLAN_IDS.map((id) => {
    const l = PLAN_LIMITS[id];
    const num = (n: number) => (n === Infinity ? null : n);
    return {
      id,
      messagesPerMonth: num(l.messagesPerMonth),
      maxChatbots: num(l.maxChatbots),
      maxMembers: num(l.maxMembers),
    };
  });
}

export { desc };
