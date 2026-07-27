import { NextResponse } from 'next/server';
import { llmServerService } from '@/modules/chat/llm-server.service';
import { superadminRoute } from '../../../_guard';

export const runtime = 'nodejs';

/**
 * Uji koneksi + baca `/v1/models`. Satu tombol menguji jaringan DAN token,
 * lalu model yang ditemukan langsung bisa dipilih tenant — tanpa deploy ulang.
 */
export const POST = superadminRoute<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  const { id } = await ctx.params;
  return NextResponse.json(await llmServerService.testAndDiscover(id));
});
