import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authService } from '@/modules/auth/auth.service';
import { ValidationError } from '@/modules/chatbot/chatbot.service';
import { rateLimitBersama } from '@/modules/core/limits-bersama';

export const runtime = 'nodejs';

const Body = z.object({
  orgName: z.string().min(1, 'Nama organisasi wajib').max(120),
  name: z.string().min(1, 'Nama wajib').max(120),
  email: z.string().email('Email tidak valid'),
  password: z.string().min(8, 'Password minimal 8 karakter').max(200),
  /** Paket & interval terpilih dari halaman pricing — hanya untuk audit;
   *  pembayaran dilakukan setelah login lewat /api/payments. */
  plan: z.enum(['pro', 'enterprise']).optional(),
  interval: z.enum(['monthly', 'yearly']).optional(),
});

/**
 * POST /api/auth/signup — buat workspace baru.
 * 1 signup = 1 tenant terisolasi (RLS) + user admin + settings default.
 *
 * Akun dibuat berstatus `active` langsung (alur pricing→register→bayar):
 * pendaftar bisa auto-login lalu diarahkan membayar plan seketika. Superadmin
 * tetap bisa men-suspend akun lewat route admin. (Bila SMTP diaktifkan,
 * gerbang verifikasi email D13 masih berlaku terpisah dari status ini.)
 */
export async function POST(req: NextRequest) {
  // Anti-abuse: maks ~5 signup/menit per IP.
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const rl = await rateLimitBersama(`signup:${ip}`, 5, 5 / 60);
  if (!rl.ok) {
    return NextResponse.json({ error: 'Terlalu banyak percobaan. Coba lagi nanti.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } });
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Input tidak valid' }, { status: 400 });
  }
  try {
    const { plan, interval, ...creds } = parsed.data;
    const user = await authService.signup({ ...creds, plan, interval });
    return NextResponse.json({
      ok: true, tenantId: user.tenantId, userId: user.id, status: user.status,
    }, { status: 201 });
  } catch (e) {
    if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 422 });
    throw e;
  }
}
