import { NextResponse } from 'next/server';
import { z } from 'zod';
import { superadminRoute } from '../../_guard';
import { backlogService } from '@/modules/core/backlog.service';
import { ValidationError } from '@/modules/chatbot/chatbot.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  id: z.string().uuid(),
  teks: z.string().min(1).max(4000),
});

/**
 * POST /api/admin/backlog/catatan — tempelkan catatan bebas ke kartu.
 *
 * Mencentang saja tidak selalu cukup. Sebagian keputusan punya parameter —
 * angka batas, nama penyedia, alasan memilih yang tak biasa — dan memaksanya
 * masuk ke daftar opsi berarti menebak bentuk jawaban yang belum tentu
 * terpikirkan. Kotak kosong lebih jujur daripada opsi yang salah tebak.
 *
 * Catatan DITAMBAHKAN di bawah, tak pernah menimpa: riwayat pertimbanganlah
 * yang menjelaskan kenapa sebuah kartu berbelok, dan catatan yang saling
 * menimpa menghapus justru bagian itu.
 */
export const POST = superadminRoute(async (req, _ctx, actor) => {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Catatan tidak valid' }, { status: 400 });
  }
  try {
    const why = await backlogService.tambahCatatan(actor, parsed.data.id, parsed.data.teks);
    return NextResponse.json({ why });
  } catch (e) {
    if (e instanceof RangeError) return NextResponse.json({ error: e.message }, { status: 400 });
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 404 });
    throw e;
  }
});
