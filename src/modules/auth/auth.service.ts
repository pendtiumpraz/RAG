import { sql, eq } from 'drizzle-orm';
import { db, tenants, users, tenantSettings } from '@/modules/core/db';
import { hashPassword, verifyPassword } from './password';
import { ValidationError } from '@/modules/chatbot/chatbot.service';
import { audit } from '@/modules/core/guardrails';

export interface AuthUser {
  id: string;
  tenantId: string;
  email: string;
  name: string | null;
  role: string;
  status: string;
}

/**
 * Hasil pemeriksaan kredensial, dipakai HANYA oleh endpoint pra-cek login
 * agar UI bisa menjelaskan kenapa login gagal.
 *  invalid  — email/password salah (jangan bocorkan yang mana)
 *  pending  — benar, tapi belum diverifikasi superadmin
 *  rejected — ditolak superadmin
 *  active   — boleh masuk
 */
export type CredentialOutcome = 'invalid' | 'unverified' | 'pending' | 'rejected' | 'active';

/**
 * AUTH SERVICE — signup → tenant, verifikasi kredensial, provisioning OAuth.
 *
 * Catatan RLS:
 *  • `tenants` tidak ber-RLS (root); `users`/`tenant_settings` FORCE RLS.
 *  • Signup: insert tenant dulu → set app.current_tenant KE ID BARU dalam
 *    transaksi yang sama → insert user + settings lolos policy dengan benar.
 *  • Lookup by email lintas-tenant (login/OAuth): buka HANYA lewat GUC
 *    app.auth_context='credential_login' (policy users_auth_lookup,
 *    migrations/0002_auth.sql). Di luar jalur ini isolasi tetap mutlak.
 */
export const authService = {
  /** Daftar baru: 1 signup = 1 tenant terisolasi + user admin + settings default. */
  async signup(input: { orgName: string; name: string; email: string; password: string }): Promise<AuthUser> {
    const email = input.email.trim().toLowerCase();
    const existing = await findByEmailForAuth(email);
    if (existing) throw new ValidationError('Email sudah terdaftar');

    const passwordHash = await hashPassword(input.password);

    return db.transaction(async (tx) => {
      const [tenant] = await tx.insert(tenants)
        .values({ name: input.orgName.trim() || `${input.name} Workspace` })
        .returning({ id: tenants.id });

      // Pin RLS ke tenant baru agar insert users/settings valid terhadap policy.
      await tx.execute(sql`select set_config('app.current_tenant', ${tenant.id}, true)`);

      const [user] = await tx.insert(users).values({
        tenantId: tenant.id, email, name: input.name, role: 'admin', passwordHash,
      }).returning();

      await tx.insert(tenantSettings).values({ tenantId: tenant.id });

      return {
        id: user.id, tenantId: user.tenantId, email: user.email,
        name: user.name, role: user.role, status: user.status,
      };
    }).then(async (u) => {
      await audit(u.tenantId, u.id, 'auth.signup', undefined, { email: u.email, status: u.status });
      // D13: kirim tautan verifikasi bila SMTP dikonfigurasi — best-effort,
      // pendaftaran tak boleh mati karena mail server rewel.
      const { mailerService } = await import('@/modules/mail/mailer.service');
      if (await mailerService.isConfigured()) {
        const { authTokenService } = await import('./auth-token.service');
        const token = await authTokenService.issue(u.id, 'verify');
        void mailerService.sendVerification(u.email, token);
      }
      return u;
    });
  },

  /**
   * Login email+password.
   *
   * Return null bila kredensial salah ATAU akun belum diverifikasi — dari sisi
   * NextAuth keduanya sama-sama "tidak boleh masuk", dan menyamakannya di sini
   * mencegah endpoint login jadi alat menebak email mana yang terdaftar.
   * Alasan yang sebenarnya hanya diberikan lewat `credentialOutcome()`, yang
   * baru menjawab setelah password TERBUKTI benar.
   */
  async verifyCredentials(email: string, password: string): Promise<AuthUser | null> {
    const user = await findByEmailForAuth(email.trim().toLowerCase());
    if (!user?.passwordHash) return null;
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) return null;
    if (user.status !== 'active') return null;
    // D13: gerbang verifikasi email — hanya bila SMTP aktif (tanpa SMTP,
    // perilaku lama utuh); user lama sudah di-backfill terverifikasi (0020).
    if (!user.emailVerifiedAt) {
      const { mailerService } = await import('@/modules/mail/mailer.service');
      if (await mailerService.isConfigured()) return null;
    }
    return {
      id: user.id, tenantId: user.tenantId, email: user.email,
      name: user.name, role: user.role, status: user.status,
    };
  },

  /**
   * Kenapa login gagal — hanya untuk UI, dan hanya setelah password benar.
   * Tanpa syarat itu, endpoint ini akan membocorkan status akun orang lain.
   */
  async credentialOutcome(email: string, password: string): Promise<CredentialOutcome> {
    const user = await findByEmailForAuth(email.trim().toLowerCase());
    if (!user?.passwordHash) return 'invalid';
    if (!(await verifyPassword(password, user.passwordHash))) return 'invalid';
    if (!user.emailVerifiedAt) {
      const { mailerService } = await import('@/modules/mail/mailer.service');
      if (await mailerService.isConfigured()) return 'unverified';
    }
    if (user.status === 'pending') return 'pending';
    if (user.status === 'rejected') return 'rejected';
    return 'active';
  },

  /**
   * OAuth (Google/Microsoft): user lama → pakai tenant-nya;
   * email baru → provisioning tenant baru (signup implisit).
   */
  /**
   * Pengguna yang masuk lewat SSO enterprise (D16).
   *
   * Bedanya dengan findOrCreateFromOAuth cuma satu, dan itu yang menentukan:
   * penggunanya mendarat di tenant PEMILIK KONEKSI, bukan di tenant baru
   * miliknya sendiri. Kalau salah, pelanggan melihat lima puluh workspace
   * kosong alih-alih satu workspace berisi lima puluh orang — dan tak ada
   * jalan mudah menggabungkannya kembali.
   *
   * Perannya `member`, bukan `admin`: orang yang masuk lewat direktori
   * perusahaan adalah KARYAWAN, dan yang pertama kali masuk bukan berarti
   * pemilik. Sebaliknya di findOrCreateFromOAuth, yang mendaftar memang
   * membuat workspace-nya sendiri.
   *
   * Statusnya tetap `pending` (bawaan kolom) — keputusan pemilik produk,
   * 1 Agu 2026. Keempat penyedia yang didukung melayani direktori raksasa;
   * "langsung aktif" berarti siapa pun yang punya akun di direktori pelanggan
   * bisa masuk tanpa satu pun mata manusia melihatnya.
   */
  async findOrCreateFromSso(profile: {
    email: string; name?: string | null; tenantId: string;
  }): Promise<AuthUser> {
    const email = profile.email.trim().toLowerCase();
    const existing = await findByEmailForAuth(email);
    if (existing) {
      return {
        id: existing.id, tenantId: existing.tenantId, email: existing.email,
        name: existing.name, role: existing.role, status: existing.status,
      };
    }
    const display = profile.name?.trim() || email.split('@')[0];
    return db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.current_tenant', ${profile.tenantId}, true)`);
      const [user] = await tx.insert(users).values({
        tenantId: profile.tenantId, email, name: display, role: 'member', passwordHash: null,
        // IdP perusahaan sudah membuktikan kepemilikan alamatnya.
        emailVerifiedAt: new Date(),
      }).returning();
      return {
        id: user.id, tenantId: user.tenantId, email: user.email,
        name: user.name, role: user.role, status: user.status,
      };
    });
  },

  async findOrCreateFromOAuth(profile: { email: string; name?: string | null }): Promise<AuthUser> {
    const email = profile.email.trim().toLowerCase();
    const existing = await findByEmailForAuth(email);
    if (existing) {
      return {
        id: existing.id, tenantId: existing.tenantId, email: existing.email,
        name: existing.name, role: existing.role, status: existing.status,
      };
    }
    const display = profile.name?.trim() || email.split('@')[0];
    return db.transaction(async (tx) => {
      const [tenant] = await tx.insert(tenants)
        .values({ name: `${display} Workspace` })
        .returning({ id: tenants.id });
      await tx.execute(sql`select set_config('app.current_tenant', ${tenant.id}, true)`);
      // status default 'pending' — gerbang verifikasi HARUS berlaku juga di
      // jalur OAuth, kalau tidak orang tinggal lewat Google dan gerbangnya bocor.
      const [user] = await tx.insert(users).values({
        tenantId: tenant.id, email, name: display, role: 'admin', passwordHash: null,
        // OAuth = email sudah terbukti milik pendaftar oleh Google/Microsoft
        emailVerifiedAt: new Date(),
      }).returning();
      await tx.insert(tenantSettings).values({ tenantId: tenant.id });
      return {
        id: user.id, tenantId: user.tenantId, email: user.email,
        name: user.name, role: user.role, status: user.status,
      };
    });
  },
};

/** Lookup by email di bawah auth-context policy (transaksi khusus, read-only). */
async function findByEmailForAuth(email: string) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.auth_context', 'credential_login', true)`);
    const rows = await tx.select().from(users).where(eq(users.email, email)).limit(1);
    const u = rows[0];
    return u && !u.deletedAt ? u : null;
  });
}
