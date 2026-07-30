import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser, requireRole } from '@/modules/core/auth';
import { categoryService } from '@/modules/memory/category.service';
import { ValidationError } from '@/modules/chatbot/chatbot.service';

export const runtime = 'nodejs';

/** GET /api/categories — master data kategori dokumen + jumlah pemakainya. */
export async function GET() {
  const user = await getCurrentUser();
  return NextResponse.json(await categoryService.list(user.tenantId));
}

const Body = z.object({ label: z.string().min(1).max(60) });

/** POST /api/categories — tambah kategori (langsung aktif). */
export async function POST(req: NextRequest) {
  const user = await requireRole('superadmin', 'admin');
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  try {
    const row = await categoryService.create(user.tenantId, { label: parsed.data.label });
    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 422 });
    throw e;
  }
}
