import { promises as fs } from 'node:fs';
import path from 'node:path';
import { google } from 'googleapis';

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

/** Per-user OAuth client from stored tokens (see auth flow). */
export function userDrive(accessToken: string, refreshToken?: string) {
  const oauth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  );
  oauth.setCredentials({ access_token: accessToken, refresh_token: refreshToken });
  return google.drive({ version: 'v3', auth: oauth });
}

export async function listUserDriveFiles(accessToken: string, folderId: string) {
  const drive = userDrive(accessToken);
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: 'files(id,name,mimeType,modifiedTime)',
    pageSize: 1000,
  });
  return res.data.files ?? [];
}

export async function downloadUserDriveFile(accessToken: string, fileId: string): Promise<Buffer> {
  const drive = userDrive(accessToken);
  const res = await drive.files.get(
    { fileId, alt: 'media' },
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
