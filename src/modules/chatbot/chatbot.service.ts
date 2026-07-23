import { nanoid } from 'nanoid';
import { and, eq, isNull } from 'drizzle-orm';
import { users, documents, conversations, dataSources, type ThemeConfig } from '@/modules/core/db';
import { withTenant } from '@/modules/core/db/tenant-context';
import { dispatch } from '@/modules/core/events';
import { chatbotRepository as repo } from './chatbot.repository';

export class ValidationError extends Error {}

/**
 * Service = business logic + referential integrity (konsekuensi No-FK Rule #2).
 * Controller (route) hanya memanggil service; service tidak tahu HTTP.
 */
export const chatbotService = {
  list(tenantId: string) {
    return withTenant(tenantId, (tx) => repo.listActive(tx, tenantId));
  },

  listTrashed(tenantId: string) {
    return withTenant(tenantId, (tx) => repo.listTrashed(tx, tenantId));
  },

  async create(tenantId: string, input: {
    ownerId: string; name: string; allowedOrigins?: string[];
    greeting?: string; themeConfig?: ThemeConfig;
  }) {
    return withTenant(tenantId, async (tx) => {
      // Integritas referensial di aplikasi: owner harus user aktif tenant ini.
      const owner = await tx.select({ id: users.id }).from(users)
        .where(and(eq(users.id, input.ownerId), isNull(users.deletedAt))).limit(1);
      if (!owner[0]) throw new ValidationError('Owner tidak ditemukan di tenant ini');

      const created = await repo.create(tx, {
        tenantId,
        ownerId: input.ownerId,
        name: input.name,
        publicKey: 'cb_live_' + nanoid(24),
        allowedOrigins: input.allowedOrigins ?? [],
        greeting: input.greeting,
        themeConfig: input.themeConfig,
      });
      await dispatch('chatbot.created', { tenantId, chatbotId: created.id, ownerId: input.ownerId });
      return created;
    });
  },

  async update(tenantId: string, id: string, input: Partial<{
    name: string; allowedOrigins: string[]; greeting: string;
    enabled: boolean; themeConfig: ThemeConfig;
  }>) {
    return withTenant(tenantId, async (tx) => {
      const updated = await repo.update(tx, id, input);
      if (!updated) throw new ValidationError('Chatbot tidak ditemukan');
      return updated;
    });
  },

  /**
   * Soft delete + CASCADE di level aplikasi (bukan DB): dokumen, sumber data,
   * dan percakapan chatbot ikut di-soft-delete agar KB tidak yatim.
   */
  async softDelete(tenantId: string, id: string) {
    return withTenant(tenantId, async (tx) => {
      const deleted = await repo.softDelete(tx, id);
      if (!deleted) throw new ValidationError('Chatbot tidak ditemukan');
      const now = new Date();
      await tx.update(documents).set({ deletedAt: now, updatedAt: now })
        .where(and(eq(documents.chatbotId, id), isNull(documents.deletedAt)));
      await tx.update(dataSources).set({ deletedAt: now, updatedAt: now })
        .where(and(eq(dataSources.chatbotId, id), isNull(dataSources.deletedAt)));
      await tx.update(conversations).set({ deletedAt: now, updatedAt: now })
        .where(and(eq(conversations.chatbotId, id), isNull(conversations.deletedAt)));
      await dispatch('chatbot.deleted', { tenantId, chatbotId: id });
      return deleted;
    });
  },

  /** Restore chatbot + kaskade kebalikannya. */
  async restore(tenantId: string, id: string) {
    return withTenant(tenantId, async (tx) => {
      const restored = await repo.restore(tx, id);
      if (!restored) throw new ValidationError('Chatbot tidak ada di Sampah');
      const now = new Date();
      await tx.update(documents).set({ deletedAt: null, updatedAt: now })
        .where(eq(documents.chatbotId, id));
      await tx.update(dataSources).set({ deletedAt: null, updatedAt: now })
        .where(eq(dataSources.chatbotId, id));
      await tx.update(conversations).set({ deletedAt: null, updatedAt: now })
        .where(eq(conversations.chatbotId, id));
      await dispatch('chatbot.restored', { tenantId, chatbotId: id });
      return restored;
    });
  },

  embedSnippet(publicKey: string) {
    const host = process.env.NEXTAUTH_URL ?? '';
    return `<script src="${host}/embed.js" data-chatbot="${publicKey}"></script>`;
  },
};
