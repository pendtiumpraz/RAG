import { NextResponse } from 'next/server';
import { z } from 'zod';
import { embeddingServerService } from '@/modules/settings/embedding-server.service';
import { superadminRoute } from '../_guard';

export const runtime = 'nodejs';

/**
 * Server embedding sendiri (VPS) — infrastruktur PLATFORM.
 *
 * SEMUA rute di bawah `admin/embedding-servers` dibungkus superadminRoute.
 * Tabelnya tak dilindungi RLS (lihat schema), dan menerima URL sembarang dari
 * pihak tak tepercaya akan membuka SSRF — server kita dipaksa menembak alamat
 * internal. Jadi guard peran di sini BUKAN formalitas.
 */

/** GET /api/admin/embedding-servers — daftar server (tanpa token). */
export const GET = superadminRoute(async () =>
  NextResponse.json(await embeddingServerService.list()));

const Body = z.object({
  name: z.string().min(1),
  baseUrl: z.string().min(1),
  token: z.string().min(1),
});

/** POST /api/admin/embedding-servers — daftarkan server baru. */
export const POST = superadminRoute(async (req) => {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  return NextResponse.json(await embeddingServerService.create(parsed.data), { status: 201 });
});
