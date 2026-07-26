import { NextResponse } from 'next/server';
import { embeddingServerService } from '@/modules/settings/embedding-server.service';
import { superadminRoute } from '../../../_guard';

export const runtime = 'nodejs';

/**
 * POST /api/admin/embedding-servers/:id/test — uji koneksi + deteksi model.
 *
 * Memanggil `/v1/models` di server (ber-auth), jadi satu tombol menguji
 * jaringan DAN token sekaligus. Model yang ditemukan disimpan dan langsung
 * muncul di dropdown model embedding — tanpa deploy ulang.
 */
export const POST = superadminRoute<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  const { id } = await ctx.params;
  return NextResponse.json(await embeddingServerService.testAndDiscover(id));
});
