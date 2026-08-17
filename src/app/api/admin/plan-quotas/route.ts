import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/modules/core/auth';
import { db, platformSettings } from '@/modules/core/db';
import { eq } from 'drizzle-orm';
import { PLAN_LIMITS } from '@/modules/core/limits';
import { invalidatePlanLimits } from '@/modules/core/limits-server';

export const runtime = 'nodejs';

/**
 * KUOTA PLAN — dibaca & disetel superadmin.
 *
 * Angka kuota adalah keputusan BISNIS, bukan keputusan teknis: berapa yang
 * cukup menarik tanpa membuat orang betah gratis selamanya hanya bisa
 * dijawab dengan mencoba, mengamati, lalu menyesuaikan. Menaruhnya di kode
 * membuat tiap penyesuaian menuntut deploy — dan penyesuaian yang mahal
 * adalah penyesuaian yang tak pernah dilakukan.
 */

/** `null` = tanpa batas. Infinity tak punya padanan di JSON. */
const Kuota = z.object({
  messagesPerMonth: z.number().min(0).nullable().optional(),
  chatBurst: z.number().min(1).nullable().optional(),
  chatRefillPerSec: z.number().min(0).nullable().optional(),
  maxChatbots: z.number().min(0).nullable().optional(),
  maxMembers: z.number().min(0).nullable().optional(),
  maxKnowledgeBases: z.number().min(0).nullable().optional(),
  maxChunks: z.number().min(0).nullable().optional(),
  storageBytes: z.number().min(0).nullable().optional(),
});

const Body = z.object({
  free: Kuota.optional(),
  pro: Kuota.optional(),
  enterprise: Kuota.optional(),
  // `onprem` sengaja TIDAK diterima: batasnya server milik pelanggan, dan
  // satu salah ketik di sini bisa mematikan pemasangan yang sudah mereka
  // bayar sendiri. Ditolak di sini DAN diabaikan di limitsFor().
});

async function baris() {
  const r = await db.select().from(platformSettings).where(eq(platformSettings.id, 1)).limit(1);
  if (r[0]) return r[0];
  return (await db.insert(platformSettings).values({ id: 1 }).returning())[0];
}

/** GET — default kode + penimpa yang berlaku, supaya UI bisa menampilkan keduanya. */
export async function GET() {
  await requireRole('superadmin');
  const row = await baris();
  return NextResponse.json({
    defaults: PLAN_LIMITS,
    overrides: row.planQuotas ?? {},
  });
}

/** PUT — simpan penimpa. Kunci yang dihapus kembali ke default kode. */
export async function PUT(req: NextRequest) {
  await requireRole('superadmin');
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });

  const row = await baris();
  await db.update(platformSettings)
    .set({ planQuotas: parsed.data as Record<string, Record<string, number | null>>, updatedAt: new Date() })
    .where(eq(platformSettings.id, row.id));

  // Tanpa ini perubahannya baru terasa setelah tembolok 60 detik kedaluwarsa,
  // dan superadmin akan menyangka simpanannya gagal.
  invalidatePlanLimits();

  return NextResponse.json({ ok: true, overrides: parsed.data });
}
