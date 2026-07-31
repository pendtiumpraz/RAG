import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser, requireRole } from '@/modules/core/auth';
import { recategorizeService } from '@/modules/memory/recategorize.service';

export const runtime = 'nodejs';
/* Memanggil model untuk sampai 200 ringkasan dalam sepuluh bundel. Jauh lebih
   ringan daripada menjalankan ulang agen Memory, tapi tetap bukan permintaan
   yang selesai dalam sekejap. */
export const maxDuration = 60;

/**
 * GET /api/memory/recategorize — berapa yang bisa dibereskan.
 *
 * Ada endpoint sendiri supaya UI bisa menyebut angkanya SEBELUM pengguna
 * menekan sesuatu yang memakai kuota model. Tombol yang tak memberi tahu
 * berapa banyak yang akan dikerjakan adalah tombol yang ditekan dengan
 * ragu-ragu, atau tak ditekan sama sekali.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  const kb = req.nextUrl.searchParams.get('knowledgeBaseId') ?? undefined;
  return NextResponse.json(await recategorizeService.hitungKandidat(user.tenantId, kb));
}

const Body = z.object({
  knowledgeBaseId: z.string().uuid().optional(),
  /**
   * Ulangi sampai habis, bukan satu bundel 200 lalu berhenti.
   *
   * Batas 200 per panggilan itu nyata (satu permintaan HTTP punya tenggat),
   * tapi membebankan pengulangannya kepada pengguna berarti membocorkan
   * batas teknis ke antarmuka: orang yang melihat "1.400 belum
   * dikategorikan" tak ingin menekan tombol tujuh kali sambil menghitung.
   */
  semua: z.boolean().optional(),
});

/**
 * POST /api/memory/recategorize — nilai ulang kategori dari ringkasan.
 *
 * Butuh peran admin: ia memakai kuota model dan mengubah kategori banyak
 * dokumen sekaligus. Hanya menyentuh yang kategorinya "belum" — yang sudah
 * punya kategori tak pernah dipindahkan, apa pun asalnya.
 */
export async function POST(req: NextRequest) {
  const user = await requireRole('superadmin', 'admin');
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });

  const { semua, ...opts } = parsed.data;
  try {
    return NextResponse.json(
      semua
        ? await recategorizeService.semuanya(user.tenantId, opts)
        : await recategorizeService.dariRingkasan(user.tenantId, opts),
    );
  } catch (e) {
    /* Kunci API yang belum diisi adalah sebab paling lazim, dan itu keadaan
       yang bisa dibereskan pengguna sendiri — jadi disebut apa adanya, bukan
       dilipat jadi 500 yang menyuruh orang menebak. */
    const pesan = (e as Error).message;
    if (/API key/i.test(pesan)) return NextResponse.json({ error: pesan }, { status: 400 });
    throw e;
  }
}
