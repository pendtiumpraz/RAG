import { and, eq, asc, desc, gte, lte, inArray, isNull, sql, count } from 'drizzle-orm';
import { conversations, messages, type Db } from '@/modules/core/db';

export interface ConvoFilter {
  /** kata kunci — dicari di ISI PESAN, bukan hanya preview */
  q?: string;
  /** batas tanggal, inklusif (ISO) */
  from?: Date;
  to?: Date;
}

/**
 * Kondisi filter yang dipakai BERSAMA oleh list(), countAll(), dan forExport().
 *
 * Satu fungsi, bukan tiga salinan: pager yang filternya berbeda sedikit saja
 * dari daftarnya akan melaporkan jumlah halaman yang salah — dan itu jenis
 * bug yang baru ketahuan setelah pengguna mengeluh halaman terakhir kosong.
 */
function filterConds(chatbotId: string | null, f: ConvoFilter) {
  const c = [];
  if (chatbotId) c.push(eq(conversations.chatbotId, chatbotId));
  if (f.from) c.push(gte(conversations.startedAt, f.from));
  if (f.to) c.push(lte(conversations.startedAt, f.to));
  if (f.q?.trim()) {
    // Dicari di ISI PESAN, bukan di preview. Orang mencari kalimat yang
    // diingatnya muncul di tengah percakapan; membatasi pencarian ke pesan
    // pertama akan membuat sebagian besar pencarian gagal tanpa sebab yang
    // jelas. ILIKE cukup di sini: skalanya per-tenant, dan indeks fts pada
    // `messages` tak ada (kolom itu milik `documents`).
    const like = `%${f.q.trim().replace(/[%_]/g, (m) => `\\${m}`)}%`;
    c.push(sql`exists (select 1 from messages m
      where m.conversation_id = conversations.id and m.deleted_at is null
        and m.content ilike ${like})`);
  }
  return c;
}

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
  list(tx: Db, tenantId: string, chatbotId: string | null, limit = 25, offset = 0, f: ConvoFilter = {}) {
    const conds = [eq(conversations.tenantId, tenantId), isNull(conversations.deletedAt), ...filterConds(chatbotId, f)];
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
  async countAll(tx: Db, tenantId: string, chatbotId: string | null, f: ConvoFilter = {}): Promise<number> {
    const conds = [eq(conversations.tenantId, tenantId), isNull(conversations.deletedAt), ...filterConds(chatbotId, f)];
    const rows = await tx.select({ n: count() }).from(conversations).where(and(...conds));
    return Number(rows[0]?.n ?? 0);
  },

  /**
   * Seluruh percakapan yang cocok filter, BESERTA transkripnya — untuk ekspor.
   *
   * Sengaja terpisah dari `list()`: yang ini menarik setiap pesan, jadi ia tak
   * boleh dipakai di jalur tampilan. Batasnya tegas supaya satu klik Ekspor
   * tak pernah menarik seluruh riwayat tenant ke dalam memori lambda.
   */
  async forExport(tx: Db, tenantId: string, chatbotId: string | null, f: ConvoFilter, max = 1000) {
    const conds = [eq(conversations.tenantId, tenantId), isNull(conversations.deletedAt), ...filterConds(chatbotId, f)];
    const heads = await tx.select({
      id: conversations.id, visitorId: conversations.visitorId, startedAt: conversations.startedAt,
      chatbotName: sql<string>`(select coalesce(b.name, '(chatbot terhapus)') from chatbots b
        where b.id = conversations.chatbot_id)`,
    }).from(conversations).where(and(...conds))
      .orderBy(desc(conversations.startedAt)).limit(max);
    if (!heads.length) return [];

    const ids = heads.map((h) => h.id);
    const msgs = await tx.select({
      conversationId: messages.conversationId, role: messages.role,
      content: messages.content, createdAt: messages.createdAt,
    }).from(messages).where(and(
      inArray(messages.conversationId, ids), isNull(messages.deletedAt),
    )).orderBy(asc(messages.createdAt));

    const byConvo = new Map<string, typeof msgs>();
    for (const m of msgs) {
      const arr = byConvo.get(m.conversationId) ?? [];
      arr.push(m); byConvo.set(m.conversationId, arr);
    }
    return heads.map((h) => ({ ...h, messages: byConvo.get(h.id) ?? [] }));
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
