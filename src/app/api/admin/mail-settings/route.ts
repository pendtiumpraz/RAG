import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { superadminRoute } from '../_guard';
import { db, platformSettings } from '@/modules/core/db';
import { mailerService } from '@/modules/mail/mailer.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET — config SMTP tanpa password (superadmin). */
export const GET = superadminRoute(async () => {
  const row = (await db.select().from(platformSettings)
    .where(eq(platformSettings.id, 1)).limit(1))[0];
  return NextResponse.json({
    config: row?.smtpConfig ?? null,
    hasPassword: !!row?.encryptedSmtpPassword,
    configured: await mailerService.isConfigured(),
  });
});

const Body = z.object({
  config: z.object({
    host: z.string().min(1),
    port: z.number().int().min(1).max(65535).default(465),
    secure: z.boolean().default(true),
    user: z.string().min(1),
    fromName: z.string().default('Nalar'),
    fromEmail: z.string().email(),
  }),
  /** kosong = pertahankan app password tersimpan */
  password: z.string().optional(),
  /** kirim email uji ke alamat ini setelah simpan */
  testTo: z.string().email().optional(),
});

export const PUT = superadminRoute(async (req, _ctx, actor) => {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Input tidak valid' }, { status: 400 });
  }
  await mailerService.saveConfig(actor, {
    config: parsed.data.config, password: parsed.data.password,
  });
  let testSent: boolean | null = null;
  if (parsed.data.testTo) testSent = await mailerService.sendTest(parsed.data.testTo);
  return NextResponse.json({ ok: true, testSent });
});
