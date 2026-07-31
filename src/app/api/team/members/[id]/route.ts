import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/modules/core/auth';
import { invitationService } from '@/modules/auth/invitation.service';
import { divisionService } from '@/modules/settings/division.service';
import { ValidationError } from '@/modules/chatbot/chatbot.service';

export const runtime = 'nodejs';

/* Keduanya opsional agar satu permintaan boleh mengubah peran saja, divisi
   saja, atau dua-duanya. `divisionId: null` berarti MELEPAS dari divisi —
   arti yang berbeda dari "tidak dikirim", dan bedanya harus terjaga sampai
   ke service; kalau tidak, melepas orang dari divisi jadi mustahil. */
const Body = z.object({
  role: z.enum(['admin', 'member']).optional(),
  divisionId: z.string().uuid().nullable().optional(),
});

/** PATCH /api/team/members/:id — ubah peran dan/atau divisi anggota. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireRole('superadmin', 'admin');
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'role: admin | member; divisionId: uuid | null' }, { status: 400 });
  if (parsed.data.role === undefined && !('divisionId' in parsed.data)) {
    return NextResponse.json({ error: 'tak ada yang diubah' }, { status: 400 });
  }
  try {
    if ('divisionId' in parsed.data) {
      await divisionService.tempatkan(user.tenantId, id, parsed.data.divisionId ?? null);
    }
    if (parsed.data.role === undefined) {
      return NextResponse.json({ id, divisionId: parsed.data.divisionId ?? null });
    }
    return NextResponse.json(await invitationService.setMemberRole(user.tenantId, user.id, id, parsed.data.role));
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 422 });
    throw e;
  }
}

/** DELETE /api/team/members/:id — keluarkan anggota (soft delete). */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireRole('superadmin', 'admin');
  const { id } = await ctx.params;
  try {
    return NextResponse.json(await invitationService.removeMember(user.tenantId, user.id, id));
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 422 });
    throw e;
  }
}
