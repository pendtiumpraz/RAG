import { and, eq, isNull } from 'drizzle-orm';
import { dataSources } from '@/modules/core/db';
import { withTenant } from '@/modules/core/db/tenant-context';
import { registerJobHandler, enqueueJob, getJobStatus, type JobStatus } from '@/modules/core/jobs';
import { audit } from '@/modules/core/guardrails';
import { dispatch } from '@/modules/core/events';
import { connectionService } from '@/modules/connections/connection.service';
import { knowledgeService } from './knowledge.service';
import { memoryAgent } from '@/modules/memory/memory-agent.service';
import { crawlUserDrive, downloadUserDriveFile } from './storage/gdrive';
import { crawlUserSharepoint, downloadUserSharepointFile } from './storage/sharepoint';

/**
 * SYNC WORKER — crawl storage user → ekstrak teks → ingest KB →
 * auto-trigger Memory Agent. Job 'source.sync' di antrean core/jobs.
 *
 * Storage:
 *  • gdrive     — Google Drive user (OAuth google, drive.readonly)
 *  • onedrive   — /me/drive user via Microsoft Graph (OAuth microsoft)
 *  • sharepoint — path yang sama (delegated Graph token); drive spesifik
 *                 tinggal isi config.folderPath
 *
 * Ekstraksi: txt/md/csv/json/html langsung; PDF/DOCX dilewati dgn catatan
 * (parser biner menyusul) — jumlah yang diskip dilaporkan, tidak diam-diam.
 */

interface SyncPayload { tenantId: string; userId: string; sourceId: string; }

const MAX_FILES_PER_SYNC = 300; // cap per-run (whole-drive bisa besar); sisa di run berikut
const MAX_FILE_CHARS = 200_000;

registerJobHandler('source.sync', async (payload) => {
  await runSync(payload as SyncPayload);
});

export const syncService = {
  enqueue(tenantId: string, userId: string, sourceId: string): JobStatus {
    return enqueueJob('source.sync', sourceId, { tenantId, userId, sourceId } satisfies SyncPayload);
  },
  status(sourceId: string): JobStatus | null {
    return getJobStatus('source.sync', sourceId);
  },
};

async function runSync({ tenantId, userId, sourceId }: SyncPayload): Promise<void> {
  const source = await withTenant(tenantId, async (tx) =>
    (await tx.select().from(dataSources).where(and(
      eq(dataSources.id, sourceId), isNull(dataSources.deletedAt),
    )).limit(1))[0] ?? null);
  if (!source) throw new Error('Sumber data tidak ditemukan');

  const setStatus = (status: string, extra?: Record<string, unknown>) =>
    withTenant(tenantId, (tx) => tx.update(dataSources).set({
      status, lastSyncedAt: new Date(), updatedAt: new Date(),
      ...(extra ? { config: { ...(source.config as object), lastSync: extra } } : {}),
    }).where(eq(dataSources.id, sourceId)));

  await setStatus('syncing');

  try {
    const files = await crawl(tenantId, userId, source.kind, source.config as Record<string, unknown>);
    let ingested = 0, skipped = 0;

    for (const f of files.slice(0, MAX_FILES_PER_SYNC)) {
      const text = await extractText(f.name, f.content);
      if (text === null) { skipped++; continue; }
      await knowledgeService.ingest(tenantId, {
        chatbotId: source.chatbotId,
        title: f.name,
        text: text.slice(0, MAX_FILE_CHARS),
        sourceId,
        metadata: { syncedFrom: source.kind },
      });
      ingested++;
    }

    await setStatus('synced', { ingested, skipped, at: new Date().toISOString() });
    await audit(tenantId, 'system', 'source.sync', sourceId, {
      kind: source.kind, chatbotId: source.chatbotId, ingested, skipped,
    });
    await dispatch('source.connected', {
      tenantId, chatbotId: source.chatbotId, sourceId, kind: source.kind,
    });

    // rantai otomatis: KB berubah → petakan ulang memory (L1–L5)
    memoryAgent.enqueueRun(tenantId, source.chatbotId);
  } catch (err) {
    await setStatus('error', { message: (err as Error).message });
    throw err;
  }
}

/* ── crawl per storage ────────────────────────────────────────────── */

interface CrawledFile { name: string; content: Buffer; }

async function crawl(
  tenantId: string, userId: string, kind: string, config: Record<string, unknown>,
): Promise<CrawledFile[]> {
  // scope: 'all' = SELURUH drive (rekursif) · 'folder' = folder tertentu (rekursif)
  const scope = (config.scope === 'all' ? 'all' : 'folder') as 'all' | 'folder';
  const accountEmail = config.accountEmail ? String(config.accountEmail) : undefined;

  if (kind === 'gdrive') {
    const token = await connectionService.getAccessToken(tenantId, userId, 'google', accountEmail);
    if (!token) throw new Error('Akun Google belum terhubung (hubungkan di Knowledge → Connect Google)');
    const files = await crawlUserDrive(token, { scope, folderId: config.folderId ? String(config.folderId) : undefined, maxFiles: MAX_FILES_PER_SYNC });
    const out: CrawledFile[] = [];
    for (const f of files) out.push({ name: f.name, content: await downloadUserDriveFile(token, f.id) });
    return out;
  }

  if (kind === 'onedrive' || kind === 'sharepoint') {
    const token = await connectionService.getAccessToken(tenantId, userId, 'microsoft', accountEmail);
    if (!token) throw new Error('Akun Microsoft belum terhubung (hubungkan di Knowledge → Connect Microsoft)');
    const items = await crawlUserSharepoint(token, { scope, folderPath: config.folderPath ? String(config.folderPath) : undefined, maxFiles: MAX_FILES_PER_SYNC });
    const out: CrawledFile[] = [];
    for (const it of items) out.push({ name: it.name, content: await downloadUserSharepointFile(token, it.id) });
    return out;
  }

  throw new Error(`Jenis sumber belum didukung sync: ${kind}`);
}

/* ── ekstraksi teks ───────────────────────────────────────────────── */

const TEXT_EXT = ['.txt', '.md', '.markdown', '.csv', '.json', '.log', '.yaml', '.yml'];

/**
 * name+buffer → teks, atau null bila format tak didukung (dihitung skipped).
 * PDF via pdf-parse, DOCX via mammoth (dynamic import — modul berat hanya
 * dimuat saat dibutuhkan). Parser gagal ⇒ null, JANGAN mematikan sync.
 */
export async function extractText(name: string, buf: Buffer): Promise<string | null> {
  const lower = name.toLowerCase();
  if (TEXT_EXT.some((e) => lower.endsWith(e))) return buf.toString('utf8');

  if (lower.endsWith('.html') || lower.endsWith('.htm')) {
    return buf.toString('utf8')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  if (lower.endsWith('.pdf')) {
    try {
      const pdfParse = (await import('pdf-parse')).default;
      const data = await pdfParse(buf);
      return data.text?.trim() || null;
    } catch (err) {
      console.error(`[sync] gagal parse PDF ${name}:`, err);
      return null;
    }
  }

  if (lower.endsWith('.docx')) {
    try {
      const mammoth = await import('mammoth');
      const r = await mammoth.extractRawText({ buffer: buf });
      return r.value?.trim() || null;
    } catch (err) {
      console.error(`[sync] gagal parse DOCX ${name}:`, err);
      return null;
    }
  }

  // XLSX/PPTX/gambar — belum didukung; tercatat sebagai skipped.
  return null;
}
