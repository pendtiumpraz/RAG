import { nanoid } from 'nanoid';
import { and, eq, isNull } from 'drizzle-orm';
import { users, conversations, chatbotKnowledgeBases, type ThemeConfig } from '@/modules/core/db';
import { withTenant } from '@/modules/core/db/tenant-context';
import { dispatch } from '@/modules/core/events';
import { usageService } from '@/modules/usage/usage.service';
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
    /** D11: konteks kepemilikan/persona (divisi) — masuk system prompt bot ini. */
    context?: string;
  }) {
    // Enforcement plan: batas jumlah chatbot.
    const usage = await usageService.snapshot(tenantId);
    const activeCount = (await this.list(tenantId)).length;
    if (activeCount >= usage.limits.maxChatbots) {
      throw new ValidationError(`Plan ${usage.plan} maksimal ${usage.limits.maxChatbots} chatbot. Upgrade untuk menambah.`);
    }

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
        context: input.context?.trim() || null,
      });
      await dispatch('chatbot.created', { tenantId, chatbotId: created.id, ownerId: input.ownerId });
      return created;
    });
  },

  async update(tenantId: string, id: string, input: Partial<{
    name: string; allowedOrigins: string[]; greeting: string;
    enabled: boolean; themeConfig: ThemeConfig; context: string | null;
  }>) {
    return withTenant(tenantId, async (tx) => {
      const updated = await repo.update(tx, id, input);
      if (!updated) throw new ValidationError('Chatbot tidak ditemukan');
      return updated;
    });
  },

  /**
   * Soft delete + CASCADE di level aplikasi (bukan DB) — D11: KB adalah
   * entitas BERSAMA, jadi menghapus chatbot TIDAK menyentuh KB/dokumennya;
   * yang ikut terhapus hanya ASSIGNMENT-nya dan percakapan chatbot ini.
   */
  async softDelete(tenantId: string, id: string) {
    return withTenant(tenantId, async (tx) => {
      const deleted = await repo.softDelete(tx, id);
      if (!deleted) throw new ValidationError('Chatbot tidak ditemukan');
      const now = new Date();
      await tx.update(chatbotKnowledgeBases).set({ deletedAt: now, updatedAt: now })
        .where(and(eq(chatbotKnowledgeBases.chatbotId, id), isNull(chatbotKnowledgeBases.deletedAt)));
      await tx.update(conversations).set({ deletedAt: now, updatedAt: now })
        .where(and(eq(conversations.chatbotId, id), isNull(conversations.deletedAt)));
      await dispatch('chatbot.deleted', { tenantId, chatbotId: id });
      return deleted;
    });
  },

  /** Restore chatbot + kaskade kebalikannya (assignment & percakapan). */
  async restore(tenantId: string, id: string) {
    return withTenant(tenantId, async (tx) => {
      const restored = await repo.restore(tx, id);
      if (!restored) throw new ValidationError('Chatbot tidak ada di Sampah');
      const now = new Date();
      await tx.update(chatbotKnowledgeBases).set({ deletedAt: null, updatedAt: now })
        .where(eq(chatbotKnowledgeBases.chatbotId, id));
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
