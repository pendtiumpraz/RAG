import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/modules/core/auth';
import { apiKeyResolver } from '@/modules/settings/credentials.repository';
import { testProviderKey } from '@/modules/settings/key-test.service';
import { ALL_PROVIDERS, type Provider } from '@/modules/core/registry';
import { rateLimit } from '@/modules/core/limits';

export const runtime = 'nodejs';

const Body = z.object({ provider: z.string().min(1) });

/**
 * POST /api/settings/test-key — uji kunci yang TERSIMPAN ke penyedia.
 *
 * Memakai kunci dari database (bukan dari badan permintaan), jadi yang diuji
 * benar-benar yang akan dipakai saat menjawab — bukan nilai yang baru diketik
 * dan mungkin berbeda.
 *
 * Dibatasi lajunya: tiap panggilan menembak API pihak ketiga.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();

  const rl = rateLimit(`test-key:${user.tenantId}`, 10, 10 / 60);
  if (!rl.ok) {
    return NextResponse.json({ ok: false, message: 'Terlalu sering menguji. Coba lagi sebentar lagi.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } });
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ ok: false, message: 'provider wajib' }, { status: 400 });

  const provider = parsed.data.provider as Provider;
  if (!ALL_PROVIDERS.includes(provider)) {
    return NextResponse.json({ ok: false, message: `Provider tak dikenal: ${provider}` }, { status: 400 });
  }

  const key = await apiKeyResolver(user.tenantId)(provider);
  if (!key) {
    return NextResponse.json({ ok: false, message: 'Belum ada kunci tersimpan untuk provider ini.' });
  }

  return NextResponse.json(await testProviderKey(provider, key));
}
