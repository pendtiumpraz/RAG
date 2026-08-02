import { NextRequest, NextResponse, after } from 'next/server';
import { z } from 'zod';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { dataSources } from '@/modules/core/db';
import { withTenant } from '@/modules/core/db/tenant-context';
import { getCurrentUser, requireRole } from '@/modules/core/auth';
import { syncService } from '@/modules/knowledge/sync.service';
import { jobsSettled } from '@/modules/core/jobs';
import { encryptSecret } from '@/modules/core/crypto';
import { konektorService } from '@/modules/knowledge/konektor.service';
import { AMBANG_MANDEK_DETIK, PESAN_MANDEK } from '@/modules/knowledge/sync-mandek';
import { ensureIntegrations } from '../_wire';

export const runtime = 'nodejs';
/** Sync bisa mengunduh + embed banyak file — beri waktu setelah respons. */
export const maxDuration = 60;

/** GET /api/sources?knowledgeBaseId=… — daftar sumber data + status sync (D11). */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  const knowledgeBaseId = req.nextUrl.searchParams.get('knowledgeBaseId');
  if (!knowledgeBaseId) return NextResponse.json({ error: 'knowledgeBaseId wajib' }, { status: 400 });

  const rows = await withTenant(user.tenantId, async (tx) => {
    /* LEPASKAN yang MANDEK sebelum menjawab.

       Fungsi sync dibatasi 60 detik; sumber berisi ratusan berkas dibunuh di
       tengah jalan, dan sebelum ini tak ada yang mengembalikan statusnya.
       Barisnya tinggal 'syncing' SELAMANYA: tombol Sync mati, dan halaman
       terus menyegarkan diri menunggu kabar yang tak akan pernah datang.
       Terjadi di produksi 1 Agu 2026 — pemiliknya menunggu 18 menit, dan
       satu-satunya jalan keluar saat itu mengubah baris lewat SQL.

       Dikerjakan di sini, di jalur yang MEMANG sudah dipanggil tiap 2,5 detik
       oleh halaman yang sedang menunggu — jadi tak perlu penjadwal, dan yang
       paling butuh pembebasan adalah yang paling sering memanggilnya. */
    await tx.update(dataSources)
      .set({
        status: 'error',
        config: sql`coalesce(${dataSources.config}, '{}'::jsonb) || jsonb_build_object('lastSync', jsonb_build_object('message', ${PESAN_MANDEK}::text))`,
        updatedAt: new Date(),
      })
      .where(and(
        eq(dataSources.knowledgeBaseId, knowledgeBaseId),
        eq(dataSources.status, 'syncing'),
        isNull(dataSources.deletedAt),
        sql`${dataSources.updatedAt} < now() - make_interval(secs => ${AMBANG_MANDEK_DETIK})`,
      ));

    return tx.select().from(dataSources).where(and(
      eq(dataSources.knowledgeBaseId, knowledgeBaseId), isNull(dataSources.deletedAt),
    ));
  });
  return NextResponse.json(rows.map((r) => ({
    ...r, jobStatus: syncService.status(r.id),
  })));
}

const Body = z.object({
  knowledgeBaseId: z.string().uuid(),
  kind: z.enum(['gdrive', 'gdrive_public', 'onedrive', 'sharepoint', 'upload', 'url', 's3', 'notion', 'slack']),
  config: z.record(z.unknown()).default({}),   // { folderId } | { folderPath } | …
});

/**
 * Rahasia di dalam `config` TIDAK boleh mendarat polos di jsonb.
 *
 * `data_sources.config` adalah kolom biasa: ia ikut di setiap SELECT, ikut
 * ke layar daftar sumber, dan ikut ke cadangan basis data. Satu secret access
 * key S3 yang tergeletak di sana bisa membaca SELURUH bucket pelanggan — dan
 * tak seperti kunci OAuth, ia tak kedaluwarsa sendiri.
 *
 * Dilakukan di titik masuk, bukan di service, supaya tak ada jalan lain
 * memasukkan sumber S3 tanpa melewati enkripsi ini.
 */
function amankanRahasia(kind: string, config: Record<string, unknown>): Record<string, unknown> {
  if (kind === 's3') {
    const { secretAccessKey, ...sisa } = config as { secretAccessKey?: unknown };
    if (typeof secretAccessKey !== 'string' || !secretAccessKey) return sisa;
    return { ...sisa, secretAccessKeyEnc: encryptSecret(secretAccessKey) };
  }
  /* Notion & Slack: token milik ruang kerja pelanggan. Umurnya panjang dan
     tak kedaluwarsa sendiri — persis seperti kunci S3, dan karena itu tak
     boleh mendarat polos di jsonb yang ikut di setiap SELECT dan setiap
     cadangan. Ditangani di titik masuk yang SAMA supaya tak ada jenis baru
     yang bisa lolos dengan diam-diam melewati enkripsi. */
  if (kind === 'notion' || kind === 'slack') {
    const { token, ...sisa } = config as { token?: unknown };
    if (typeof token !== 'string' || !token) return sisa;
    return { ...sisa, tokenEnc: encryptSecret(token) };
  }
  return config;
}

/** POST /api/sources — hubungkan sumber → langsung antre sync pertama. */
export async function POST(req: NextRequest) {
  ensureIntegrations();
  const user = await requireRole('superadmin', 'admin');
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });

  /* PENEGAKAN, bukan sekadar menyembunyikan pilihan di layar. Kalau hanya UI
     yang menyaring, satu permintaan HTTP langsung tetap bisa membuat sumber
     dari konektor yang sengaja dimatikan — dan saklarnya akan terlihat
     bekerja sambil tak menahan apa pun. */
  if (!(await konektorService.boleh(parsed.data.kind))) {
    return NextResponse.json(
      { error: 'Jenis sumber ini sedang dimatikan administrator.' }, { status: 422 });
  }

  const created = await withTenant(user.tenantId, async (tx) =>
    (await tx.insert(dataSources).values({
      tenantId: user.tenantId,
      knowledgeBaseId: parsed.data.knowledgeBaseId,
      kind: parsed.data.kind,
      config: amankanRahasia(parsed.data.kind, parsed.data.config),
    }).returning())[0]);

  let jobStatus = null;
  // Jenis "upload" TIDAK di sini: berkasnya ikut di badan permintaan dan ingest-nya
  // tuntas di /api/knowledge-bases/{id}/upload — tak ada yang bisa di-sync.
  if (['gdrive', 'gdrive_public', 'onedrive', 'sharepoint', 'url', 's3', 'notion', 'slack'].includes(parsed.data.kind)) {
    jobStatus = syncService.enqueue(user.tenantId, user.id, created.id);
    // Tanpa ini, Vercel membekukan lambda begitu respons terkirim dan job
    // sync mati di tengah — status macet 'syncing', KB tak pernah terisi.
    after(jobsSettled);
  }
  return NextResponse.json({ source: created, jobStatus }, { status: 201 });
}
