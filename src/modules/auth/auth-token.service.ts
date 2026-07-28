import { createHash, randomBytes } from 'node:crypto';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db, authTokens, users } from '@/modules/core/db';
import { hashPassword } from './password';

/**
 * TOKEN VERIFIKASI EMAIL & RESET PASSWORD (D13).
 * Token 256-bit acak; yang tersimpan hanya sha256-nya (pola invitations) —
 * bocornya tabel tak memberi siapa pun tautan yang bisa dipakai.
 * Konsumsi = sekali pakai + kedaluwarsa (verify 24 jam, reset 1 jam).
 *
 * users FORCE RLS sedangkan tautan email datang TANPA sesi — penulisan
 * ke users memakai GUC platform_admin (policy 0009), di sini saja dan
 * hanya setelah token terbukti sah.
 */

const hash = (t: string) => createHash('sha256').update(t).digest('hex');

function withPlatformAdmin<T>(fn: (tx: typeof db) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.admin_context', 'platform_admin', true)`);
    return fn(tx as unknown as typeof db);
  });
}

export const authTokenService = {
  /** Terbitkan token; token ASLI dikembalikan utk dikirim via email. */
  async issue(userId: string, kind: 'verify' | 'reset'): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    const hours = kind === 'verify' ? 24 : 1;
    await db.insert(authTokens).values({
      userId, kind, tokenHash: hash(token),
      expiresAt: new Date(Date.now() + hours * 3_600_000),
    });
    return token;
  },

  /** Pakai token: valid & belum dipakai & belum kedaluwarsa → userId. */
  async consume(kind: 'verify' | 'reset', token: string): Promise<string | null> {
    const row = (await db.select().from(authTokens).where(and(
      eq(authTokens.tokenHash, hash(token)), eq(authTokens.kind, kind),
      isNull(authTokens.usedAt), isNull(authTokens.deletedAt))).limit(1))[0];
    if (!row || row.expiresAt < new Date()) return null;
    await db.update(authTokens).set({ usedAt: new Date(), updatedAt: new Date() })
      .where(eq(authTokens.id, row.id));
    return row.userId;
  },

  /** Tandai email terverifikasi (dipanggil dari tautan publik). */
  async markEmailVerified(userId: string): Promise<boolean> {
    return withPlatformAdmin(async (tx) => {
      const rows = await tx.update(users)
        .set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(users.id, userId), isNull(users.deletedAt)))
        .returning({ id: users.id });
      return rows.length > 0;
    });
  },

  /** Setel password baru dari tautan reset yang sudah terverifikasi. */
  async setPassword(userId: string, password: string): Promise<boolean> {
    const passwordHash = await hashPassword(password);
    return withPlatformAdmin(async (tx) => {
      const rows = await tx.update(users)
        .set({ passwordHash, updatedAt: new Date() })
        .where(and(eq(users.id, userId), isNull(users.deletedAt)))
        .returning({ id: users.id });
      return rows.length > 0;
    });
  },

  /** Cari user by email utk alur lupa-password. users FORCE RLS — dibuka
   *  lewat GUC auth lookup yang sama dgn login (policy users_auth_lookup). */
  async findUserByEmail(email: string): Promise<{ id: string; hasPassword: boolean } | null> {
    return db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.auth_context', 'credential_login', true)`);
      const row = (await tx.select({ id: users.id, passwordHash: users.passwordHash })
        .from(users).where(and(
          eq(users.email, email.trim().toLowerCase()), isNull(users.deletedAt))).limit(1))[0];
      return row ? { id: row.id, hasPassword: !!row.passwordHash } : null;
    });
  },
};
