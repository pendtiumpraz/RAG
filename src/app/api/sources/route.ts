import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq, isNull } from 'drizzle-orm';
import { dataSources } from '@/modules/core/db';
import { withTenant } from '@/modules/core/db/tenant-context';
import { getCurrentUser } from '@/modules/core/auth';
import { syncService } from '@/modules/knowledge/sync.service';

export const runtime = 'nodejs';

/** GET /api/sources?chatbotId=… — daftar sumber data + status sync. */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  const chatbotId = req.nextUrl.searchParams.get('chatbotId');
  if (!chatbotId) return NextResponse.json({ error: 'chatbotId wajib' }, { status: 400 });

  const rows = await withTenant(user.tenantId, (tx) =>
    tx.select().from(dataSources).where(and(
      eq(dataSources.chatbotId, chatbotId), isNull(dataSources.deletedAt),
    )));
  return NextResponse.json(rows.map((r) => ({
    ...r, jobStatus: syncService.status(r.id),
  })));
}

const Body = z.object({
  chatbotId: z.string().uuid(),
  kind: z.enum(['gdrive', 'onedrive', 'sharepoint', 'upload', 'url']),
  config: z.record(z.unknown()).default({}),   // { folderId } | { folderPath } | …
});

/** POST /api/sources — hubungkan sumber → langsung antre sync pertama. */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });

  const created = await withTenant(user.tenantId, async (tx) =>
    (await tx.insert(dataSources).values({
      tenantId: user.tenantId,
      chatbotId: parsed.data.chatbotId,
      kind: parsed.data.kind,
      config: parsed.data.config,
    }).returning())[0]);

  let jobStatus = null;
  if (['gdrive', 'onedrive', 'sharepoint'].includes(parsed.data.kind)) {
    jobStatus = syncService.enqueue(user.tenantId, user.id, created.id);
  }
  return NextResponse.json({ source: created, jobStatus }, { status: 201 });
}
