import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole, getCurrentUser } from '@/modules/core/auth';
import { apikeyService, SCOPES, type Scope } from '@/modules/integrations/apikey.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/keys — daftar kunci tenant (tanpa nilai kuncinya, tentu). */
export async function GET() {
  const user = await getCurrentUser();
  return NextResponse.json({ keys: await apikeyService.list(user.tenantId), scopes: SCOPES });
}

const Body = z.object({
  name: z.string().min(1).max(80),
  scopes: z.array(z.enum(['read', 'write', 'chat'])).min(1),
  /** ISO date; kosong = tanpa masa berlaku */
  expiresAt: z.string().datetime().optional().nullable(),
});

/**
 * POST /api/keys — buat kunci. Membalas kunci MENTAH satu kali saja.
 *
 * Hanya admin: kunci ini memberi akses ke seluruh data tenant, jadi anggota
 * biasa tak boleh menerbitkannya.
 */
export async function POST(req: NextRequest) {
  const user = await requireRole('superadmin', 'admin');
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Input tidak valid' }, { status: 400 });
  }
  const { key, row } = await apikeyService.create(user, {
    name: parsed.data.name,
    scopes: parsed.data.scopes as Scope[],
    expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
  });
  return NextResponse.json({ key, row }, { status: 201 });
}

/** DELETE /api/keys?id=… — cabut. Barisnya tetap ada demi jejak audit. */
export async function DELETE(req: NextRequest) {
  const user = await requireRole('superadmin', 'admin');
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id wajib' }, { status: 400 });
  await apikeyService.revoke(user, id);
  return NextResponse.json({ ok: true });
}
