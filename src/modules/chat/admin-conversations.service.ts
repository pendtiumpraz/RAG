import { sql } from 'drizzle-orm';
import { db } from '@/modules/core/db';
import { csvCell } from './conversation.service';
/**
 * Fragmen filter untuk pandangan lintas-tenant.
 *
 * Aturannya HARUS sama dengan `filterConds()` di conversation.repository —
 * kalau menyimpang, superadmin dan tenant akan melihat hasil berbeda untuk
 * pencarian yang sama, dan yang salah tak akan pernah ketahuan sampai ada
 * yang membandingkan keduanya. Ditulis terpisah karena pandangan ini memakai
 * SQL mentah dengan alias `c`, bukan query builder.
 *
 * Tanggal dikirim sebagai string ISO: driver menolak objek Date pada query
 * mentah — jebakan yang sudah tercatat di ops.service dan usage.breakdown.
 */
function adminFilter(f: { q?: string; from?: Date; to?: Date }) {
  const parts: ReturnType<typeof sql>[] = [];
  if (f.from) parts.push(sql`and c.started_at >= ${f.from.toISOString()}`);
  if (f.to) parts.push(sql`and c.started_at <= ${f.to.toISOString()}`);
  if (f.q?.trim()) {
    const like = `%${f.q.trim().replace(/[%_]/g, (m) => `\\${m}`)}%`;
    parts.push(sql`and exists (select 1 from messages m
      where m.conversation_id = c.id and m.deleted_at is null and m.content ilike ${like})`);
  }
  return parts.length ? sql.join(parts, sql` `) : sql``;
}


/**
 * CONVERSATIONS LINTAS-TENANT — pandangan platform utk SUPERADMIN:
 * pilih tenant → chatbot divisinya → seluruh sesi → transkrip.
 *
 * conversations/messages/chatbots FORCE RLS per tenant; pandangan ini
 * menembusnya lewat GUC `app.admin_context` (policy *_platform_admin_read,
 * migrasi 0017) — GUC diset HANYA di berkas ini, dan semua rutenya ber-guard
 * superadminRoute. Tenant biasa tak pernah menyentuh jalur ini: halaman
 * Conversations mereka memakai endpoint ber-RLS seperti sedia kala.
 */

function withPlatformAdmin<T>(fn: (tx: typeof db) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.admin_context', 'platform_admin', true)`);
    return fn(tx as unknown as typeof db);
  });
}

const rows = <T>(r: unknown): T[] => (r as unknown as T[]) ?? [];

export const adminConversationsService = {
  /** Chatbot milik satu tenant (utk selector setelah tenant dipilih). */
  chatbots(tenantId: string) {
    return withPlatformAdmin(async (tx) =>
      rows<{ id: string; name: string; context: string | null }>(await tx.execute(sql`
        select id, name, context from chatbots
        where tenant_id = ${tenantId} and deleted_at is null
        order by name
      `)));
  },

  /** Daftar sesi tenant itu (opsional per chatbot), berhalaman. */
  async conversations(tenantId: string, chatbotId: string | null, page = 1, pageSize = 25, f: { q?: string; from?: Date; to?: Date } = {}) {
    const limit = Math.min(Math.max(pageSize, 1), 100);
    const offset = (Math.max(page, 1) - 1) * limit;
    return withPlatformAdmin(async (tx) => {
      const list = rows<{
        id: string; chatbot_id: string; chatbot_name: string; visitor_id: string | null;
        started_at: string; preview: string | null; count: number;
      }>(await tx.execute(sql`
        select c.id, c.chatbot_id, coalesce(b.name, '(chatbot terhapus)') as chatbot_name,
               c.visitor_id, c.started_at,
               (select m.content from messages m where m.conversation_id = c.id
                  and m.role = 'user' and m.deleted_at is null
                  order by m.created_at asc limit 1) as preview,
               (select count(*)::int from messages m where m.conversation_id = c.id
                  and m.deleted_at is null) as count
        from conversations c
        left join chatbots b on b.id = c.chatbot_id
        where c.tenant_id = ${tenantId} and c.deleted_at is null
          ${chatbotId ? sql`and c.chatbot_id = ${chatbotId}` : sql``}
          ${adminFilter(f)}
        order by c.started_at desc
        limit ${limit} offset ${offset}
      `));
      const totalRow = rows<{ n: number }>(await tx.execute(sql`
        select count(*)::int as n from conversations c
        where c.tenant_id = ${tenantId} and c.deleted_at is null
          ${chatbotId ? sql`and c.chatbot_id = ${chatbotId}` : sql``}
          ${adminFilter(f)}
      `));
      const total = Number(totalRow[0]?.n ?? 0);
      return {
        rows: list.map((r) => ({
          id: r.id, chatbotId: r.chatbot_id, chatbotName: r.chatbot_name,
          visitorId: r.visitor_id, startedAt: r.started_at,
          preview: r.preview, count: Number(r.count),
        })),
        total, page: Math.max(page, 1), pageSize: limit,
        pages: Math.max(1, Math.ceil(total / limit)),
      };
    });
  },

  /**
   * Ekspor CSV lintas-tenant — satu baris per pesan, memakai csvCell() yang
   * SAMA dengan jalur tenant supaya penjagaan CSV injection-nya tak menyimpang.
   */
  async exportCsv(tenantId: string, chatbotId: string | null, f: { q?: string; from?: Date; to?: Date }) {
    const MAX = 1000;
    return withPlatformAdmin(async (tx) => {
      const list = rows<{
        id: string; chatbot_name: string; visitor_id: string | null; started_at: string;
        role: string; content: string; created_at: string; seq: number;
      }>(await tx.execute(sql`
        with pilih as (
          select c.id, coalesce(b.name, '(chatbot terhapus)') as chatbot_name,
                 c.visitor_id, c.started_at
          from conversations c
          left join chatbots b on b.id = c.chatbot_id
          where c.tenant_id = ${tenantId} and c.deleted_at is null
            ${chatbotId ? sql`and c.chatbot_id = ${chatbotId}` : sql``}
            ${adminFilter(f)}
          order by c.started_at desc
          limit ${MAX}
        )
        select p.id, p.chatbot_name, p.visitor_id, p.started_at,
               m.role, m.content, m.created_at,
               row_number() over (partition by p.id order by m.created_at) as seq
        from pilih p
        join messages m on m.conversation_id = p.id and m.deleted_at is null
        order by p.started_at desc, m.created_at asc
      `));

      const head = ['percakapan_id', 'chatbot', 'pengunjung', 'dimulai', 'urutan', 'peran', 'waktu', 'isi'];
      const lines = [head.join(',')];
      for (const r of list) {
        lines.push([
          r.id, r.chatbot_name, r.visitor_id ?? '', String(r.started_at),
          String(r.seq), r.role, String(r.created_at), r.content ?? '',
        ].map(csvCell).join(','));
      }
      return lines.join('\r\n');
    });
  },

  /** Transkrip satu sesi (blok + sitasi ikut — dirender UI yang sama). */
  messages(tenantId: string, conversationId: string) {
    return withPlatformAdmin(async (tx) => {
      const ms = rows<{ id: string; role: string; content: string; blocks: unknown; citations: unknown; created_at: string }>(
        await tx.execute(sql`
          select m.id, m.role, m.content, m.blocks, m.citations, m.created_at
          from messages m
          join conversations c on c.id = m.conversation_id
          where c.tenant_id = ${tenantId} and m.conversation_id = ${conversationId}
            and m.deleted_at is null
          order by m.created_at asc
        `));
      return ms.map((m) => ({
        id: m.id, role: m.role, content: m.content,
        blocks: m.blocks, citations: m.citations, createdAt: m.created_at,
      }));
    });
  },
};
