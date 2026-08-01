import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/modules/core/auth';
import { konektorService } from '@/modules/knowledge/konektor.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/connectors — konektor yang BOLEH dipakai tenant ini.
 *
 * Dipakai halaman Knowledge menyusun pilihan "Jenis sumber". Yang dimatikan
 * tak ikut sama sekali — bukan ditandai nonaktif, melainkan tak ada: pilihan
 * yang terlihat tapi tak bisa dipilih membuat orang mengira produknya rusak,
 * dan pilihan yang bisa dipilih lalu ditolak lebih buruk lagi.
 *
 * Keterangan internal (butuhAplikasiKita, alasan belum tersedia) TIDAK ikut —
 * itu bahan keputusan platform, bukan informasi yang berguna bagi pemilik
 * knowledge base.
 */
export async function GET() {
  await getCurrentUser();
  const daftar = await konektorService.daftar();
  return NextResponse.json({
    konektor: daftar.filter((k) => k.nyala).map((k) => ({ jenis: k.jenis, label: k.label })),
  });
}
