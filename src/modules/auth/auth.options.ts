import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import AzureADProvider from 'next-auth/providers/azure-ad';
import { ssoService } from './sso.service';
import { emailCocokKoneksi, urlPenemuan } from './sso';
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

      /* SSO enterprise (D16) — pengguna masuk ke tenant PEMILIK KONEKSI,
         bukan tenant baru miliknya sendiri. */
      const sso = user as { ssoTenantId?: string; ssoDomain?: string } | undefined;
      if (account.provider === 'sso' && sso?.ssoTenantId && sso.ssoDomain) {
        /* Domain diperiksa ULANG di sini, sesudah IdP menjawab. IdP menjamin
           orangnya memegang akun di direktori mereka; ia TIDAK menjamin
           alamat yang dipulangkan ada di domain kita. IdP yang salah
           konfigurasi — atau sengaja dibuat begitu — bisa memulangkan alamat
           di domain lain, dan orang itu akan mendarat di tenant yang bukan
           miliknya. */
        if (!emailCocokKoneksi(email, sso.ssoDomain)) return '/auth?error=sso_domain';
        const s = await authService.findOrCreateFromSso({
          email, name: profile?.name ?? user?.name, tenantId: sso.ssoTenantId,
        });
        if (s.status === 'rejected') return '/auth?error=rejected';
        if (s.status !== 'active') return '/auth?error=pending';
        return true;
      }

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
        const sso = user as { ssoTenantId?: string } | undefined;
        /* Jalur SSO memakai findOrCreateFromSso supaya penggunanya mendarat
           di tenant pemilik koneksi. Kalau ia jatuh ke findOrCreateFromOAuth,
           tiap karyawan pelanggan akan lahir dengan tenant BARU sendiri —
           dan pelanggannya melihat lima puluh workspace kosong alih-alih satu
           workspace berisi lima puluh orang. */
        const u = account.provider === 'sso' && sso?.ssoTenantId
          ? await authService.findOrCreateFromSso({
            email: token.email, name: token.name, tenantId: sso.ssoTenantId,
          })
          : await authService.findOrCreateFromOAuth({
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
export async function buildAuthOptions(koneksiSsoId?: string | null): Promise<NextAuthOptions> {
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

  /* SSO enterprise (D16) — provider hanya dipasang bila permintaan ini
     memang membawa koneksi yang sudah dipilih lewat domain email. Memasang
     seluruh koneksi tenant di setiap permintaan akan membocorkan daftar
     pelanggan lewat halaman signin bawaan NextAuth. */
  if (koneksiSsoId) {
    const p = await providerSso(koneksiSsoId);
    if (p) providers.push(p);
  }

  return { ...authOptions, providers };
}

/**
 * Provider SSO enterprise (D16) — satu koneksi, dibangun per permintaan.
 *
 * Endpoint tidak ditulis tangan: kita hanya menyebut `wellKnown`, dan
 * NextAuth menemukan authorization/token/userinfo dari metadata IdP. Itu
 * bukan kemalasan — endpoint yang ditulis tangan akan menua diam-diam saat
 * IdP memindahkannya, dan gagalnya baru terlihat pada orang yang sedang
 * mencoba masuk.
 *
 * `profile()` MEMBAWA tenantId koneksi ke dalam objek user. Callback signIn
 * dan jwt tidak menerima request, jadi tanpa titipan ini mereka tak punya
 * cara tahu tenant mana yang dituju — dan pengguna SSO akan mendarat di
 * tenant baru miliknya sendiri alih-alih tenant perusahaannya.
 */
async function providerSso(koneksiId: string) {
  const k = await ssoService.resolveById(koneksiId);
  if (!k) return null;

  return {
    id: 'sso',
    name: 'SSO organisasi',
    type: 'oauth' as const,
    wellKnown: urlPenemuan(k.issuer),
    clientId: k.clientId,
    clientSecret: k.clientSecret,
    idToken: true,
    checks: ['pkce', 'state'] as Array<'pkce' | 'state'>,
    authorization: { params: { scope: 'openid email profile' } },
    profile(p: { sub: string; email?: string; name?: string; preferred_username?: string }) {
      const email = (p.email ?? p.preferred_username ?? '').trim().toLowerCase();
      return {
        id: p.sub,
        email,
        name: p.name ?? email.split('@')[0],
        /* Dititipkan ke callback lewat objek user — lihat catatan di atas. */
        ssoTenantId: k.tenantId,
        ssoDomain: k.domain,
      } as never;
    },
  };
}
