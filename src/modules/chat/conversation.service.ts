import { withTenant } from '@/modules/core/db/tenant-context';
import { toPage, type Paging, type Page } from '@/modules/core/pagination';
import { conversationRepository as repo } from './conversation.repository';

/** Baca riwayat percakapan (list + transcript) — terkurung tenant (RLS). */
export const conversationService = {
  /** Berhalaman: daftar percakapan tumbuh terus, jadi tak boleh ditarik utuh. */
  async list(tenantId: string, chatbotId: string | null, p: Paging): Promise<Page<unknown>> {
    return withTenant(tenantId, async (tx) => {
      const [rows, total] = await Promise.all([
        repo.list(tx, tenantId, chatbotId, p.limit, p.offset),
        repo.countAll(tx, tenantId, chatbotId),
      ]);
      return toPage(rows, total, p);
    });
  },
  messages(tenantId: string, conversationId: string) {
    return withTenant(tenantId, (tx) => repo.history(tx, tenantId, conversationId));
  },
};
