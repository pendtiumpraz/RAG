import { NextResponse } from 'next/server';
import { uploadedFileService } from '@/modules/knowledge/uploaded-file.service';
import { storageService } from '@/modules/storage';
import { apiRoute } from '../../../_guard';
import { tenantOwner } from '../../../_actor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/v1/uploaded-files/{id}/download — ambil BERKAS ASLI apa adanya.
 *
 * ── KENAPA LEWAT SERVER, BUKAN TAUTAN LANGSUNG KE BLOB ──────────────────────
 *
 * Cara termudah adalah mengembalikan `url` blob-nya dan membiarkan peramban
 * mengunduh sendiri. Itu ditolak dengan sengaja: url blob platform bisa dibuka
 * siapa saja yang memegangnya, tanpa pernah melewati pemeriksaan tenant. Sekali
 * url itu keluar — ke log, ke riwayat peramban, ke tangkapan layar di grup —
 * berkas satu pelanggan bisa dibaca orang lain selamanya, dan tak ada cara
 * menariknya kembali.
 *
 * Jadi byte-nya dialirkan lewat sini, setelah kepemilikannya diperiksa. Lebih
 * mahal satu lompatan, dan itu harga yang pantas.
 *
 * Untuk BYOB (penyimpanan milik pelanggan sendiri), pengambilannya butuh
 * kredensial terenkripsi yang hanya boleh dibuka atas nama seorang pengguna —
 * karena itu `tenantOwner` dipakai sebagai aktornya, sama seperti jalur unggah.
 */
export const GET = apiRoute<{ params: Promise<{ id: string }> }>(
  'read',
  async (_req, ctx, caller) => {
    const { id } = await ctx.params;

    const row = await uploadedFileService.satu(caller.tenantId, id);
    // 404 juga untuk berkas milik tenant lain — lihat catatan di service.
    if (!row) return NextResponse.json({ error: 'Berkas tidak ditemukan' }, { status: 404 });

    const owner = await tenantOwner(caller.tenantId);
    if (!owner) {
      return NextResponse.json({ error: 'Tenant tak punya admin aktif.' }, { status: 409 });
    }

    let isi: { content: Buffer; mime?: string | null };
    try {
      isi = await storageService.ambilBerkasUpload(
        caller.tenantId,
        owner.id,
        String(row.provider),
        (row.storage_connection_id as string | null) ?? null,
        String(row.path),
      );
    } catch (e) {
      // Sebabnya disebut apa adanya: "penyedia dinonaktifkan", "koneksi sudah
      // dihapus", dan "berkas hilang di storage" menuntut tindakan berbeda, dan
      // 502 polos memaksa pemiliknya menebak yang mana.
      return NextResponse.json(
        { error: `Gagal mengambil berkas: ${(e as Error).message}` },
        { status: 502 },
      );
    }

    const nama = String(row.filename ?? 'berkas');
    return new NextResponse(new Uint8Array(isi.content), {
      status: 200,
      headers: {
        'Content-Type': isi.mime || (row.mime as string | null) || 'application/octet-stream',
        'Content-Length': String(isi.content.length),
        // `attachment` + nama asli: tanpa ini peramban menampilkan PDF di tab
        // dan menyimpannya dengan nama id acak. Nama disandikan RFC 5987 supaya
        // judul berbahasa Indonesia dengan spasi tetap utuh.
        'Content-Disposition':
          `attachment; filename="${nama.replace(/["\\]/g, '_')}"; ` +
          `filename*=UTF-8''${encodeURIComponent(nama)}`,
        // Berkas milik satu tenant tak boleh menempel di cache bersama.
        'Cache-Control': 'private, no-store',
      },
    });
  });
