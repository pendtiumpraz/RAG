import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/modules/core/auth';
import { divisionService } from '@/modules/settings/division.service';
import { ValidationError } from '@/modules/chatbot/chatbot.service';

export const runtime = 'nodejs';

const Body = z.object({
  name: z.string().min(1).max(80).optional(),
  description: z.string().max(500).nullable().optional(),
});

/** PATCH /api/divisions/:id — ubah nama/keterangan. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireRole('superadmin', 'admin');
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  try {
    return NextResponse.json(await divisionService.update(user.tenantId, id, parsed.data));
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 422 });
    throw e;
  }
}

/**
 * DELETE /api/divisions/:id — SOFT delete (Rule #3).
 *
 * Anggota & chatbotnya dilepas jadi tanpa divisi, bukan dibiarkan menunjuk
 * baris terhapus — kalau dibiarkan, chatbotnya hilang dari layar semua orang
 * kecuali admin, tanpa pernah dihapus dan tanpa satu pun penjelasan.
 */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireRole('superadmin', 'admin');
  const { id } = await ctx.params;
  try {
    await divisionService.softDelete(user.tenantId, id);
    return NextResponse.json({ ok: true, softDeleted: id });
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 404 });
    throw e;
  }
}
