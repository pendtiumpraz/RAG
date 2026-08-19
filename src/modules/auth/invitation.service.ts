import { randomBytes, createHash } from 'node:crypto';
import { sql, eq, and, isNull, isNotNull, desc, gt } from 'drizzle-orm';
import { db, invitations, users, tenants } from '@/modules/core/db';
import { withTenant } from '@/modules/core/db/tenant-context';
import { hashPassword } from './password';
import { ValidationError } from '@/modules/chatbot/chatbot.service';
import { audit } from '@/modules/core/guardrails';
import { limitsFor } from '@/modules/core/limits-server';
import { effectivePlan, QuotaError } from '@/modules/usage/usage.service';
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
        /* Divisi (migrasi 0040) — halaman tim menampilkannya dan mengubahnya
           di tempat yang sama dengan peran, karena keduanya adalah jawaban
           atas satu pertanyaan: orang ini boleh melihat apa. */
        divisionId: users.divisionId,
      }).from(users)
        .where(isNull(users.deletedAt))
        .orderBy(desc(users.createdAt)));
  },

  /**
   * RBAC tenant — ubah peran anggota (admin ⇄ member).
   * Pengaman: target superadmin tak tersentuh (peran platform, bukan tenant);
   * admin TERAKHIR tak boleh diturunkan — tanpa admin, tenant lumpuh
   * (tak ada yang bisa mengelola chatbot/KB/tim).
   */
  async setMemberRole(tenantId: string, actorId: string, userId: string, role: 'admin' | 'member') {
    const hasil = await withTenant(tenantId, async (tx) => {
      const target = (await tx.select().from(users)
        .where(and(eq(users.id, userId), isNull(users.deletedAt))).limit(1))[0];
      if (!target) throw new ValidationError('Anggota tidak ditemukan');
      if (target.role === 'superadmin') throw new ValidationError('Peran superadmin dikelola platform, bukan tenant');
      if (target.role === role) return { id: target.id, role, sebelum: null };

      if (target.role === 'admin' && role === 'member') {
        const admins = await tx.select({ id: users.id }).from(users).where(and(
          eq(users.role, 'admin'), isNull(users.deletedAt)));
        if (admins.length <= 1) throw new ValidationError('Admin terakhir tidak boleh diturunkan');
      }
      await tx.update(users).set({ role, updatedAt: new Date() }).where(eq(users.id, userId));
      return { id: userId, role, sebelum: target.role };
    });

    /* audit() membuka withTenant SENDIRI — di luar transaksi, selalu. Lihat
       catatan panjang di chatbot.service.create(). */
    if (hasil.sebelum) {
      await audit(tenantId, actorId, 'team.role_changed', userId, { from: hasil.sebelum, to: role });
    }
    return { id: hasil.id, role: hasil.role };
  },

  /** Keluarkan anggota (soft delete — bisa dipulihkan platform bila keliru). */
  async removeMember(tenantId: string, actorId: string, userId: string) {
    if (actorId === userId) throw new ValidationError('Tidak bisa mengeluarkan diri sendiri');
    const hasil = await withTenant(tenantId, async (tx) => {
      const target = (await tx.select().from(users)
        .where(and(eq(users.id, userId), isNull(users.deletedAt))).limit(1))[0];
      if (!target) throw new ValidationError('Anggota tidak ditemukan');
      if (target.role === 'superadmin') throw new ValidationError('Superadmin tidak bisa dikeluarkan dari sini');
      if (target.role === 'admin') {
        const admins = await tx.select({ id: users.id }).from(users).where(and(
          eq(users.role, 'admin'), isNull(users.deletedAt)));
        if (admins.length <= 1) throw new ValidationError('Admin terakhir tidak boleh dikeluarkan');
      }
      await tx.update(users).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(users.id, userId));
      return { id: userId, email: target.email };
    });

    await audit(tenantId, actorId, 'team.member_removed', userId, { email: hasil.email });
    return { id: hasil.id };
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
      const t = await tx.select({ plan: tenants.plan, planExpiresAt: tenants.planExpiresAt })
        .from(tenants).where(eq(tenants.id, tenantId)).limit(1);
      const members = await tx.select({ id: users.id }).from(users)
        .where(isNull(users.deletedAt));
      const pending = await tx.select({ id: invitations.id }).from(invitations)
        .where(and(
          eq(invitations.tenantId, tenantId),
          isNull(invitations.deletedAt),
          isNull(invitations.acceptedAt),
          gt(invitations.expiresAt, new Date()),
        ));
      // Plan yang sudah lewat masa berlaku turun ke free — kursi ikut menyusut,
      // sama seperti kuota lain. Kalau dibaca mentah, plan kedaluwarsa masih
      // memberi jatah berbayar.
      return {
        plan: effectivePlan(t[0]?.plan, t[0]?.planExpiresAt),
        memberCount: members.length, pendingCount: pending.length,
      };
    });

    // Kursi terpakai = anggota + undangan yang masih berlaku. Menghitung
    // undangan juga mencegah mengundang 100 orang di plan free lalu semuanya
    // masuk sekaligus. D12: mode on-premise = kursi tanpa batas.
    const { platformSettingsService } = await import('@/modules/payments/platform-settings.service');
    const onprem = (await platformSettingsService.mode()) === 'onprem';
    const limits = await limitsFor(onprem ? 'onprem' : plan);
    if (memberCount + pendingCount >= limits.maxMembers) {
      // Kuota kursi habis → 402 (sebab + jalan keluar), bukan 422: jatahnya
      // penuh, bukan permintaannya salah.
      throw new QuotaError(
        `Kuota anggota plan "${plan}" penuh (${limits.maxMembers} kursi, terpakai `
        + `${memberCount} anggota + ${pendingCount} undangan). Naikkan plan untuk menambah kursi.`,
        memberCount + pendingCount, limits.maxMembers,
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
    // D13: kirim undangan via email — best-effort; tautan tetap tampil di UI
    // sebagai cadangan (SMTP kosong = alur lama, bagikan link manual).
    {
      const { mailerService } = await import('@/modules/mail/mailer.service');
      const orgName = (await db.select({ name: tenants.name }).from(tenants)
        .where(eq(tenants.id, tenantId)).limit(1))[0]?.name ?? 'workspace Nalar';
      void mailerService.sendInvitation(email, orgName, token);
    }
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
