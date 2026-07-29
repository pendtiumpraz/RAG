import { NextRequest, NextResponse, after } from 'next/server';
import { z } from 'zod';
import { and, eq, isNull } from 'drizzle-orm';
import { dataSources } from '@/modules/core/db';
import { withTenant } from '@/modules/core/db/tenant-context';
import { getCurrentUser, requireRole } from '@/modules/core/auth';
import { syncService } from '@/modules/knowledge/sync.service';
import { jobsSettled } from '@/modules/core/jobs';

export const runtime = 'nodejs';
/** Sync bisa mengunduh + embed banyak file — beri waktu setelah respons. */
export const maxDuration = 60;

/** GET /api/sources?knowledgeBaseId=… — daftar sumber data + status sync (D11). */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  const knowledgeBaseId = req.nextUrl.searchParams.get('knowledgeBaseId');
  if (!knowledgeBaseId) return NextResponse.json({ error: 'knowledgeBaseId wajib' }, { status: 400 });

  const rows = await withTenant(user.tenantId, (tx) =>
    tx.select().from(dataSources).where(and(
      eq(dataSources.knowledgeBaseId, knowledgeBaseId), isNull(dataSources.deletedAt),
    )));
  return NextResponse.json(rows.map((r) => ({
    ...r, jobStatus: syncService.status(r.id),
  })));
}

const Body = z.object({
  knowledgeBaseId: z.string().uuid(),
  kind: z.enum(['gdrive', 'gdrive_public', 'onedrive', 'sharepoint', 'upload', 'url']),
  config: z.record(z.unknown()).default({}),   // { folderId } | { folderPath } | …
});

/** POST /api/sources — hubungkan sumber → langsung antre sync pertama. */
export async function POST(req: NextRequest) {
  const user = await requireRole('superadmin', 'admin');
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });

  const created = await withTenant(user.tenantId, async (tx) =>
    (await tx.insert(dataSources).values({
      tenantId: user.tenantId,
      knowledgeBaseId: parsed.data.knowledgeBaseId,
      kind: parsed.data.kind,
      config: parsed.data.config,
    }).returning())[0]);

  let jobStatus = null;
  if (['gdrive', 'gdrive_public', 'onedrive', 'sharepoint'].includes(parsed.data.kind)) {
    jobStatus = syncService.enqueue(user.tenantId, user.id, created.id);
    // Tanpa ini, Vercel membekukan lambda begitu respons terkirim dan job
    // sync mati di tengah — status macet 'syncing', KB tak pernah terisi.
    after(jobsSettled);
  }
  return NextResponse.json({ source: created, jobStatus }, { status: 201 });
}
