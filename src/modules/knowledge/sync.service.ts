import { and, eq, isNull } from 'drizzle-orm';
import { dataSources } from '@/modules/core/db';
import { withTenant } from '@/modules/core/db/tenant-context';
import { registerJobHandler, enqueueJob, getJobStatus, type JobStatus } from '@/modules/core/jobs';
import { audit } from '@/modules/core/guardrails';
import { dispatch } from '@/modules/core/events';
import { connectionService } from '@/modules/connections/connection.service';
import { knowledgeService } from './knowledge.service';
import { knowledgeBaseService } from './knowledge-base.service';
import { memoryAgent } from '@/modules/memory/memory-agent.service';
import { crawlUserDrive, getUserDriveFilesMeta, downloadUserDriveFile, exportUserDriveFile, isGoogleNative, googleNativeExportMime } from './storage/gdrive';
import { crawlUserSharepoint, downloadUserSharepointFile } from './storage/sharepoint';
import {
  isSharingLink, resolveShareLink, resolveSiteFolder, parseSharePointSiteUrl,
  crawlDriveFolder, downloadDriveItem,
} from './storage/sharepoint-sites';
import {
  parseDriveFolderUrl, crawlPublicFolder, downloadPublicFile, exportPublicFile,
} from './storage/gdrive-public';
import { oauthAppService } from '@/modules/auth/oauth-app.service';

/**
 * SYNC WORKER — crawl storage user → ekstrak teks → ingest KB →
 * auto-trigger Memory Agent. Job 'source.sync' di antrean core/jobs.
 *
 * INCREMENTAL / DELTA SYNC
 * ------------------------
 * Sync TIDAK meng-ingest ulang seluruh drive tiap kali jalan. Tiap chunk
 * menyimpan `external_id` (id file upstream) + `external_version` (Drive
 * modifiedTime / Graph eTag). Satu run:
 *   1. listing metadata saja (murah, tanpa download)
 *   2. bandingkan dengan manifest DB → planDelta()
 *   3. hanya file BARU / BERUBAH yang diunduh + di-embed;
 *      file yang HILANG di upstream chunk-nya di-soft-delete
 * Tanpa ini, sync kedua menduplikasi seluruh KB dan membayar biaya
 * embedding berulang.
 *
 * Storage:
 *  • gdrive        — Google Drive user (OAuth google; folder rekursif dgn
 *                    drive.readonly, atau berkas terpilih dgn drive.file)
 *  • gdrive_public — URL folder yang dibagikan "Anyone with the link",
 *                    dibaca dengan API KEY tanpa OAuth sama sekali. Satu-
 *                    satunya jalur yang menarik SELURUH isi folder rekursif
 *                    tanpa scope restricted (lihat storage/gdrive-public.ts)
 *  • onedrive      — /me/drive user via Microsoft Graph (OAuth microsoft)
 *  • sharepoint    — document library situs, shared link, atau /me/drive
 *                    (lihat storage/sharepoint.ts)
 *
 * Ekstraksi: txt/md/csv/json/html langsung; PDF (pdf-parse), DOCX (mammoth);
 * Google Docs/Sheets/Slides via export teks. Format tak didukung dihitung
 * skipped — dilaporkan, tidak diam-diam.
 */

interface SyncPayload { tenantId: string; userId: string; sourceId: string; full?: boolean }

/** Listing metadata murah → boleh besar; menentukan akurasi deteksi file terhapus. */
const MAX_LIST_FILES = 2000;
/** Kerja mahal (download + embed) dibatasi per run; sisanya lanjut run berikutnya. */
const MAX_INGEST_PER_SYNC = 150;
const MAX_FILE_CHARS = 200_000;

registerJobHandler('source.sync', async (payload) => {
  await runSync(payload as SyncPayload);
});

export const syncService = {
  /** `full: true` → paksa re-ingest semua file (abaikan versi tersimpan). */
  enqueue(tenantId: string, userId: string, sourceId: string, full = false): JobStatus {
    return enqueueJob('source.sync', sourceId, { tenantId, userId, sourceId, full } satisfies SyncPayload);
  },
  status(sourceId: string): JobStatus | null {
    return getJobStatus('source.sync', sourceId);
  },
};

/* ── perencanaan delta (murni — diuji tanpa DB) ───────────────────── */

export interface RemoteFile {
  externalId: string;
  name: string;
  /** Penanda versi upstream; string kosong = upstream tak memberi versi. */
  version: string;
  mimeType?: string;
}

export interface SyncPlan {
  /** Belum pernah di-ingest. */
  create: RemoteFile[];
  /** Sudah ada tapi versinya berbeda → chunk lama dibuang, di-ingest ulang. */
  update: RemoteFile[];
  /** Tak berubah — tidak diunduh, tidak di-embed. */
  unchanged: number;
  /** external_id yang ada di DB tapi lenyap dari upstream → soft-delete. */
  remove: string[];
}

/**
 * Bandingkan listing upstream dengan manifest DB.
 *
 * `truncated` = listing kena batas MAX_LIST_FILES, jadi kita TIDAK melihat
 * seluruh drive. Dalam kondisi itu penghapusan DILEWATI — file yang sekadar
 * berada di luar jendela listing tidak boleh dikira terhapus.
 */
export function planDelta(
  remote: RemoteFile[],
  manifest: Map<string, string>,
  opts: { full?: boolean; truncated?: boolean } = {},
): SyncPlan {
  const plan: SyncPlan = { create: [], update: [], unchanged: 0, remove: [] };
  const seen = new Set<string>();

  for (const f of remote) {
    seen.add(f.externalId);
    const prev = manifest.get(f.externalId);
    if (prev === undefined) plan.create.push(f);
    else if (opts.full || prev !== f.version || f.version === '') plan.update.push(f);
    else plan.unchanged++;
  }

  if (!opts.truncated) {
    for (const id of manifest.keys()) if (!seen.has(id)) plan.remove.push(id);
  }
  return plan;
}

/* ── job utama ────────────────────────────────────────────────────── */

async function runSync({ tenantId, userId, sourceId, full }: SyncPayload): Promise<void> {
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
    const conn = await connect(tenantId, userId, source.kind, source.config as Record<string, unknown>);

    // Format yang pasti tak bisa jadi teks tidak perlu diunduh sama sekali.
    const supported: RemoteFile[] = [];
    let skipped = 0;
    for (const f of conn.files) {
      if (isExtractable(f.name, f.mimeType)) supported.push(f);
      else skipped++;
    }

    const manifest = await knowledgeService.manifestBySource(tenantId, sourceId);
    const plan = planDelta(supported, manifest, { full, truncated: conn.truncated });

    // File hilang di upstream → chunk-nya keluar dari KB (soft-delete, bisa di-restore).
    let removed = 0;
    if (plan.remove.length) {
      removed = await knowledgeService.removeExternal(tenantId, sourceId, plan.remove);
    }

    // Migrasi dari sync pra-delta: chunk lama tak punya external_id sehingga tak
    // terlihat di manifest — tanpa dibuang ia akan berdampingan dgn ingest baru
    // (KB dobel). Sekali jalan saat source pertama kali di-sync secara delta.
    if (manifest.size === 0 || full) {
      removed += await knowledgeService.removeLegacy(tenantId, sourceId);
    }

    // Kerja mahal dibatasi per run; sisanya dilaporkan sebagai `pending`.
    const work = [...plan.create, ...plan.update];
    const batch = work.slice(0, MAX_INGEST_PER_SYNC);
    const pending = work.length - batch.length;
    const isUpdate = new Set(plan.update.map((f) => f.externalId));

    let ingested = 0, updated = 0, failed = 0;
    for (const f of batch) {
      try {
        const { content, mime } = await conn.fetch(f);
        const text = await extractText(f.name, content, mime);
        if (text === null) { skipped++; continue; }

        // Versi baru menggantikan yang lama — buang chunk lama DULU agar
        // KB tidak berisi dua versi dokumen yang sama.
        if (isUpdate.has(f.externalId)) {
          await knowledgeService.removeExternal(tenantId, sourceId, [f.externalId]);
        }

        await knowledgeService.ingest(tenantId, {
          knowledgeBaseId: source.knowledgeBaseId,
          title: f.name,
          text: text.slice(0, MAX_FILE_CHARS),
          sourceId,
          externalId: f.externalId,
          externalVersion: f.version,
          metadata: { syncedFrom: source.kind },
        });
        if (isUpdate.has(f.externalId)) updated++; else ingested++;
      } catch (err) {
        // 1 file gagal TIDAK boleh mematikan seluruh sync.
        console.error(`[sync] gagal memproses ${f.name}:`, err);
        failed++;
      }
    }

    const stats = {
      ingested, updated, removed, unchanged: plan.unchanged,
      skipped, failed, pending, at: new Date().toISOString(),
    };
    await setStatus(pending > 0 ? 'partial' : 'synced', stats);
    await audit(tenantId, 'system', 'source.sync', sourceId, {
      kind: source.kind, knowledgeBaseId: source.knowledgeBaseId, ...stats,
    });
    await dispatch('source.connected', {
      tenantId, knowledgeBaseId: source.knowledgeBaseId, sourceId, kind: source.kind,
    });

    // rantai otomatis (D11): KB berubah → petakan ulang memory utk SETIAP
    // chatbot yang memakai KB ini. Tak ada perubahan ⇒ tak perlu agent.
    if (ingested || updated || removed) {
      const botIds = await knowledgeBaseService.assignedChatbots(tenantId, source.knowledgeBaseId);
      for (const botId of botIds) memoryAgent.enqueueRun(tenantId, botId);
    }
  } catch (err) {
    await setStatus('error', { message: (err as Error).message });
    throw err;
  }
}

/* ── konektor per storage (listing murah + fetch malas) ───────────── */

interface Connector {
  files: RemoteFile[];
  /** true bila listing kena batas → deteksi file terhapus tidak dapat dipercaya. */
  truncated: boolean;
  fetch(f: RemoteFile): Promise<{ content: Buffer; mime?: string }>;
}

async function connect(
  tenantId: string, userId: string, kind: string, config: Record<string, unknown>,
): Promise<Connector> {
  // scope: 'all' = SELURUH drive (rekursif) · 'folder' = folder tertentu (rekursif)
  const scope = (config.scope === 'all' ? 'all' : 'folder') as 'all' | 'folder';
  const accountEmail = config.accountEmail ? String(config.accountEmail) : undefined;

  if (kind === 'gdrive') {
    const token = await connectionService.getAccessToken(tenantId, userId, 'google', accountEmail);
    if (!token) throw new Error('Akun Google belum terhubung (hubungkan di Knowledge → Connect Google)');

    // Mode 'picker' (D10): config membawa daftar id berkas yang dipilih user
    // di Google Picker. Dengan drive.file listing folder mustahil — metadata
    // diambil per id. Berkas yang 404 hilang dari listing → planDelta remove.
    const pickedIds = Array.isArray(config.fileIds)
      ? (config.fileIds as unknown[]).map(String).filter(Boolean)
      : null;

    const raw = pickedIds
      ? await getUserDriveFilesMeta(token, pickedIds.slice(0, MAX_LIST_FILES))
      : await crawlUserDrive(token, {
          scope,
          folderId: config.folderId ? String(config.folderId) : undefined,
          maxFiles: MAX_LIST_FILES,
        });
    return {
      files: raw.map((f) => ({
        externalId: f.id, name: f.name, mimeType: f.mimeType,
        version: f.modifiedTime ?? '',
      })),
      // Picker: daftar id-nya eksplisit & lengkap (kecuali dipangkas), jadi
      // berkas yang tak muncul memang boleh dihapus dari KB.
      truncated: pickedIds
        ? pickedIds.length > MAX_LIST_FILES
        : raw.length >= MAX_LIST_FILES,
      async fetch(f) {
        if (isGoogleNative(f.mimeType)) {
          // Docs Editors tak bisa alt=media; harus di-export.
          const exportMime = googleNativeExportMime(f.mimeType)!; // isExtractable menjamin ada
          return { content: await exportUserDriveFile(token, f.externalId, exportMime), mime: exportMime };
        }
        return { content: await downloadUserDriveFile(token, f.externalId) };
      },
    };
  }

  // Folder Drive publik — TANPA OAuth. Tak ada accountEmail, tak ada token;
  // yang dibutuhkan hanya API key platform + folder yang benar-benar publik.
  if (kind === 'gdrive_public') {
    const app = await oauthAppService.get('google');
    const apiKey = app?.driveApiKey;
    if (!apiKey) {
      throw new Error('Kunci Drive API belum diisi superadmin (Models & Keys → kredensial Google → Drive API key).');
    }
    const root = parseDriveFolderUrl(String(config.folderUrl ?? ''));
    const raw = await crawlPublicFolder(apiKey, root, { maxFiles: MAX_LIST_FILES });
    /** resourceKey per berkas — sebagian berkas lama menolak diunduh tanpanya. */
    const keys = new Map(raw.filter((f) => f.resourceKey).map((f) => [f.id, f.resourceKey!]));
    return {
      files: raw.map((f) => ({
        externalId: f.id, name: f.name, mimeType: f.mimeType,
        version: f.modifiedTime ?? '',
      })),
      truncated: raw.length >= MAX_LIST_FILES,
      async fetch(f) {
        const rk = keys.get(f.externalId);
        if (isGoogleNative(f.mimeType)) {
          const exportMime = googleNativeExportMime(f.mimeType)!;
          return { content: await exportPublicFile(apiKey, f.externalId, exportMime, rk), mime: exportMime };
        }
        return { content: await downloadPublicFile(apiKey, f.externalId, rk) };
      },
    };
  }

  if (kind === 'onedrive' || kind === 'sharepoint') {
    const token = await connectionService.getAccessToken(tenantId, userId, 'microsoft', accountEmail);
    if (!token) throw new Error('Akun Microsoft belum terhubung (hubungkan di Knowledge → Connect Microsoft)');

    // Jalur BARU: URL situs SharePoint atau tautan berbagi. Keduanya bermuara
    // ke (driveId, itemId) lalu ditelusuri rekursif — sub-sub-folder ikut.
    const url = config.siteUrl ? String(config.siteUrl).trim() : '';
    if (url) {
      const target = isSharingLink(url)
        ? await resolveShareLink(token, url)
        : await resolveSiteFolder(token, parseSharePointSiteUrl(url));
      const raw = await crawlDriveFolder(token, target, { maxFiles: MAX_LIST_FILES });
      return {
        files: raw.map((it) => ({
          externalId: it.id, name: it.name,
          version: it.eTag ?? it.lastModifiedDateTime ?? '',
        })),
        truncated: raw.length >= MAX_LIST_FILES,
        async fetch(f) {
          return { content: await downloadDriveItem(token, target.driveId, f.externalId) };
        },
      };
    }

    // Jalur lama: OneDrive pribadi (/me/drive) berdasarkan path.
    const raw = await crawlUserSharepoint(token, {
      scope,
      folderPath: config.folderPath ? String(config.folderPath) : undefined,
      maxFiles: MAX_LIST_FILES,
    });
    return {
      files: raw.map((it) => ({
        externalId: it.id, name: it.name,
        version: it.eTag ?? it.lastModifiedDateTime ?? '',
      })),
      truncated: raw.length >= MAX_LIST_FILES,
      async fetch(f) {
        return { content: await downloadUserSharepointFile(token, f.externalId) };
      },
    };
  }

  throw new Error(`Jenis sumber belum didukung sync: ${kind}`);
}

/* ── ekstraksi teks ───────────────────────────────────────────────── */

const TEXT_EXT = ['.txt', '.md', '.markdown', '.csv', '.json', '.log', '.yaml', '.yml'];
const DOC_EXT = ['.html', '.htm', '.pdf', '.docx'];

/**
 * Bisakah file ini jadi teks? Dipakai SEBELUM download agar format tak
 * didukung (gambar, XLSX, Forms, …) tidak pernah diunduh percuma.
 */
export function isExtractable(name: string, mimeType?: string): boolean {
  if (isGoogleNative(mimeType)) return googleNativeExportMime(mimeType) !== null;
  if (mimeType?.startsWith('text/')) return true;
  const lower = name.toLowerCase();
  return [...TEXT_EXT, ...DOC_EXT].some((e) => lower.endsWith(e));
}

/**
 * name+buffer → teks, atau null bila format tak didukung (dihitung skipped).
 * PDF via pdf-parse, DOCX via mammoth (dynamic import — modul berat hanya
 * dimuat saat dibutuhkan). Parser gagal ⇒ null, JANGAN mematikan sync.
 */
export async function extractText(name: string, buf: Buffer, mime?: string): Promise<string | null> {
  // Konten yang sudah berupa teks (mis. hasil export Google Docs/Sheets → text/plain,
  // text/csv). Buffer kosong (native tak didukung / gagal ambil) → null = skipped.
  if (mime && mime.startsWith('text/')) {
    const t = buf.toString('utf8').trim();
    return t || null;
  }

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
