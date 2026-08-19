import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/modules/core/auth';
import { invitationService } from '@/modules/auth/invitation.service';
import { ValidationError } from '@/modules/chatbot/chatbot.service';
import { QuotaError } from '@/modules/usage/usage.service';

export const runtime = 'nodejs';

/** GET /api/team/invitations — undangan tenant ini. */
export async function GET() {
  const user = await requireRole('superadmin', 'admin');
  return NextResponse.json(await invitationService.listInvitations(user.tenantId));
}

const Body = z.object({
  email: z.string().email(),
  role: z.enum(['admin', 'member']).default('member'),
});

/**
 * POST /api/team/invitations — undang anggota.
 *
 * Balasan memuat `token` dan `inviteUrl` SEKALI SAJA: setelah ini hanya
 * hash-nya yang tersimpan, jadi tautannya tak bisa ditampilkan ulang.
 */
export async function POST(req: NextRequest) {
  const user = await requireRole('superadmin', 'admin');
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Input tidak valid' }, { status: 400 });
  }
  try {
    const { invitation, token } = await invitationService.create(user.tenantId, user.id, parsed.data);
    const base = process.env.NEXTAUTH_URL ?? req.nextUrl.origin;
    return NextResponse.json({
      invitation, token, inviteUrl: `${base}/invite/${token}`,
    }, { status: 201 });
  } catch (e) {
    // 402 memisahkan "kursi habis" (naikkan plan) dari "permintaan salah" (422).
    if (e instanceof QuotaError) return NextResponse.json({ error: e.message, quota: { used: e.used, limit: e.limit } }, { status: 402 });
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 422 });
    throw e;
  }
}
