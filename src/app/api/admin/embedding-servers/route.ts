import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/modules/core/auth';
import { embeddingServerService } from '@/modules/settings/embedding-server.service';
import { ValidationError } from '@/modules/chatbot/chatbot.service';

export const runtime = 'nodejs';

/**
 * Server embedding sendiri (VPS) — infrastruktur PLATFORM.
 *
 * SEMUA rute di bawah `admin/embedding-servers` dijaga `requireRole('superadmin')`.
 * Tabelnya tak dilindungi RLS (lihat schema), dan menerima URL sembarang dari
 * pihak tak tepercaya akan membuka SSRF — server kita dipaksa menembak alamat
 * internal. Jadi guard peran di sini BUKAN formalitas.
 */

/** GET /api/admin/embedding-servers — daftar server (tanpa token). */
export async function GET() {
  await requireRole('superadmin');
  return NextResponse.json(await embeddingServerService.list());
}

const Body = z.object({
  name: z.string().min(1),
  baseUrl: z.string().min(1),
  token: z.string().min(1),
});

/** POST /api/admin/embedding-servers — daftarkan server baru. */
export async function POST(req: NextRequest) {
  await requireRole('superadmin');
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  try {
    return NextResponse.json(await embeddingServerService.create(parsed.data), { status: 201 });
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 422 });
    // assertSecureEndpoint melempar Error biasa dgn pesan yang menjelaskan.
    return NextResponse.json({ error: (e as Error).message }, { status: 422 });
  }
}
