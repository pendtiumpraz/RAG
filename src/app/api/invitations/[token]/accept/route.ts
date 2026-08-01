import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { invitationService } from '@/modules/auth/invitation.service';
import { ValidationError } from '@/modules/chatbot/chatbot.service';
import { rateLimitBersama } from '@/modules/core/limits-bersama';

export const runtime = 'nodejs';

const Body = z.object({
  name: z.string().max(120).default(''),
  password: z.string().min(8, 'Password minimal 8 karakter').max(200),
});

/**
 * POST /api/invitations/:token/accept — terima undangan (PUBLIK).
 *
 * Membuat user di TENANT PENGUNDANG, bukan tenant baru — itu beda mendasarnya
 * dengan /api/auth/signup. Statusnya langsung `active` karena undangan sudah
 * berperan sebagai verifikasi (lihat invitation.service).
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const rl = await rateLimitBersama(`invite-accept:${ip}`, 5, 5 / 60);
  if (!rl.ok) {
    return NextResponse.json({ error: 'Terlalu banyak percobaan. Coba lagi nanti.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } });
  }

  const { token } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Input tidak valid' }, { status: 400 });
  }
  try {
    const user = await invitationService.accept(token, parsed.data);
    // Client langsung signIn('credentials') — akunnya sudah active.
    return NextResponse.json({ ok: true, email: user.email }, { status: 201 });
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 422 });
    throw e;
  }
}
