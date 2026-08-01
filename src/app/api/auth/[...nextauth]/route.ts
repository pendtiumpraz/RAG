import NextAuth from 'next-auth';
import { buildAuthOptions } from '@/modules/auth/auth.options';
import { NAMA_KUKI_SSO } from '@/modules/auth/sso';

/**
 * Handler dibuat PER-REQUEST, bukan sekali saat modul dimuat.
 *
 * Alasannya: kredensial OAuth Google/Microsoft kini disimpan di database agar
 * bisa diubah superadmin tanpa redeploy, dan membacanya async. `NextAuth(opts)`
 * hanya membuat closure — murah — sementara pembacaan kredensialnya sendiri
 * sudah di-cache ±30 detik di oauth-app.service.
 */
async function handler(req: Request, ctx: unknown) {
  /* Koneksi SSO yang dipilih lewat domain email disimpan di kuki oleh
     /api/auth/sso/lookup. Dibaca di sini karena panggilan balik OAuth kembali
     tanpa parameter kueri kita — tanpa kuki, langkah tukar-kode tak tahu
     kredensial siapa yang harus dipakai. */
  const koneksiSso = req.headers.get('cookie')
    ?.split(';').map((c) => c.trim())
    .find((c) => c.startsWith(`${NAMA_KUKI_SSO}=`))?.slice(NAMA_KUKI_SSO.length + 1) ?? null;
  const options = await buildAuthOptions(koneksiSso);
  return (NextAuth(options) as (r: Request, c: unknown) => Promise<Response>)(req, ctx);
}

export { handler as GET, handler as POST };
