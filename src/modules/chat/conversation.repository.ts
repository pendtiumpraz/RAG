import { and, eq, asc, desc, isNull, sql, count } from 'drizzle-orm';
import { conversations, messages, type Db } from '@/modules/core/db';

export const conversationRepository = {
  /**
   * Daftar percakapan + nama chatbot, preview pesan pertama, dan jumlah pesan.
   *
   * REFERENSI KOLOM LUAR DITULIS LITERAL (`conversations.id`), bukan
   * interpolasi `${conversations.id}`. Drizzle merender interpolasi itu sebagai
   * `"id"` TELANJANG — tanpa nama tabel — sehingga di dalam subquery ia
   * tertangkap ke tabel subquery sendiri: `m.conversation_id = m.id`. Tak
   * pernah benar, tak pernah melempar galat, dan hasilnya SETIAP percakapan
   * dilaporkan "0 pesan · (kosong)" padahal datanya utuh. Jebakan yang sama
   * sudah tercatat di knowledge-base.service.ts; di sini terlewat.
   *
   * Nama chatbot ikut diambil karena itulah yang berarti bagi pembaca:
   * `v_m0mzrcwhewh` hanya id pengunjung yang dibuat sendiri oleh widget dan
   * tak mengatakan apa pun tentang percakapannya.
   */
  list(tx: Db, tenantId: string, chatbotId: string | null, limit = 25, offset = 0) {
    const conds = [eq(conversations.tenantId, tenantId), isNull(conversations.deletedAt)];
    if (chatbotId) conds.push(eq(conversations.chatbotId, chatbotId));
    return tx.select({
      id: conversations.id, chatbotId: conversations.chatbotId, visitorId: conversations.visitorId,
      startedAt: conversations.startedAt,
      chatbotName: sql<string>`(select coalesce(b.name, '(chatbot terhapus)') from chatbots b
        where b.id = conversations.chatbot_id)`,
      preview: sql<string>`(select m.content from messages m
        where m.conversation_id = conversations.id and m.role = 'user' and m.deleted_at is null
        order by m.created_at asc limit 1)`,
      count: sql<number>`(select count(*)::int from messages m
        where m.conversation_id = conversations.id and m.deleted_at is null)`,
    }).from(conversations).where(and(...conds))
      .orderBy(desc(conversations.startedAt)).limit(limit).offset(offset);
  },

  /** Total untuk pager — filter HARUS sama dengan list(). */
  async countAll(tx: Db, tenantId: string, chatbotId: string | null): Promise<number> {
    const conds = [eq(conversations.tenantId, tenantId), isNull(conversations.deletedAt)];
    if (chatbotId) conds.push(eq(conversations.chatbotId, chatbotId));
    const rows = await tx.select({ n: count() }).from(conversations).where(and(...conds));
    return Number(rows[0]?.n ?? 0);
  },

  async findOrCreate(tx: Db, tenantId: string, chatbotId: string, conversationId?: string, visitorId?: string) {
    if (conversationId) {
      const rows = await tx.select({ id: conversations.id }).from(conversations)
        .where(and(eq(conversations.id, conversationId), isNull(conversations.deletedAt))).limit(1);
      if (rows[0]) return rows[0].id;
    }
    const created = await tx.insert(conversations)
      .values({ tenantId, chatbotId, visitorId })
      .returning({ id: conversations.id });
    return created[0].id;
  },

  history(tx: Db, tenantId: string, conversationId: string) {
    return tx.select().from(messages)
      .where(and(
        eq(messages.conversationId, conversationId),
        eq(messages.tenantId, tenantId),
        isNull(messages.deletedAt),
      ))
      .orderBy(asc(messages.createdAt));
  },

  appendMessage(tx: Db, values: typeof messages.$inferInsert) {
    return tx.insert(messages).values(values).returning({ id: messages.id });
  },
};
