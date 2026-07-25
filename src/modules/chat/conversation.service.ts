import { withTenant } from '@/modules/core/db/tenant-context';
import { conversationRepository as repo } from './conversation.repository';

/** Baca riwayat percakapan (list + transcript) — terkurung tenant (RLS). */
export const conversationService = {
  list(tenantId: string, chatbotId: string | null) {
    return withTenant(tenantId, (tx) => repo.list(tx, tenantId, chatbotId));
  },
  messages(tenantId: string, conversationId: string) {
    return withTenant(tenantId, (tx) => repo.history(tx, tenantId, conversationId));
  },
};
