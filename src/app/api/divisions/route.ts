import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser, requireRole } from '@/modules/core/auth';
import { divisionService } from '@/modules/settings/division.service';
import { ValidationError } from '@/modules/chatbot/chatbot.service';

export const runtime = 'nodejs';

/**
 * GET /api/divisions — daftar divisi + jumlah anggota & chatbotnya.
 *
 * Boleh dibaca SEMUA anggota tenant, bukan hanya admin: form chatbot dan
 * halaman tim perlu menampilkan nama divisi, dan daftar nama divisi bukan
 * rahasia di dalam tenant sendiri. Yang dijaga divisi adalah ISI chatbotnya.
 */
export async function GET() {
  const user = await getCurrentUser();
  return NextResponse.json(await divisionService.list(user.tenantId));
}

const Body = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(500).nullable().optional(),
});

/** POST /api/divisions — tambah divisi. */
export async function POST(req: NextRequest) {
  const user = await requireRole('superadmin', 'admin');
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  try {
    return NextResponse.json(await divisionService.create(user.tenantId, parsed.data), { status: 201 });
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 422 });
    throw e;
  }
}
