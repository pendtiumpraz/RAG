import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authService } from '@/modules/auth/auth.service';
import { ValidationError } from '@/modules/chatbot/chatbot.service';

export const runtime = 'nodejs';

const Body = z.object({
  orgName: z.string().min(1, 'Nama organisasi wajib').max(120),
  name: z.string().min(1, 'Nama wajib').max(120),
  email: z.string().email('Email tidak valid'),
  password: z.string().min(8, 'Password minimal 8 karakter').max(200),
});

/**
 * POST /api/auth/signup — buat workspace baru.
 * 1 signup = 1 tenant terisolasi (RLS) + user admin + settings default.
 * Setelah sukses, client melakukan signIn('credentials', …) NextAuth.
 */
export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Input tidak valid' }, { status: 400 });
  }
  try {
    const user = await authService.signup(parsed.data);
    return NextResponse.json({ ok: true, tenantId: user.tenantId, userId: user.id }, { status: 201 });
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 422 });
    throw e;
  }
}
