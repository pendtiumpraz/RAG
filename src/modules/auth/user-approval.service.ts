import { sql, eq, and, isNull, desc, ne } from 'drizzle-orm';
import { db, users, tenants } from '@/modules/core/db';
import { ValidationError } from '@/modules/chatbot/chatbot.service';
import { audit } from '@/modules/core/guardrails';

/**
 * VERIFIKASI PENDAFTARAN — wewenang superadmin.
 *
 * Pendaftaran terbuka untuk siapa pun, tapi akun berstatus `pending` tak bisa
 * login sampai diverifikasi. Layanan ini yang memutuskannya.
 *
 * Soal RLS: setiap signup membuat TENANT-nya sendiri, jadi daftar user yang
 * menunggu verifikasi otomatis tersebar lintas tenant — sementara `users`
 * FORCE RLS per tenant. Jalan keluarnya sama dengan pola login lintas-tenant
 * yang sudah ada (`users_auth_lookup`, 0002): satu policy tambahan yang HANYA
 * terbuka ketika transaksi menyatakan konteks admin platform lewat GUC
 * `app.admin_context`. GUC itu diset di sini saja, dan hanya dipanggil rute
 * yang sudah lolos requireRole('superadmin').
 */

export interface PendingUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  status: string;
  tenantId: string;
  tenantName: string | null;
  createdAt: Date;
  approvedAt: Date | null;
}

/** Jalankan `fn` di dalam transaksi yang membuka policy admin platform. */
function withPlatformAdmin<T>(fn: (tx: typeof db) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.admin_context', 'platform_admin', true)`);
    return fn(tx as unknown as typeof db);
  });
}

async function listByStatus(status: string | null): Promise<PendingUser[]> {
  return withPlatformAdmin(async (tx) => {
    const rows = await tx.select({
      id: users.id, email: users.email, name: users.name, role: users.role,
      status: users.status, tenantId: users.tenantId, createdAt: users.createdAt,
      approvedAt: users.approvedAt, tenantName: tenants.name,
    })
      .from(users)
      .leftJoin(tenants, eq(tenants.id, users.tenantId))
      .where(status
        ? and(eq(users.status, status), isNull(users.deletedAt))
        : isNull(users.deletedAt))
      .orderBy(desc(users.createdAt));
    return rows as PendingUser[];
  });
}

export const userApprovalService = {
  /** Antrean verifikasi — yang paling sering dilihat superadmin. */
  listPending: () => listByStatus('pending'),
  /** Semua akun, untuk meninjau/mencabut keputusan. */
  listAll: () => listByStatus(null),

  async setStatus(
    actor: { id: string; tenantId: string },
    userId: string,
    status: 'active' | 'rejected' | 'pending',
  ): Promise<PendingUser> {
    const row = await withPlatformAdmin(async (tx) => {
      const rows = await tx.update(users)
        .set({
          status,
          approvedAt: status === 'active' ? new Date() : null,
          approvedBy: status === 'active' ? actor.id : null,
          updatedAt: new Date(),
        })
        .where(and(eq(users.id, userId), isNull(users.deletedAt)))
        .returning({
          id: users.id, email: users.email, name: users.name, role: users.role,
          status: users.status, tenantId: users.tenantId, createdAt: users.createdAt,
          approvedAt: users.approvedAt,
        });
      return rows[0] ?? null;
    });
    if (!row) throw new ValidationError('User tidak ditemukan');

    await audit(actor.tenantId, actor.id, `auth.user.${status}`, userId, { email: row.email });
    return { ...row, tenantName: null } as PendingUser;
  },

  /**
   * Berapa superadmin AKTIF yang tersisa selain `exceptUserId`.
   * Dipakai untuk mencegah superadmin terakhir menonaktifkan dirinya sendiri —
   * kalau itu terjadi, tak ada lagi yang bisa memverifikasi siapa pun dan
   * platform terkunci permanen tanpa akses database.
   */
  async countOtherActiveSuperadmins(exceptUserId: string): Promise<number> {
    return withPlatformAdmin(async (tx) => {
      const rows = await tx.select({ id: users.id }).from(users)
        .where(and(
          eq(users.role, 'superadmin'),
          eq(users.status, 'active'),
          ne(users.id, exceptUserId),
          isNull(users.deletedAt),
        ));
      return rows.length;
    });
  },
};
