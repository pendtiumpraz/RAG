import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/modules/core/auth';
import { userApprovalService } from '@/modules/auth/user-approval.service';
import { ValidationError } from '@/modules/chatbot/chatbot.service';

export const runtime = 'nodejs';

const Body = z.object({ status: z.enum(['active', 'rejected', 'pending']) });

/**
 * PATCH /api/admin/users/:id/status — verifikasi / tolak / kembalikan ke antrean.
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const actor = await requireRole('superadmin');
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'status tidak valid' }, { status: 400 });

  // Jaga agar superadmin terakhir tak mengunci dirinya sendiri: kalau itu
  // terjadi, tak ada lagi yang bisa memverifikasi siapa pun dan platform
  // hanya bisa dipulihkan lewat akses database langsung.
  if (id === actor.id && parsed.data.status !== 'active') {
    const others = await userApprovalService.countOtherActiveSuperadmins(actor.id);
    if (others === 0) {
      return NextResponse.json({
        error: 'Kamu superadmin aktif terakhir — menonaktifkan akun ini akan '
          + 'mengunci platform. Angkat superadmin lain lebih dulu.',
      }, { status: 422 });
    }
  }

  try {
    return NextResponse.json(await userApprovalService.setStatus(actor, id, parsed.data.status));
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 404 });
    throw e;
  }
}
