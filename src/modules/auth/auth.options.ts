import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import AzureADProvider from 'next-auth/providers/azure-ad';
import { authService } from './auth.service';
import { connectionService } from '@/modules/connections/connection.service';
import { oauthAppService, googleLoginScope } from './oauth-app.service';

/**
 * NextAuth (Auth.js v4) — JWT session membawa { userId, tenantId, role }
 * sehingga setiap request tahu tenant-nya tanpa query tambahan.
 *
 * Provider:
 *  • Credentials — email+password (scrypt, cek via authService).
 *  • Google & Microsoft — OAuth; email baru = provisioning tenant baru
 *    otomatis (signup implisit) di callback jwt.
 */
/**
 * Opsi DASAR — dipakai `getServerSession()` untuk membaca sesi.
 *
 * Providernya sengaja hanya `credentials`: pembacaan sesi JWT cuma butuh
 * `secret` dan callbacks, tak peduli daftar provider OAuth. Daftar lengkapnya
 * dibangun per-request oleh `buildAuthOptions()`, karena kredensial Google/
 * Microsoft kini datang dari DATABASE dan tak bisa dibaca saat modul dimuat.
 */
export const authOptions: NextAuthOptions = {
  session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: '/auth' },
  secret: process.env.NEXTAUTH_SECRET,

  providers: [
    CredentialsProvider({
      name: 'Email',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        /** Kode TOTP atau kode cadangan. Kosong bila akunnya belum memakai 2FA. */
        totp: { label: 'Kode', type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const user = await authService.verifyCredentials(credentials.email, credentials.password);
        if (!user) return null;

        /* FAKTOR KEDUA — diperiksa SESUDAH kata sandi terbukti benar.
           Urutannya menentukan: memeriksa 2FA lebih dulu akan memberi tahu
           penyerang mana email yang memakainya, tanpa ia perlu tahu kata
           sandinya sama sekali.

           Akun yang BELUM menyalakan 2FA tak tersentuh sama sekali — kalau
           tidak, migrasi 0038 akan mengunci setiap pengguna yang sedang
           login, termasuk orang yang menjalankan migrasinya. */
        const { twoFactorService } = await import('./two-factor.service');
        if (await twoFactorService.aktif(user.id)) {
          const kode = (credentials as { totp?: string }).totp?.trim();
          if (!kode) return null;
          if (!(await twoFactorService.verifikasi(user.id, kode))) return null;
        }
        // dilempar ke callback jwt sebagai `user`
        return { id: user.id, email: user.email, name: user.name, tenantId: user.tenantId, role: user.role } as never;
      },
    }),
  ],

  callbacks: {
    /**
     * Gerbang verifikasi untuk jalur OAuth.
     *
     * Login kredensial sudah dijaga di `authorize()` (verifyCredentials menolak
     * akun non-active). OAuth tidak lewat sana, jadi tanpa callback ini orang
     * bisa mendaftar lewat Google dan langsung masuk — gerbangnya bocor.
     *
     * Mengembalikan string = redirect; user pending diarahkan ke /auth dengan
     * pesan yang jelas, bukan kegagalan diam-diam.
     */
    async signIn({ account, profile, user }) {
      if (!account || account.provider === 'credentials') return true;
      const email = (profile?.email ?? user?.email ?? '').trim().toLowerCase();
      if (!email) return '/auth?error=oauth_no_email';
      const u = await authService.findOrCreateFromOAuth({ email, name: profile?.name ?? user?.name });
      if (u.status === 'rejected') return '/auth?error=rejected';
      if (u.status !== 'active') return '/auth?error=pending';
      return true;
    },

    async jwt({ token, user, account }) {
      // Login kredensial: authorize() sudah membawa tenantId/role.
      if (user && (user as { tenantId?: string }).tenantId) {
        const u = user as { id: string; tenantId: string; role: string };
        token.userId = u.id; token.tenantId = u.tenantId; token.role = u.role;
        return token;
      }
      // OAuth sign-in pertama: provisioning / lookup user Nalar by email,
      // lalu simpan token storage (Drive/OneDrive) utk sync worker.
      if (account && account.provider !== 'credentials' && token.email) {
        const u = await authService.findOrCreateFromOAuth({
          email: token.email, name: token.name,
        });
        token.userId = u.id; token.tenantId = u.tenantId; token.role = u.role;

        if (account.access_token) {
          const provider = account.provider === 'google' ? 'google' : 'microsoft';
          await connectionService.save({
            tenantId: u.tenantId, userId: u.id, provider,
            accountEmail: token.email, accountLabel: token.email,
            accessToken: account.access_token,
            refreshToken: account.refresh_token ?? null,
            expiresAt: account.expires_at ?? null,
            scope: account.scope ?? null,
          }).catch((err) => console.error('[auth] simpan koneksi gagal:', err));
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.userId as string;
        session.user.tenantId = token.tenantId as string;
        session.user.role = token.role as string;
      }
      return session;
    },
  },
};

/**
 * Opsi LENGKAP — dibangun per-request, dipakai handler NextAuth.
 *
 * Kredensial Google/Microsoft datang dari database (dengan env sebagai
 * cadangan), dan itu pembacaan async — mustahil dilakukan saat modul dimuat.
 * Karena itu daftar provider disusun di sini, tiap permintaan auth.
 *
 * Biayanya kecil: oauthAppService men-cache hasilnya ±30 detik, jadi
 * permintaan berturut-turut tidak memukul database.
 */
export async function buildAuthOptions(): Promise<NextAuthOptions> {
  const providers = [...authOptions.providers];

  const google = await oauthAppService.get('google');
  if (google) {
    providers.push(GoogleProvider({
      clientId: google.clientId,
      clientSecret: google.clientSecret,
      authorization: {
        params: {
          // Scope tergantung mode Drive (D10):
          //  'full'   → login sekaligus membawa drive.readonly + drive.file
          //             (perilaku lama, scan rekursif jalan dari token login)
          //  'picker' → login BERSIH (openid email profile saja); Drive
          //             diminta belakangan lewat alur connect + Google Picker
          scope: googleLoginScope(google.driveAccessMode),
          access_type: 'offline',   // refresh_token
          prompt: 'consent',
        },
      },
    }));
  }

  const ms = await oauthAppService.get('microsoft');
  if (ms) {
    providers.push(AzureADProvider({
      clientId: ms.clientId,
      clientSecret: ms.clientSecret,
      tenantId: ms.msTenantId || 'common',
      authorization: {
        params: {
          // Files.Read ⇒ OneDrive/SharePoint user; offline_access ⇒ refresh
          scope: 'openid email profile offline_access https://graph.microsoft.com/Files.Read',
        },
      },
    }));
  }

  return { ...authOptions, providers };
}
