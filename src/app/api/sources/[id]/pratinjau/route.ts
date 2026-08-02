import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq, isNull } from 'drizzle-orm';
import { requireRole } from '@/modules/core/auth';
import { dataSources } from '@/modules/core/db';
import { withTenant } from '@/modules/core/db/tenant-context';
import { pratinjauSumber } from '@/modules/knowledge/sync.service';

export const runtime = 'nodejs';
/** Pendaftaran berkas saja — tanpa unduh, tanpa embed. Jauh lebih ringan dari sync. */
export const maxDuration = 60;

/**
 * GET /api/sources/:id/pratinjau — apa yang AKAN diserap, sebelum diunduh.
 *
 * Menjawab satu pertanyaan yang hari ini hanya bisa dijawab dengan menjalankan
 * sync penuh lalu melihat akibatnya: folder mana yang akan menghabiskan kuota.
 * Pada korpus ratusan GB, "coba dulu lalu lihat" berarti biayanya sudah
 * dibayar penuh — bandwidth, waktu, dan pada jalur embedding API juga uang.
 *
 * Seluruhnya dari METADATA. Pendaftaran berkas sudah memberi nama, ukuran, dan
 * versi tanpa mengunduh apa pun, jadi rute ini tak menambah satu pun
 * permintaan jaringan di luar yang memang dilakukan sync di langkah pertamanya.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireRole('superadmin', 'admin');
  const { id } = await ctx.params;
  try {
    return NextResponse.json(await pratinjauSumber(user.tenantId, user.id, id));
  } catch (e) {
    /* Kegagalan pendaftaran (token kedaluwarsa, folder dihapus) dijawab 422,
       bukan 500: ini keadaan yang PEMILIKNYA bisa perbaiki, dan 500 mengirim
       orang mencari kerusakan di tempat yang salah. */
    return NextResponse.json({ error: (e as Error).message }, { status: 422 });
  }
}

const Body = z.object({
  /** Folder yang boleh diserap. KOSONG = semua — lihat saringFolderTerpilih(). */
  folderTerpilih: z.array(z.string()).max(500),
});

/**
 * PUT /api/sources/:id/pratinjau — simpan folder yang dicentang.
 *
 * Disimpan di `config` sumbernya, bukan di tabel sendiri: ia bagian dari
 * definisi sumber itu ("dari mana berkasnya diambil"), sama derajatnya dengan
 * folderId atau prefix. Tabel terpisah akan menambah satu keadaan yang bisa
 * menyimpang dari sumbernya tanpa ada yang menyadarinya.
 */
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireRole('superadmin', 'admin');
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });

  /* Dinormalkan di sini, bukan di pembaca: jalur yang disimpan dengan garis
     miring di ujung akan gagal cocok dengan jalur yang dihitung dari berkas,
     dan penyaringnya lalu membuang SEMUANYA — tanpa galat. */
  const folderTerpilih = [...new Set(parsed.data.folderTerpilih
    .map((s) => s.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, ''))
    .filter(Boolean))];

  const baris = await withTenant(user.tenantId, async (tx) => {
    const s = (await tx.select().from(dataSources)
      .where(and(eq(dataSources.id, id), isNull(dataSources.deletedAt))).limit(1))[0];
    if (!s) return null;
    await tx.update(dataSources)
      .set({ config: { ...(s.config as object), folderTerpilih }, updatedAt: new Date() })
      .where(eq(dataSources.id, id));
    return s;
  });
  if (!baris) return NextResponse.json({ error: 'Sumber tidak ditemukan' }, { status: 404 });

  return NextResponse.json({ ok: true, folderTerpilih });
}
