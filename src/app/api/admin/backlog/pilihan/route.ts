import { NextResponse } from 'next/server';
import { z } from 'zod';
import { superadminRoute } from '../../_guard';
import { backlogService } from '@/modules/core/backlog.service';
import { ValidationError } from '@/modules/chatbot/chatbot.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  id: z.string().uuid(),
  /** Nomor opsi di dalam kartu, dihitung dari 0. */
  indeks: z.number().int().min(0).max(50),
  pilih: z.boolean(),
});

/**
 * POST /api/admin/backlog/pilihan — centang / lepas satu pilihan pada kartu.
 *
 * RUTE SENDIRI, bukan menumpang PATCH kartu. PATCH mengatur antrean kolom,
 * PUT menilai prioritas — dan mencampur "keputusan produk" ke salah satunya
 * berarti satu seretan kartu yang salah bisa diam-diam menulis ulang jawaban
 * yang sudah dipikirkan lama. Keputusan pantas punya pintunya sendiri, dan
 * jejak auditnya sendiri.
 *
 * Membalikkan `why` yang baru supaya UI menampilkan keadaan SEBENARNYA dari
 * basis data, bukan tebakannya sendiri. Bedanya terasa pada opsi tunggal:
 * mencentang satu melepas saudaranya, dan UI yang menebak sendiri akan
 * menampilkan dua centang sampai halaman dimuat ulang.
 */
export const POST = superadminRoute(async (req, _ctx, actor) => {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Input tidak valid' }, { status: 400 });
  }
  try {
    const why = await backlogService.setPilihan(
      actor, parsed.data.id, parsed.data.indeks, parsed.data.pilih);
    return NextResponse.json({ why });
  } catch (e) {
    /* RangeError = indeks tak ada, artinya UI dan basis data melihat kartu
       yang berbeda (kartu berubah sejak halaman dimuat). 409, bukan 400:
       kirimannya sah, keadaannya yang sudah bergeser — dan pesan yang benar
       membuat orang memuat ulang, bukan mengira dirinya salah klik. */
    if (e instanceof RangeError) {
      return NextResponse.json({ error: `${e.message}. Muat ulang papannya.` }, { status: 409 });
    }
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 404 });
    throw e;
  }
});
