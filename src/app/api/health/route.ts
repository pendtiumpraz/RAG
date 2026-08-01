import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db, ukurSambungPertama } from '@/modules/core/db';
import { log } from '@/modules/core/observability';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/health — pemeriksaan kesehatan untuk uptime monitor.
 *
 * PUBLIK dan sengaja MINIM: hanya menyatakan hidup/tidaknya proses dan
 * databasenya. Tidak menyebut versi paket, nama tabel, jumlah tenant, atau
 * apa pun yang berguna bagi penyerang — health endpoint adalah permukaan yang
 * paling sering dipindai orang.
 *
 * Balasan 503 saat DB tak terjangkau supaya monitor benar-benar berbunyi;
 * 200 dengan "ok: false" akan terbaca sehat oleh kebanyakan monitor.
 */
export async function GET() {
  /* Ukur biaya MENYAMBUNG, bukan biaya kueri. Endpoint inilah yang paling
     sering diketuk monitor, jadi ia yang paling sering menemui lambda dingin
     — dan karena itu paling mungkin merekam kejadian 57 detik berikutnya. */
  void ukurSambungPertama();

  const t0 = Date.now();
  let dbOk = false;
  let dbLatencyMs: number | null = null;

  try {
    const t = Date.now();
    await db.execute(sql`select 1`);
    dbLatencyMs = Date.now() - t;
    dbOk = true;
  } catch (err) {
    log('error', { event: 'health.db_unreachable', error: (err as Error).message });
  }

  const body = {
    ok: dbOk,
    db: { ok: dbOk, latencyMs: dbLatencyMs },
    mode: process.env.DEPLOYMENT_MODE ?? 'saas',
    checkedInMs: Date.now() - t0,
  };
  return NextResponse.json(body, {
    status: dbOk ? 200 : 503,
    headers: { 'cache-control': 'no-store' },
  });
}
