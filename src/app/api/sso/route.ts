import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser, requireRole } from '@/modules/core/auth';
import { ssoService } from '@/modules/auth/sso.service';
import { PRESET_SSO } from '@/modules/auth/sso';
import { ValidationError } from '@/modules/chatbot/chatbot.service';

export const runtime = 'nodejs';

/** GET /api/sso — koneksi SSO tenant + preset penyedia yang didukung. */
export async function GET() {
  const user = await getCurrentUser();
  return NextResponse.json({
    connections: await ssoService.list(user.tenantId),
    presets: PRESET_SSO,
    /* URL callback yang harus didaftarkan pelanggan di IdP mereka. Ditulis
       server, bukan disusun peramban: satu huruf beda membuat IdP menolak
       dengan galat yang tak menyebut sebabnya, dan itu jam-jam yang hilang. */
    callbackUrl: `${process.env.NEXTAUTH_URL ?? ''}/api/auth/callback/sso`,
  });
}

const Body = z.object({
  kind: z.enum(['entra', 'google', 'okta', 'oidc']),
  isian: z.string().min(1).max(400),
  clientId: z.string().min(1).max(400),
  clientSecret: z.string().min(1).max(1000),
  domain: z.string().min(3).max(253),
});

/** POST /api/sso — daftarkan identity provider milik organisasi ini. */
export async function POST(req: NextRequest) {
  const user = await requireRole('superadmin', 'admin');
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  try {
    return NextResponse.json(await ssoService.simpan(user.tenantId, user.id, parsed.data), { status: 201 });
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 422 });
    throw e;
  }
}

/** DELETE /api/sso?id=… — cabut koneksi (soft delete, Rule #3). */
export async function DELETE(req: NextRequest) {
  const user = await requireRole('superadmin', 'admin');
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id wajib' }, { status: 400 });
  try {
    await ssoService.hapus(user.tenantId, user.id, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 404 });
    throw e;
  }
}
