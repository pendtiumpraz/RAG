import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/modules/core/auth';
import { pemulihanService } from '@/modules/auth/pemulihan.service';
import { ValidationError } from '@/modules/chatbot/chatbot.service';

export const runtime = 'nodejs';

/**
 * POST /api/team/members/{id}/recover — terbitkan tautan pemulihan akun.
 *
 * Tautannya dikembalikan SEKALI di badan respons dan tidak pernah disimpan
 * maupun dikirim lewat email. Mengirimkannya lewat email akan mengembalikan
 * buntu yang justru hendak dibuka kartu ini: setiap jalur pemulihan bermuara
 * ke kotak surat yang sudah tak bisa diakses.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  const { id } = await ctx.params;
  try {
    const hasil = await pemulihanService.terbitkan(
      { id: user.id, tenantId: user.tenantId, role: user.role }, id,
    );
    return NextResponse.json(hasil, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    const status = e instanceof ValidationError ? 422 : 500;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}
