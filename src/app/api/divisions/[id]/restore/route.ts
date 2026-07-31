import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/modules/core/auth';
import { divisionService } from '@/modules/settings/division.service';
import { ValidationError } from '@/modules/chatbot/chatbot.service';

export const runtime = 'nodejs';

/**
 * PATCH /api/divisions/:id/restore — pulihkan dari Sampah (Rule #3).
 *
 * Divisinya saja yang kembali; keanggotaan TIDAK. Orang & chatbot yang dulu
 * di dalamnya bisa saja sudah dipindahkan sesudahnya, dan mengembalikan
 * keadaan lama berarti mencabut penempatan yang dibuat belakangan.
 */
export async function PATCH(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireRole('superadmin', 'admin');
  const { id } = await ctx.params;
  try {
    return NextResponse.json(await divisionService.restore(user.tenantId, id));
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 404 });
    throw e;
  }
}
