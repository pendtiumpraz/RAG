import { NextResponse } from 'next/server';
import { z } from 'zod';
import { superadminRoute } from '../_guard';
import { konektorService } from '@/modules/knowledge/konektor.service';
import { db, dataSources } from '@/modules/core/db';
import { isNull, sql } from 'drizzle-orm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/connectors — daftar konektor + keadaan nyalanya.
 *
 * Ikut membawa BERAPA SUMBER yang masih memakai tiap konektor, lintas tenant.
 * Sebabnya: mematikan konektor TIDAK menghentikan sumber yang sudah ada — ia
 * hanya menutup pembuatan yang baru. Tanpa angka itu, superadmin mengira
 * mematikan Drive berarti Drive berhenti disinkronkan, padahal tidak, dan
 * salah paham semacam itu baru ketahuan saat ada yang menanyakan kenapa
 * dokumennya masih diperbarui.
 */
export const GET = superadminRoute(async () => {
  const daftar = await konektorService.daftar();
  const pakai = await db.select({ kind: dataSources.kind, n: sql<number>`count(*)::int` })
    .from(dataSources).where(isNull(dataSources.deletedAt)).groupBy(dataSources.kind);
  const peta = new Map(pakai.map((r) => [r.kind, Number(r.n)]));
  return NextResponse.json({
    konektor: daftar.map((k) => ({ ...k, sumberAktif: peta.get(k.jenis) ?? 0 })),
  });
});

const Body = z.object({ konektor: z.record(z.boolean()) });

/** PUT /api/admin/connectors — nyalakan/matikan konektor. */
export const PUT = superadminRoute(async (req) => {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Input tidak valid' }, { status: 400 });
  }
  return NextResponse.json({ konektor: await konektorService.simpan(parsed.data.konektor) });
});
