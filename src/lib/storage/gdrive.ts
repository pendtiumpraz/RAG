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
