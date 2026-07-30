import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/modules/core/auth';
import { categoryService } from '@/modules/memory/category.service';
import { ValidationError } from '@/modules/chatbot/chatbot.service';

export const runtime = 'nodejs';

const Body = z.object({
  label: z.string().min(1).max(60).optional(),
  /** true = setujui usulan agen supaya kategorinya boleh dipakai. */
  approve: z.boolean().optional(),
});

/** PATCH /api/categories/:id — ganti nama dan/atau setujui usulan agen. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireRole('superadmin', 'admin');
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  try {
    let row;
    if (parsed.data.label) row = await categoryService.rename(user.tenantId, id, parsed.data.label);
    if (parsed.data.approve) row = await categoryService.approve(user.tenantId, id);
    return NextResponse.json(row ?? { ok: true });
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 422 });
    throw e;
  }
}

/** DELETE /api/categories/:id — SOFT delete; note-nya pindah ke penampung. */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireRole('superadmin', 'admin');
  const { id } = await ctx.params;
  try {
    await categoryService.remove(user.tenantId, id);
    return NextResponse.json({ ok: true, softDeleted: id });
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 422 });
    throw e;
  }
}
