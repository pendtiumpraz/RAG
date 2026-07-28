import { and, eq, isNull, isNotNull, desc, inArray, sql } from 'drizzle-orm';
import { knowledgeBases, chatbotKnowledgeBases, chatbots, dataSources, documents } from '@/modules/core/db';
import { withTenant } from '@/modules/core/db/tenant-context';
import { audit } from '@/modules/core/guardrails';
import { ValidationError } from '@/modules/chatbot/chatbot.service';

/**
 * KNOWLEDGE BASE — entitas mandiri per tenant (D11).
 *
 * KB memiliki sumber (data_sources) dan dokumen; chatbot MEMAKAINYA lewat
 * assignment N:M. Satu folder Drive di-ingest sekali, dipakai berapa pun
 * chatbot. Semua akses lewat withTenant (RLS), soft-delete + restore sesuai
 * rules-of-the-game.
 */
export const knowledgeBaseService = {
  /** Daftar KB hidup + ringkasan (jumlah sumber, chunk, chatbot ter-assign). */
  list(tenantId: string) {
    return withTenant(tenantId, (tx) =>
      tx.select({
        id: knowledgeBases.id,
        name: knowledgeBases.name,
        description: knowledgeBases.description,
        updatedAt: knowledgeBases.updatedAt,
        sources: sql<number>`(select count(*)::int from data_sources s
          where s.knowledge_base_id = ${knowledgeBases.id} and s.deleted_at is null)`,
        chunks: sql<number>`(select count(*)::int from documents d
          where d.knowledge_base_id = ${knowledgeBases.id} and d.deleted_at is null)`,
        chatbots: sql<Array<{ id: string; name: string }>>`coalesce((
          select json_agg(json_build_object('id', c.id, 'name', c.name))
          from chatbot_knowledge_bases a
          join chatbots c on c.id = a.chatbot_id and c.deleted_at is null
          where a.knowledge_base_id = ${knowledgeBases.id} and a.deleted_at is null), '[]')`,
      }).from(knowledgeBases)
        .where(and(eq(knowledgeBases.tenantId, tenantId), isNull(knowledgeBases.deletedAt)))
        .orderBy(desc(knowledgeBases.updatedAt)));
  },

  async create(tenantId: string, actorId: string, input: { name: string; description?: string }) {
    const name = input.name?.trim();
    if (!name) throw new ValidationError('Nama knowledge base wajib diisi');
    const row = await withTenant(tenantId, async (tx) =>
      (await tx.insert(knowledgeBases).values({
        tenantId, name, description: input.description?.trim() || null,
      }).returning())[0]);
    await audit(tenantId, actorId, 'kb.created', row.id, { name });
    return row;
  },

  async update(tenantId: string, actorId: string, id: string, input: { name?: string; description?: string }) {
    const row = await withTenant(tenantId, async (tx) =>
      (await tx.update(knowledgeBases).set({
        ...(input.name?.trim() ? { name: input.name.trim() } : {}),
        ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
        updatedAt: new Date(),
      }).where(and(eq(knowledgeBases.id, id), isNull(knowledgeBases.deletedAt)))
        .returning())[0] ?? null);
    if (!row) throw new ValidationError('Knowledge base tidak ditemukan');
    await audit(tenantId, actorId, 'kb.updated', id, {});
    return row;
  },

  /**
   * Soft-delete KB. Cascade app-level (Rule #2, tanpa FK): assignment,
   * sumber, dan dokumennya ikut di-soft-delete — retrieval chatbot mana pun
   * berhenti melihat isinya seketika. Restore mengembalikan SEMUA.
   */
  async softDelete(tenantId: string, actorId: string, id: string) {
    const now = new Date();
    const row = await withTenant(tenantId, async (tx) => {
      const kb = (await tx.update(knowledgeBases).set({ deletedAt: now, updatedAt: now })
        .where(and(eq(knowledgeBases.id, id), isNull(knowledgeBases.deletedAt)))
        .returning())[0] ?? null;
      if (!kb) return null;
      await tx.update(chatbotKnowledgeBases).set({ deletedAt: now, updatedAt: now })
        .where(and(eq(chatbotKnowledgeBases.knowledgeBaseId, id), isNull(chatbotKnowledgeBases.deletedAt)));
      await tx.update(dataSources).set({ deletedAt: now, updatedAt: now })
        .where(and(eq(dataSources.knowledgeBaseId, id), isNull(dataSources.deletedAt)));
      await tx.update(documents).set({ deletedAt: now, updatedAt: now })
        .where(and(eq(documents.knowledgeBaseId, id), isNull(documents.deletedAt)));
      return kb;
    });
    if (!row) throw new ValidationError('Knowledge base tidak ditemukan');
    await audit(tenantId, actorId, 'kb.deleted', id, {});
    return row;
  },

  listTrashed(tenantId: string) {
    return withTenant(tenantId, (tx) =>
      tx.select({ id: knowledgeBases.id, name: knowledgeBases.name, deletedAt: knowledgeBases.deletedAt })
        .from(knowledgeBases)
        .where(and(eq(knowledgeBases.tenantId, tenantId), isNotNull(knowledgeBases.deletedAt)))
        .orderBy(desc(knowledgeBases.deletedAt)));
  },

  /** Restore KB + isi yang ikut terhapus PADA CASCADE YANG SAMA (timestamp
   *  identik) — dokumen yang dihapus manual sebelumnya tetap di Sampah. */
  async restore(tenantId: string, actorId: string, id: string) {
    const row = await withTenant(tenantId, async (tx) => {
      const kb = (await tx.select().from(knowledgeBases)
        .where(and(eq(knowledgeBases.id, id), isNotNull(knowledgeBases.deletedAt))).limit(1))[0];
      if (!kb?.deletedAt) return null;
      const ts = kb.deletedAt;
      await tx.update(knowledgeBases).set({ deletedAt: null, updatedAt: new Date() })
        .where(eq(knowledgeBases.id, id));
      await tx.update(chatbotKnowledgeBases).set({ deletedAt: null, updatedAt: new Date() })
        .where(and(eq(chatbotKnowledgeBases.knowledgeBaseId, id), eq(chatbotKnowledgeBases.deletedAt, ts)));
      await tx.update(dataSources).set({ deletedAt: null, updatedAt: new Date() })
        .where(and(eq(dataSources.knowledgeBaseId, id), eq(dataSources.deletedAt, ts)));
      await tx.update(documents).set({ deletedAt: null, updatedAt: new Date() })
        .where(and(eq(documents.knowledgeBaseId, id), eq(documents.deletedAt, ts)));
      return kb;
    });
    if (!row) throw new ValidationError('Knowledge base tidak ada di Sampah');
    await audit(tenantId, actorId, 'kb.restored', id, {});
    return row;
  },

  /**
   * Setel daftar chatbot yang memakai KB ini (idempotent, deklaratif):
   * yang hilang dari daftar di-soft-delete, yang baru ditambahkan.
   */
  async setAssignments(tenantId: string, actorId: string, kbId: string, chatbotIds: string[]) {
    const unique = [...new Set(chatbotIds)];
    await withTenant(tenantId, async (tx) => {
      const kb = (await tx.select({ id: knowledgeBases.id }).from(knowledgeBases)
        .where(and(eq(knowledgeBases.id, kbId), isNull(knowledgeBases.deletedAt))).limit(1))[0];
      if (!kb) throw new ValidationError('Knowledge base tidak ditemukan');

      if (unique.length) {
        const bots = await tx.select({ id: chatbots.id }).from(chatbots)
          .where(and(inArray(chatbots.id, unique), isNull(chatbots.deletedAt)));
        if (bots.length !== unique.length) throw new ValidationError('Ada chatbot yang tidak ditemukan');
      }

      const current = await tx.select().from(chatbotKnowledgeBases).where(and(
        eq(chatbotKnowledgeBases.knowledgeBaseId, kbId), isNull(chatbotKnowledgeBases.deletedAt)));
      const now = new Date();
      const keep = new Set(unique);
      const have = new Set(current.map((a) => a.chatbotId));

      const toRemove = current.filter((a) => !keep.has(a.chatbotId)).map((a) => a.id);
      if (toRemove.length) {
        await tx.update(chatbotKnowledgeBases).set({ deletedAt: now, updatedAt: now })
          .where(inArray(chatbotKnowledgeBases.id, toRemove));
      }
      const toAdd = unique.filter((cid) => !have.has(cid));
      if (toAdd.length) {
        await tx.insert(chatbotKnowledgeBases).values(
          toAdd.map((chatbotId) => ({ tenantId, chatbotId, knowledgeBaseId: kbId })));
      }
    });
    await audit(tenantId, actorId, 'kb.assigned', kbId, { chatbotIds: unique });
  },

  /** KB ids yang ter-assign ke satu chatbot (utk sync→memory & UI). */
  async assignedChatbots(tenantId: string, kbId: string): Promise<string[]> {
    return withTenant(tenantId, async (tx) => {
      const rows = await tx.select({ chatbotId: chatbotKnowledgeBases.chatbotId })
        .from(chatbotKnowledgeBases)
        .where(and(eq(chatbotKnowledgeBases.knowledgeBaseId, kbId), isNull(chatbotKnowledgeBases.deletedAt)));
      return rows.map((r) => r.chatbotId);
    });
  },
};
