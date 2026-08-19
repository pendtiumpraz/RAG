import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { users } from '@/modules/core/db';
import { withTenant } from '@/modules/core/db/tenant-context';
import type { AktorDivisi } from '@/modules/chatbot/divisi';

/**
 * Aktor tetap untuk jalur API-key.
 *
 * Kunci API bersifat SCOPE (read/write/chat), bukan role di dalam tenant —
 * jadi pemanggilnya diperlakukan sebagai admin tenant yang menembus batas
 * divisi (lintasDivisi = true). Ini kontrak, bukan celah: authz per-pengguna
 * adalah tanggung jawab sistem pemanggil (mis. Maira) SEBELUM proxy ke sini.
 * Lihat feasibility-maira-nalar.md risiko #9.
 */
export const API_AKTOR: AktorDivisi = Object.freeze({ role: 'admin', divisionId: null });

/**
 * Pemilik tindakan untuk operasi ber-API-key.
 *
 * Beberapa service (chatbot.create) menuntut `ownerId` user aktif tenant ini,
 * dan jejak audit butuh actor nyata — sedangkan kunci API tak membawa user.
 * Ambil admin/superadmin aktif pertama (superadmin diutamakan). Null bila
 * tenant tak punya admin aktif — pemanggil balas 409, bukan insert owner null.
 */
export async function tenantOwner(tenantId: string): Promise<{ id: string; email: string } | null> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx.select({ id: users.id, email: users.email, role: users.role })
      .from(users)
      .where(and(
        isNull(users.deletedAt),
        eq(users.status, 'active'),
        inArray(users.role, ['superadmin', 'admin']),
      ))
      .orderBy(asc(users.createdAt))
      .limit(10);
    const pick = rows.find((r) => r.role === 'superadmin') ?? rows[0];
    return pick ? { id: pick.id, email: pick.email } : null;
  });
}
