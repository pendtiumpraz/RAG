import { eq, and } from 'drizzle-orm';
import { db, providerCredentials } from '@/lib/db';
import { decryptSecret } from '@/lib/crypto';

/**
 * Returns a resolver that fetches + decrypts the tenant's API key for a
 * given provider, falling back to an env default (useful for on-prem).
 * The returned function is what the embedding / LLM layers call.
 */
export function apiKeyResolver(tenantId: string) {
  const envFallback: Record<string, string | undefined> = {
    openai: process.env.OPENAI_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
    google: process.env.GOOGLE_GENAI_API_KEY,
  };

  return async (provider: string): Promise<string | null> => {
    const rows = await db
      .select()
      .from(providerCredentials)
      .where(and(
        eq(providerCredentials.tenantId, tenantId),
        eq(providerCredentials.provider, provider),
      ))
      .limit(1);
    if (rows[0]) return decryptSecret(rows[0].encryptedKey);
    return envFallback[provider] ?? null;
  };
}
