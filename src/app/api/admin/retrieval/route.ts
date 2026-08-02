import { NextResponse } from 'next/server';
import { z } from 'zod';
import { superadminRoute } from '../_guard';
import { db, platformSettings } from '@/modules/core/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * SAKLAR RETRIEVAL TINGKAT PLATFORM (superadmin).
 *
 * Kenapa di sini dan bukan per-tenant: yang ditukar adalah waktu lawan
 * ketepatan pada INFRASTRUKTUR BERSAMA. Pemilik satu knowledge base tak punya
 * dasar untuk menilainya — ia tak melihat beban tenant lain, dan tak ada
 * layar yang bisa jujur menjelaskan pertukarannya kepada orang yang cuma
 * ingin dokumennya bisa ditanyai.
 */

export const GET = superadminRoute(async () => {
  const rows = await db.select({ biner: platformSettings.binaryQuantize })
    .from(platformSettings).limit(1);
  return NextResponse.json({ binaryQuantize: Boolean(rows[0]?.biner) });
});

const Body = z.object({ binaryQuantize: z.boolean() });

export const PUT = superadminRoute(async (req) => {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });

  /* platform_settings selalu satu baris (id=1). UPSERT, bukan update: pada
     pemasangan baru barisnya belum tentu pernah dibuat, dan update yang tak
     mengenai baris mana pun BERHASIL DENGAN DIAM — saklarnya lalu tampak
     tersimpan sambil tak pernah tersimpan. */
  await db.insert(platformSettings)
    .values({ id: 1, binaryQuantize: parsed.data.binaryQuantize })
    .onConflictDoUpdate({
      target: platformSettings.id,
      set: { binaryQuantize: parsed.data.binaryQuantize, updatedAt: new Date() },
    });

  return NextResponse.json({ ok: true });
});
