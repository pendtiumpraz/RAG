import { cookies } from 'next/headers';

/**
 * Auth boundary (stub). Wire this to NextAuth/Auth.js in production:
 *  - SaaS: session → user → user.tenantId (each signup gets a fresh tenant)
 *  - on-prem: single tenant, DEPLOYMENT_MODE=onprem, return the org tenant
 *
 * Kept deliberately thin so the rest of the app depends only on
 * getCurrentTenantId() / getCurrentUser(), not the auth provider.
 */
export async function getCurrentTenantId(): Promise<string> {
  if (process.env.DEPLOYMENT_MODE === 'onprem') {
    return process.env.ONPREM_TENANT_ID!;
  }
  // TODO: replace with real session lookup (NextAuth getServerSession).
  const jar = await cookies();
  const tid = jar.get('tenant_id')?.value;
  if (!tid) throw new Error('Not authenticated');
  return tid;
}

export async function getCurrentUser(): Promise<{ id: string; tenantId: string; role: string }> {
  const jar = await cookies();
  return {
    id: jar.get('user_id')?.value ?? '',
    tenantId: await getCurrentTenantId(),
    role: jar.get('role')?.value ?? 'member',
  };
}
