import { NextRequest, NextResponse } from 'next/server';
import { invitationService } from '@/modules/auth/invitation.service';
import { rateLimit } from '@/modules/core/limits';

export const runtime = 'nodejs';

/**
 * GET /api/invitations/:token — pratinjau undangan (PUBLIK).
 *
 * Dipanggil halaman penerimaan sebelum ada sesi. Hanya membalas data yang
 * memang perlu ditampilkan (nama organisasi, email tujuan, peran); token
 * yang tidak berlaku dijawab 404 tanpa membedakan sebab (kedaluwarsa,
 * dicabut, atau memang tak pernah ada).
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const rl = rateLimit(`invite-peek:${ip}`, 20, 20 / 60);
  if (!rl.ok) {
    return NextResponse.json({ error: 'Terlalu banyak percobaan' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } });
  }

  const { token } = await ctx.params;
  const inv = await invitationService.peek(token);
  if (!inv) return NextResponse.json({ error: 'Undangan tidak berlaku' }, { status: 404 });
  return NextResponse.json(inv);
}
