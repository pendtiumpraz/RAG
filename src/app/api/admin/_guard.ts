import { NextRequest, NextResponse } from 'next/server';
import { requireRole, UnauthorizedError, type CurrentUser } from '@/modules/core/auth';
import { ValidationError } from '@/modules/chatbot/chatbot.service';

/**
 * Pembungkus rute admin platform.
 *
 * Dua alasan ia ada:
 *  1. `requireRole()` MELEMPAR. Tanpa ditangkap, permintaan tanpa sesi jadi
 *     **500** — menyamarkan kegagalan auth sebagai galat server, dan bikin
 *     log sulit dibaca. Middleware memang sudah menyaring di depan, tapi ini
 *     lapis kedua kalau matcher-nya kelak terlewat lagi.
 *  2. Menyeragamkan pemetaan galat → status, supaya tiap rute tak mengulang
 *     try/catch yang sama.
 */
export function superadminRoute<C>(
  handler: (req: NextRequest, ctx: C, user: CurrentUser) => Promise<NextResponse>,
) {
  return async (req: NextRequest, ctx: C): Promise<NextResponse> => {
    let user: CurrentUser;
    try {
      user = await requireRole('superadmin');
    } catch (e) {
      if (e instanceof UnauthorizedError) {
        return NextResponse.json({ error: e.message }, { status: 401 });
      }
      throw e;
    }
    try {
      return await handler(req, ctx, user);
    } catch (e) {
      if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 422 });
      // assertSecureEndpoint & sejenisnya melempar Error biasa dgn pesan yang
      // memang untuk dibaca pengguna.
      if (e instanceof Error && e.message) return NextResponse.json({ error: e.message }, { status: 422 });
      throw e;
    }
  };
}
