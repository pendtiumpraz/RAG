import { randomBytes, createHash } from 'node:crypto';
import { sql, eq, and, isNull, isNotNull, desc, gt } from 'drizzle-orm';
import { db, invitations, users, tenants } from '@/modules/core/db';
import { withTenant } from '@/modules/core/db/tenant-context';
import { hashPassword } from './password';
import { ValidationError } from '@/modules/chatbot/chatbot.service';
import { audit } from '@/modules/core/guardrails';
import { limitsForPlan } from '@/modules/core/limits';
import type { AuthUser } from './auth.service';

/**
 * UNDANGAN ANGGOTA TIM.
 *
 * Signup publik selalu membuat TENANT BARU; undangan justru sebaliknya —
 * menempelkan orang ke tenant yang sudah ada. Karena itu penerimaannya punya
 * jalur sendiri dan tidak lewat authService.signup().
 *
 * Hubungannya dengan gerbang verifikasi (D9): user yang diundang langsung
 * berstatus `active`, TIDAK menunggu superadmin. Alasannya, undangan itu
 * sendiri sudah merupakan verifikasi — dikeluarkan admin tenant yang sudah
 * terverifikasi, ditujukan ke satu alamat email, sekali pakai, dan kedaluwarsa.
 * Gerbang superadmin ada untuk menyaring orang asing yang mendaftar sendiri,
 * bukan orang yang sudah dijamin admin tenant.
 */

const TOKEN_TTL_DAYS = 7;

/** SHA-256, bukan scrypt: tokennya sudah 256-bit acak (tak bisa ditebak),
 *  dan pencarian by-token harus deterministik. */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface InvitationView {
  id: string;
  email: string;
  role: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  createdAt: Date;
  expired: boolean;
}

function toView(r: typeof invitations.$inferSelect): InvitationView {
  return {
    id: r.id, email: r.email, role: r.role, expiresAt: r.expiresAt,
    acceptedAt: r.acceptedAt, createdAt: r.createdAt,
    expired: !r.acceptedAt && r.expiresAt.getTime() < Date.now(),
  };
}

export const invitationService = {
  /** Anggota tenant saat ini (RLS sudah membatasi ke tenant pemanggil). */
  listMembers(tenantId: string) {
    return withTenant(tenantId, (tx) =>
      tx.select({
        id: users.id, email: users.email, name: users.name,
        role: users.role, status: users.status, createdAt: users.createdAt,
      }).from(users)
        .where(isNull(users.deletedAt))
        .orderBy(desc(users.createdAt)));
  },

  async listInvitations(tenantId: string): Promise<InvitationView[]> {
    const rows = await withTenant(tenantId, (tx) =>
      tx.select().from(invitations)
        .where(and(eq(invitations.tenantId, tenantId), isNull(invitations.deletedAt)))
        .orderBy(desc(invitations.createdAt)));
    return rows.map(toView);
  },

  async listTrashed(tenantId: string): Promise<InvitationView[]> {
    const rows = await withTenant(tenantId, (tx) =>
      tx.select().from(invitations)
        .where(and(eq(invitations.tenantId, tenantId), isNotNull(invitations.deletedAt)))
        .orderBy(desc(invitations.deletedAt)));
    return rows.map(toView);
  },

  /**
   * Buat undangan. Mengembalikan token SEKALI SAJA — sesudah ini hanya
   * hash-nya yang tersimpan, jadi tak ada cara menampilkannya lagi.
   */
  async create(
    tenantId: string,
    invitedBy: string,
    input: { email: string; role: 'admin' | 'member' },
  ): Promise<{ invitation: InvitationView; token: string }> {
    const email = input.email.trim().toLowerCase();
    if (!email.includes('@')) throw new ValidationError('Email tidak valid');

    const { plan, memberCount, pendingCount } = await withTenant(tenantId, async (tx) => {
      const t = await tx.select({ plan: tenants.plan }).from(tenants)
        .where(eq(tenants.id, tenantId)).limit(1);
      const members = await tx.select({ id: users.id }).from(users)
        .where(isNull(users.deletedAt));
      const pending = await tx.select({ id: invitations.id }).from(invitations)
        .where(and(
          eq(invitations.tenantId, tenantId),
          isNull(invitations.deletedAt),
          isNull(invitations.acceptedAt),
          gt(invitations.expiresAt, new Date()),
        ));
      return { plan: t[0]?.plan ?? 'free', memberCount: members.length, pendingCount: pending.length };
    });

    // Kursi terpakai = anggota + undangan yang masih berlaku. Menghitung
    // undangan juga mencegah mengundang 100 orang di plan free lalu semuanya
    // masuk sekaligus.
    const limits = limitsForPlan(plan);
    if (memberCount + pendingCount >= limits.maxMembers) {
      throw new ValidationError(
        `Kuota anggota plan "${plan}" penuh (${limits.maxMembers} kursi, terpakai `
        + `${memberCount} anggota + ${pendingCount} undangan). Naikkan plan untuk menambah kursi.`,
      );
    }

    const already = await withTenant(tenantId, (tx) =>
      tx.select({ id: users.id }).from(users)
        .where(and(eq(users.email, email), isNull(users.deletedAt))).limit(1));
    if (already[0]) throw new ValidationError('Orang ini sudah jadi anggota');

    const token = `inv_${randomBytes(32).toString('base64url')}`;
    const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 3600 * 1000);

    const row = await withTenant(tenantId, async (tx) => {
      // Undangan lama utk email yang sama dibatalkan — satu alamat, satu tautan aktif.
      await tx.update(invitations)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(and(
          eq(invitations.tenantId, tenantId), eq(invitations.email, email),
          isNull(invitations.deletedAt), isNull(invitations.acceptedAt),
        ));
      const inserted = await tx.insert(invitations).values({
        tenantId, email, role: input.role, tokenHash: hashToken(token),
        invitedBy, expiresAt,
      }).returning();
      return inserted[0];
    });

    await audit(tenantId, invitedBy, 'team.invite', row.id, { email, role: input.role });
    return { invitation: toView(row), token };
  },

  async revoke(tenantId: string, id: string): Promise<InvitationView> {
    const row = await withTenant(tenantId, async (tx) => {
      const rows = await tx.update(invitations)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(invitations.id, id), isNull(invitations.deletedAt)))
        .returning();
      return rows[0] ?? null;
    });
    if (!row) throw new ValidationError('Undangan tidak ditemukan');
    return toView(row);
  },

  async restore(tenantId: string, id: string): Promise<InvitationView> {
    const row = await withTenant(tenantId, async (tx) => {
      const rows = await tx.update(invitations)
        .set({ deletedAt: null, updatedAt: new Date() })
        .where(and(eq(invitations.id, id), isNotNull(invitations.deletedAt)))
        .returning();
      return rows[0] ?? null;
    });
    if (!row) throw new ValidationError('Undangan tidak ada di Sampah');
    return toView(row);
  },

  /**
   * Lihat undangan dari tokennya — dipakai halaman penerimaan SEBELUM ada sesi.
   * Berjalan di luar tenant (tenant belum diketahui), lewat policy
   * `invitations_accept_lookup` yang dibuka GUC `app.invite_context`.
   */
  async peek(token: string): Promise<{ email: string; role: string; tenantName: string | null } | null> {
    const hash = hashToken(token);
    return db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.invite_context', 'accept', true)`);
      const rows = await tx.select({
        email: invitations.email, role: invitations.role,
        expiresAt: invitations.expiresAt, acceptedAt: invitations.acceptedAt,
        deletedAt: invitations.deletedAt, tenantName: tenants.name,
      })
        .from(invitations)
        .leftJoin(tenants, eq(tenants.id, invitations.tenantId))
        .where(eq(invitations.tokenHash, hash)).limit(1);
      const r = rows[0];
      if (!r || r.deletedAt || r.acceptedAt || r.expiresAt.getTime() < Date.now()) return null;
      return { email: r.email, role: r.role, tenantName: r.tenantName };
    });
  },

  /**
   * Terima undangan → user baru MASUK KE TENANT PENGUNDANG (bukan tenant baru).
   * Langsung `active`: undangan itu sendiri sudah jadi verifikasinya (lihat
   * catatan di atas berkas ini).
   */
  async accept(token: string, input: { name: string; password: string }): Promise<AuthUser> {
    if (!input.password || input.password.length < 8) {
      throw new ValidationError('Password minimal 8 karakter');
    }
    const hash = hashToken(token);
    const passwordHash = await hashPassword(input.password);

    return db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.invite_context', 'accept', true)`);
      const found = await tx.select().from(invitations)
        .where(eq(invitations.tokenHash, hash)).limit(1);
      const inv = found[0];
      if (!inv || inv.deletedAt) throw new ValidationError('Undangan tidak berlaku');
      if (inv.acceptedAt) throw new ValidationError('Undangan sudah dipakai');
      if (inv.expiresAt.getTime() < Date.now()) throw new ValidationError('Undangan sudah kedaluwarsa');

      // Mulai sekarang kita tahu tenantnya — pin RLS agar insert/update valid.
      await tx.execute(sql`select set_config('app.current_tenant', ${inv.tenantId}, true)`);

      const existing = await tx.select({ id: users.id }).from(users)
        .where(and(eq(users.email, inv.email), isNull(users.deletedAt))).limit(1);
      if (existing[0]) throw new ValidationError('Email ini sudah terdaftar');

      const [user] = await tx.insert(users).values({
        tenantId: inv.tenantId, email: inv.email, name: input.name.trim() || inv.email.split('@')[0],
        role: inv.role, passwordHash, status: 'active', approvedAt: new Date(),
        approvedBy: inv.invitedBy,
      }).returning();

      await tx.update(invitations)
        .set({ acceptedAt: new Date(), acceptedUserId: user.id, updatedAt: new Date() })
        .where(eq(invitations.id, inv.id));

      return {
        id: user.id, tenantId: user.tenantId, email: user.email,
        name: user.name, role: user.role, status: user.status,
      };
    }).then(async (u) => {
      await audit(u.tenantId, u.id, 'team.invite.accepted', undefined, { email: u.email });
      return u;
    });
  },
};
