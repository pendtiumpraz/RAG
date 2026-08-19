import { NextResponse } from 'next/server';
import { z } from 'zod';
import { superadminRoute } from '../_guard';
import { platformSettingsService } from '@/modules/payments/platform-settings.service';
import { normalizeS2sDomain } from '@/app/api/v1/_master';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Whitelist domain PROVISIONING S2S — SUPERADMIN, disimpan di DATABASE
 * (platform_settings, migrasi 0053) supaya bisa diubah runtime tanpa deploy.
 *
 * Token master (NALAR_MASTER_KEY) tetap kontrol utama; daftar ini hanya
 * menyaring request yang datang DARI PERAMBAN (punya Origin/Referer). Daftar
 * KOSONG itu sah: berarti tak ada peramban yang boleh provisioning (S2S-only).
 */
export const GET = superadminRoute(async () => {
  const { s2sAllowedDomains } = await platformSettingsService.get();
  return NextResponse.json({ domains: s2sAllowedDomains });
});

const Body = z.object({ domain: z.string().min(1).max(253) });

export const POST = superadminRoute(async (req, _ctx, actor) => {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Domain wajib diisi.' }, { status: 400 });
  }
  const domain = normalizeS2sDomain(parsed.data.domain);
  if (!domain) {
    return NextResponse.json({ error: 'Bukan domain yang sah (mis. mairasales.com).' }, { status: 400 });
  }
  const { s2sAllowedDomains } = await platformSettingsService.get();
  if (s2sAllowedDomains.includes(domain)) {
    return NextResponse.json({ domains: s2sAllowedDomains }); // idempoten
  }
  const cfg = await platformSettingsService.update(actor, {
    s2sAllowedDomains: [...s2sAllowedDomains, domain],
  });
  return NextResponse.json({ domains: cfg.s2sAllowedDomains });
});

export const DELETE = superadminRoute(async (req, _ctx, actor) => {
  const raw = new URL(req.url).searchParams.get('domain') ?? '';
  const domain = normalizeS2sDomain(raw);
  if (!domain) {
    return NextResponse.json({ error: 'Domain tidak valid.' }, { status: 400 });
  }
  const { s2sAllowedDomains } = await platformSettingsService.get();
  const next = s2sAllowedDomains.filter((d) => d !== domain);
  const cfg = await platformSettingsService.update(actor, { s2sAllowedDomains: next });
  return NextResponse.json({ domains: cfg.s2sAllowedDomains });
});
