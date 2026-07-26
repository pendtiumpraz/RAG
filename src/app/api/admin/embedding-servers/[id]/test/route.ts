import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/modules/core/auth';
import { embeddingServerService } from '@/modules/settings/embedding-server.service';
import { ValidationError } from '@/modules/chatbot/chatbot.service';

export const runtime = 'nodejs';

/**
 * POST /api/admin/embedding-servers/:id/test — uji koneksi + deteksi model.
 *
 * Memanggil `/v1/models` di server (ber-auth), jadi satu tombol menguji
 * jaringan DAN token sekaligus. Model yang ditemukan disimpan dan langsung
 * muncul di dropdown model embedding — tanpa deploy ulang.
 */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  await requireRole('superadmin');
  const { id } = await ctx.params;
  try {
    return NextResponse.json(await embeddingServerService.testAndDiscover(id));
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 422 });
    throw e;
  }
}
