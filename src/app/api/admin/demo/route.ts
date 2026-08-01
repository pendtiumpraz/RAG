import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq, isNull, and } from 'drizzle-orm';
import { superadminRoute } from '../_guard';
import { db, chatbots, platformSettings } from '@/modules/core/db';
import { demoService } from '@/modules/core/demo.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/demo — chatbot mana yang jadi demo publik + sisa kuotanya.
 *
 * Daftar chatbot dibaca LINTAS TENANT lewat `db` langsung, bukan withTenant:
 * superadmin memilih dari seluruh platform, dan itu memang wewenangnya —
 * sama dengan antrean persetujuan pengguna. Yang diambil hanya nama & kunci
 * publik; isi knowledge base-nya tak ikut ke mana pun.
 */
export const GET = superadminRoute(async () => {
  const p = await demoService.pengaturan();
  const semua = await db.select({
    id: chatbots.id, name: chatbots.name, publicKey: chatbots.publicKey, tenantId: chatbots.tenantId,
  }).from(chatbots).where(and(eq(chatbots.enabled, true), isNull(chatbots.deletedAt)));

  const terpilih = semua.find((c) => c.id === p.chatbotId);
  const status = await demoService.status(terpilih?.tenantId);
  return NextResponse.json({
    pengaturan: p,
    status,
    publicKey: terpilih?.publicKey ?? null,
    chatbots: semua.map((c) => ({ id: c.id, name: c.name })),
  });
});

const Body = z.object({
  chatbotId: z.string().uuid().nullable(),
  batas: z.number().int().min(0).max(1_000_000),
});

/** PUT /api/admin/demo — tunjuk chatbot demo & setel remnya. */
export const PUT = superadminRoute(async (req) => {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Input tidak valid' }, { status: 400 });
  }
  await db.update(platformSettings).set({
    demoChatbotId: parsed.data.chatbotId,
    demoLimitPerMonth: parsed.data.batas,
    updatedAt: new Date(),
  }).where(eq(platformSettings.id, 1));
  /* Cache pemakaian dilupakan: angka lama akan menyesatkan tepat sesudah
     remnya diubah, dan itu justru saat orang paling memperhatikannya. */
  demoService.lupakanCache();
  return NextResponse.json({ ok: true });
});
