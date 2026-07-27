import NextAuth from 'next-auth';
import { buildAuthOptions } from '@/modules/auth/auth.options';

/**
 * Handler dibuat PER-REQUEST, bukan sekali saat modul dimuat.
 *
 * Alasannya: kredensial OAuth Google/Microsoft kini disimpan di database agar
 * bisa diubah superadmin tanpa redeploy, dan membacanya async. `NextAuth(opts)`
 * hanya membuat closure — murah — sementara pembacaan kredensialnya sendiri
 * sudah di-cache ±30 detik di oauth-app.service.
 */
async function handler(req: Request, ctx: unknown) {
  const options = await buildAuthOptions();
  return (NextAuth(options) as (r: Request, c: unknown) => Promise<Response>)(req, ctx);
}

export { handler as GET, handler as POST };
