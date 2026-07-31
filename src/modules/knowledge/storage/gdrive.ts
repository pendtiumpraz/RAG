import { promises as fs } from 'node:fs';
import path from 'node:path';
import { google } from 'googleapis';
import { oauthAppService } from '@/modules/auth/oauth-app.service';

/**
 * Two distinct Google Drive roles in this system:
 *
 *  1. SUPERADMIN drive (service account / shared drive) — hosts the
 *     embedding MODEL files. Shared infra, read by all tenants.
 *     → downloadSuperadminDriveFile()
 *
 *  2. PER-USER drive (OAuth per tenant user) — the user's OWN documents
 *     that become that user's chatbot knowledge base. Never shared.
 *     → listUserDriveFiles() / downloadUserDriveFile()
 */

function superadminDrive() {
  // Service-account auth against the superadmin's shared Drive folder.
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    // credentials taken from GOOGLE_APPLICATION_CREDENTIALS or ADC
  });
  return google.drive({ version: 'v3', auth });
}

export async function downloadSuperadminDriveFile(fileName: string, destDir: string) {
  const drive = superadminDrive();
  const folderId = process.env.SUPERADMIN_GDRIVE_FOLDER_ID!;
  const list = await drive.files.list({
    q: `'${folderId}' in parents and name = '${fileName}' and trashed = false`,
    fields: 'files(id,name)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  const file = list.data.files?.[0];
  if (!file?.id) throw new Error(`Model file not found on superadmin Drive: ${fileName}`);

  const res = await drive.files.get(
    { fileId: file.id, alt: 'media', supportsAllDrives: true },
    { responseType: 'arraybuffer' },
  );
  await fs.writeFile(path.join(destDir, fileName), Buffer.from(res.data as ArrayBuffer));
}

/**
 * Per-user OAuth client from stored tokens (see auth flow).
 *
 * KREDENSIALNYA DARI DATABASE, sama seperti alur connect dan refresh. Versi
 * sebelumnya membaca process.env langsung, padahal sejak D10 kredensial
 * aplikasi OAuth hidup di tabel `oauth_apps` dan env hanya cadangan. Efeknya
 * halus tapi nyata: googleapis memakai clientId/secret ini untuk memperbarui
 * token SENDIRI di tengah panggilan panjang, dan dengan keduanya undefined
 * pembaruan itu gagal diam-diam — sync berhenti di tengah jalan tanpa sebab
 * yang terlihat pada korpus yang butuh lebih dari satu jam.
 */
export async function userDrive(accessToken: string, refreshToken?: string) {
  const app = await oauthAppService.get('google');
  const oauth = new google.auth.OAuth2(app?.clientId, app?.clientSecret);
  oauth.setCredentials({ access_token: accessToken, refresh_token: refreshToken });
  return google.drive({ version: 'v3', auth: oauth });
}

export async function listUserDriveFiles(accessToken: string, folderId: string) {
  const drive = await userDrive(accessToken);
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: 'files(id,name,mimeType,modifiedTime,size)',
    pageSize: 1000,
  });
  return res.data.files ?? [];
}

export interface DriveFile {
  id: string; name: string; mimeType?: string; parents?: string[];
  /** RFC-3339; dipakai sebagai penanda versi utk delta sync. */
  modifiedTime?: string;
  /** Byte, sebagai STRING (Drive mengirim int64 begitu). Kosong untuk
   *  dokumen Google native yang tak punya ukuran biner. */
  size?: string;
}
const FOLDER_MIME = 'application/vnd.google-apps.folder';

/**
 * Crawl file Drive user.
 *  • scope 'all'    → SELURUH Drive (semua file yang bisa diakses, paginated).
 *  • scope 'folder' → satu folder + REKURSIF ke semua subfolder.
 * File Google-native (Docs/Sheets/Slides) IKUT terdaftar di sini; pengambilannya
 * lewat export (lihat exportUserDriveFile), bukan download biner.
 */
export async function crawlUserDrive(
  accessToken: string,
  opts: { scope: 'all' | 'folder'; folderId?: string; maxFiles?: number },
): Promise<DriveFile[]> {
  const drive = await userDrive(accessToken);
  const max = opts.maxFiles ?? 2000;
  const out: DriveFile[] = [];

  if (opts.scope === 'all') {
    let pageToken: string | undefined;
    do {
      const res = await drive.files.list({
        q: `trashed = false and mimeType != '${FOLDER_MIME}'`,
        fields: 'nextPageToken, files(id,name,mimeType,modifiedTime,size)',
        pageSize: 1000, pageToken,
        spaces: 'drive',
      });
      for (const f of res.data.files ?? []) if (f.id && f.name) out.push(f as DriveFile);
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken && out.length < max);
    return out.slice(0, max);
  }

  // rekursif dari folderId
  const queue: string[] = [opts.folderId || 'root'];
  const seen = new Set<string>();
  while (queue.length && out.length < max) {
    const parent = queue.shift()!;
    if (seen.has(parent)) continue; seen.add(parent);
    let pageToken: string | undefined;
    do {
      const res = await drive.files.list({
        q: `'${parent}' in parents and trashed = false`,
        fields: 'nextPageToken, files(id,name,mimeType,modifiedTime,size)',
        pageSize: 1000, pageToken,
      });
      for (const f of res.data.files ?? []) {
        if (!f.id || !f.name) continue;
        if (f.mimeType === FOLDER_MIME) queue.push(f.id);
        else out.push(f as DriveFile);
      }
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken && out.length < max);
  }
  return out.slice(0, max);
}

/**
 * Metadata per-ID — jalur listing utk mode 'picker' (D10): source menyimpan
 * daftar id berkas yang dipilih user di Google Picker, dan dgn scope
 * drive.file kita memang tak bisa list apa pun — hanya get per id.
 *
 * Berkas yang 404 (dihapus user / grant dicabut) TIDAK melempar: ia sekadar
 * hilang dari hasil, sehingga planDelta menaruhnya di `remove` — sama seperti
 * berkas lenyap pada listing folder biasa.
 */
export async function getUserDriveFilesMeta(
  accessToken: string, fileIds: string[],
): Promise<DriveFile[]> {
  const drive = await userDrive(accessToken);
  const out: DriveFile[] = [];
  for (const fileId of fileIds) {
    try {
      const res = await drive.files.get({ fileId, fields: 'id,name,mimeType,modifiedTime' });
      const f = res.data;
      if (f.id && f.name) out.push(f as DriveFile);
    } catch (err: unknown) {
      const code = (err as { code?: number; response?: { status?: number } });
      const status = code.code ?? code.response?.status;
      if (status === 404 || status === 403) continue; // hilang/grant dicabut → dianggap terhapus
      throw err; // error lain (token, jaringan) tetap menghentikan sync — jangan salah hapus
    }
  }
  return out;
}

export async function downloadUserDriveFile(accessToken: string, fileId: string): Promise<Buffer> {
  const drive = await userDrive(accessToken);
  const res = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer' },
  );
  return Buffer.from(res.data as ArrayBuffer);
}

/* ── Google-native (Docs Editors) → export teks ───────────────────────
   File Docs/Sheets/Slides TIDAK bisa diunduh via alt=media (403). Harus
   di-export ke format lain. Kita ambil sebagai teks agar langsung masuk
   pipeline embedding.
   CATATAN Sheets: export text/csv hanya mengambil SHEET PERTAMA — batas
   Drive export, dilaporkan apa adanya (bukan diam-diam memangkas). */

const GOOGLE_NATIVE_EXPORT: Record<string, string> = {
  'application/vnd.google-apps.document': 'text/plain',
  'application/vnd.google-apps.spreadsheet': 'text/csv',
  'application/vnd.google-apps.presentation': 'text/plain',
};

/** true bila mimeType adalah file Docs Editors (document/spreadsheet/dll). */
export function isGoogleNative(mimeType?: string): boolean {
  return !!mimeType && mimeType.startsWith('application/vnd.google-apps.');
}

/** Target MIME export utk file native yang didukung, atau null bila tak didukung
 *  (mis. Forms, Drawing, Site, Script). */
export function googleNativeExportMime(mimeType?: string): string | null {
  if (!mimeType) return null;
  return GOOGLE_NATIVE_EXPORT[mimeType] ?? null;
}

/** Export file Google-native (Docs/Sheets/Slides) sebagai teks. */
export async function exportUserDriveFile(
  accessToken: string, fileId: string, exportMime: string,
): Promise<Buffer> {
  const drive = await userDrive(accessToken);
  const res = await drive.files.export(
    { fileId, mimeType: exportMime },
    { responseType: 'arraybuffer' },
  );
  return Buffer.from(res.data as ArrayBuffer);
}

/* ── write-back vault `_nalar-memory/` ke Drive user ──────────────────
   Pakai fetch langsung ke REST Drive v3 (upload multipart/media) —
   lebih ringkas daripada client googleapis utk kasus upload. */

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

async function driveFetch(token: string, url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`Drive API ${res.status}: ${await res.text().catch(() => '')}`);
  return res.json();
}

/** Cari/buat folder bernama `name` di root Drive user. Return folderId. */
export async function ensureUserDriveFolder(token: string, name: string): Promise<string> {
  const q = encodeURIComponent(
    `name = '${name.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and 'root' in parents and trashed = false`);
  const found = await driveFetch(token, `${DRIVE_API}/files?q=${q}&fields=files(id)`);
  if (found.files?.[0]?.id) return found.files[0].id;
  const created = await driveFetch(token, `${DRIVE_API}/files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: ['root'] }),
  });
  return created.id;
}

/** Buat/overwrite file teks bernama `name` di dalam folder. */
export async function upsertUserDriveTextFile(
  token: string, folderId: string, name: string, content: string,
): Promise<void> {
  const q = encodeURIComponent(
    `name = '${name.replace(/'/g, "\\'")}' and '${folderId}' in parents and trashed = false`);
  const found = await driveFetch(token, `${DRIVE_API}/files?q=${q}&fields=files(id)`);

  if (found.files?.[0]?.id) {
    // update konten (media upload)
    await driveFetch(token, `${DRIVE_UPLOAD}/files/${found.files[0].id}?uploadType=media`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'text/markdown' },
      body: content,
    });
    return;
  }
  // create baru (multipart: metadata + media)
  const boundary = 'nalar-vault-' + Date.now();
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify({ name, parents: [folderId], mimeType: 'text/markdown' }) +
    `\r\n--${boundary}\r\nContent-Type: text/markdown\r\n\r\n${content}\r\n--${boundary}--`;
  await driveFetch(token, `${DRIVE_UPLOAD}/files?uploadType=multipart`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
}
