import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import AzureADProvider from 'next-auth/providers/azure-ad';
import { authService } from './auth.service';
import { connectionService } from '@/modules/connections/connection.service';

/**
 * NextAuth (Auth.js v4) — JWT session membawa { userId, tenantId, role }
 * sehingga setiap request tahu tenant-nya tanpa query tambahan.
 *
 * Provider:
 *  • Credentials — email+password (scrypt, cek via authService).
 *  • Google & Microsoft — OAuth; email baru = provisioning tenant baru
 *    otomatis (signup implisit) di callback jwt.
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
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const user = await authService.verifyCredentials(credentials.email, credentials.password);
        if (!user) return null;
        // dilempar ke callback jwt sebagai `user`
        return { id: user.id, email: user.email, name: user.name, tenantId: user.tenantId, role: user.role } as never;
      },
    }),
    ...(process.env.GOOGLE_CLIENT_ID ? [GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          // drive.readonly ⇒ baca Drive user; drive.file ⇒ tulis vault
          // `_nalar-memory/` (hanya file buatan app ini — bukan seluruh Drive)
          scope: 'openid email profile https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file',
          access_type: 'offline',   // refresh_token
          prompt: 'consent',
        },
      },
    })] : []),
    ...(process.env.MS_CLIENT_ID ? [AzureADProvider({
      clientId: process.env.MS_CLIENT_ID,
      clientSecret: process.env.MS_CLIENT_SECRET!,
      tenantId: process.env.MS_TENANT_ID || 'common',
      authorization: {
        params: {
          // Files.Read ⇒ OneDrive/SharePoint user; offline_access ⇒ refresh
          scope: 'openid email profile offline_access https://graph.microsoft.com/Files.Read',
        },
      },
    })] : []),
  ],

  callbacks: {
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
