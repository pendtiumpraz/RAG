import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/modules/core/auth';
import { connectionService } from '@/modules/connections/connection.service';

export const runtime = 'nodejs';

/** GET /api/connections — daftar akun storage terhubung (multi-akun, tanpa token). */
export async function GET() {
  const user = await getCurrentUser();
  return NextResponse.json(await connectionService.list(user.tenantId, user.id));
}

/** DELETE /api/connections?id=… — putuskan satu koneksi akun. */
export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id wajib' }, { status: 400 });
  await connectionService.disconnect(user.tenantId, user.id, id);
  return NextResponse.json({ ok: true });
}
