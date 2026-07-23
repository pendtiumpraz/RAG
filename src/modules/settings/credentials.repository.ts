import { eq, and, isNull } from 'drizzle-orm';
import { db, providerCredentials } from '@/modules/core/db';
import { decryptSecret, encryptSecret } from '@/modules/core/crypto';
import { withTenant } from '@/modules/core/db/tenant-context';

/**
 * Kredensial provider per tenant — terenkripsi AES-256-GCM at rest,
 * HANYA didekripsi server-side (server-to-server; tak pernah ke browser).
 */
export function apiKeyResolver(tenantId: string) {
  const envFallback: Record<string, string | undefined> = {
    openai: process.env.OPENAI_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
    google: process.env.GOOGLE_GENAI_API_KEY,
  };

  return async (provider: string): Promise<string | null> => {
    const rows = await db.select().from(providerCredentials)
      .where(and(
        eq(providerCredentials.tenantId, tenantId),
        eq(providerCredentials.provider, provider),
        isNull(providerCredentials.deletedAt),
      )).limit(1);
    if (rows[0]) return decryptSecret(rows[0].encryptedKey);
    return envFallback[provider] ?? null;
  };
}

/** Upsert key (soft-delete baris lama, insert baris baru — jejak audit utuh). */
export async function saveApiKey(tenantId: string, provider: string, plainKey: string) {
  return withTenant(tenantId, async (tx) => {
    await tx.update(providerCredentials)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(
        eq(providerCredentials.tenantId, tenantId),
        eq(providerCredentials.provider, provider),
        isNull(providerCredentials.deletedAt),
      ));
    await tx.insert(providerCredentials).values({
      tenantId, provider, encryptedKey: encryptSecret(plainKey),
    });
  });
}
