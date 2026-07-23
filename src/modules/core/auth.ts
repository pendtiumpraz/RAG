import { getServerSession } from 'next-auth';
import { authOptions } from '@/modules/auth/auth.options';

export class UnauthorizedError extends Error {
  constructor(msg = 'Not authenticated') { super(msg); }
}

export interface CurrentUser {
  id: string;
  tenantId: string;
  role: string; // 'superadmin' | 'admin' | 'member'
}

/**
 * Identitas request saat ini — SATU-SATUNYA pintu auth utk service/route.
 *  • SaaS   : sesi NextAuth (JWT membawa userId/tenantId/role).
 *  • On-prem: DEPLOYMENT_MODE=onprem → tenant tunggal dari env, tanpa login
 *             multi-tenant (dipakai deployment air-gapped).
 */
export async function getCurrentUser(): Promise<CurrentUser> {
  if (process.env.DEPLOYMENT_MODE === 'onprem') {
    const tenantId = process.env.ONPREM_TENANT_ID;
    if (!tenantId) throw new UnauthorizedError('ONPREM_TENANT_ID belum di-set');
    return { id: process.env.ONPREM_USER_ID ?? tenantId, tenantId, role: 'admin' };
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !session.user.tenantId) throw new UnauthorizedError();
  return { id: session.user.id, tenantId: session.user.tenantId, role: session.user.role };
}

export async function getCurrentTenantId(): Promise<string> {
  return (await getCurrentUser()).tenantId;
}

/** Guard peran: throw bila peran user tidak termasuk yang diizinkan. */
export async function requireRole(...roles: string[]): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!roles.includes(user.role)) throw new UnauthorizedError('Peran tidak diizinkan');
  return user;
}
