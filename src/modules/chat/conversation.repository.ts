import { and, eq, asc, isNull } from 'drizzle-orm';
import { conversations, messages, type Db } from '@/modules/core/db';

export const conversationRepository = {
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
