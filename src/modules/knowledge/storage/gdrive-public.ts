/**
 * Google Drive PUBLIK — tanpa OAuth, hanya API key.
 *
 * Drive API v3 melayani `files.list`/`files.get` dengan API key biasa untuk
 * berkas yang dibagikan "Anyone with the link". Tak ada consent screen, tak
 * ada token pengguna, dan karena itu **tak tersentuh verifikasi CASA** — inilah
 * satu-satunya jalur yang bisa menarik SELURUH isi sebuah folder (rekursif
 * sampai sub-sub-folder) tanpa scope `drive.readonly` yang restricted.
 *
 * Batas yang harus diingat (dan disampaikan apa adanya ke pengguna):
 *  • Folder wajib publik sungguhan. Tautan "hanya orang di organisasi ini"
 *    akan menjawab 404 — dari sisi API ia sama saja dengan tidak ada.
 *  • Read-only. Tak ada write-back ke folder publik.
 *  • Sebagian berkas/folder lama menuntut `resourceKey` tambahan (aturan
 *    keamanan Google 2021). Kuncinya ada di URL berbagi itu sendiri, jadi
 *    kita ikut mengurainya alih-alih menyerah dengan 404 yang membingungkan.
 */

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

export interface PublicDriveFile {
  id: string; name: string; mimeType?: string; modifiedTime?: string;
  /** resourceKey milik berkas ini — wajib ikut saat mengunduh bila ada. */
  resourceKey?: string;
}

export interface ParsedFolderUrl {
  folderId: string;
  /** dari query `?resourcekey=…` pada URL berbagi */
  resourceKey?: string;
}

/**
 * Menguraikan URL berbagi Google Drive menjadi folder id.
 *
 * Menerima yang biasa ditempel orang:
 *   https://drive.google.com/drive/folders/<ID>?usp=sharing
 *   https://drive.google.com/drive/u/0/folders/<ID>
 *   https://drive.google.com/open?id=<ID>
 *   https://drive.google.com/drive/folders/<ID>?resourcekey=<KEY>
 *   <ID>                                  (id telanjang — dibiarkan lewat)
 *
 * Melempar dengan pesan yang bisa dibaca pengguna, bukan mengembalikan null:
 * kesalahan tempel-menempel URL adalah kegagalan paling sering di alur ini,
 * dan pesan "URL tidak valid" tanpa penjelasan tak menolong siapa pun.
 */
export function parseDriveFolderUrl(input: string): ParsedFolderUrl {
  const raw = input.trim();
  if (!raw) throw new Error('URL folder Google Drive belum diisi.');

  // id telanjang: cukup panjang & tanpa karakter URL
  if (/^[A-Za-z0-9_-]{15,}$/.test(raw)) return { folderId: raw };

  let url: URL;
  try { url = new URL(raw); } catch {
    throw new Error('Bukan URL yang sah. Tempel tautan berbagi folder Drive, mis. https://drive.google.com/drive/folders/1A2b3C…');
  }
  if (!/(^|\.)google\.com$/.test(url.hostname)) {
    throw new Error('URL ini bukan tautan Google Drive.');
  }

  const resourceKey = url.searchParams.get('resourcekey')
    ?? url.searchParams.get('resourceKey') ?? undefined;

  const byPath = url.pathname.match(/\/folders\/([A-Za-z0-9_-]+)/);
  if (byPath) return { folderId: byPath[1], resourceKey: resourceKey || undefined };

  const byQuery = url.searchParams.get('id');
  if (byQuery) return { folderId: byQuery, resourceKey: resourceKey || undefined };

  // Tautan berkas tunggal jelas berbeda maksudnya — sebut spesifik.
  if (/\/file\/d\//.test(url.pathname)) {
    throw new Error('Itu tautan satu BERKAS, bukan folder. Buka foldernya lalu salin URL folder tersebut.');
  }
  throw new Error('Tak menemukan id folder di URL itu. Pastikan tautannya berbentuk /drive/folders/<id>.');
}

async function driveGet(
  path: string, apiKey: string, params: Record<string, string>, resourceKeys?: string,
): Promise<Response> {
  const qs = new URLSearchParams({ ...params, key: apiKey });
  const res = await fetch(`${DRIVE_API}${path}?${qs}`, {
    // Header inilah cara Drive menerima resourceKey; menaruhnya di query
    // tidak berlaku untuk files.list.
    headers: resourceKeys ? { 'X-Goog-Drive-Resource-Keys': resourceKeys } : {},
  });
  return res;
}

/** Menerjemahkan galat Drive jadi kalimat yang menunjuk sebabnya. */
async function explain(res: Response, folderId: string): Promise<never> {
  const body = await res.text().catch(() => '');
  if (res.status === 404) {
    throw new Error(
      `Folder tak terlihat oleh publik (404). Buka folder di Drive → Bagikan → ` +
      `"Siapa saja yang memiliki link" → Pelihat. Tautan "hanya orang di organisasi" tidak bisa dipakai. (id: ${folderId})`);
  }
  if (res.status === 403) {
    const denied = /accessNotConfigured|API has not been used/i.test(body)
      ? 'Google Drive API belum diaktifkan di project kunci ini.'
      : /keyInvalid|API key not valid/i.test(body)
      ? 'API key tidak sah.'
      : /rateLimitExceeded|quota/i.test(body)
      ? 'Kuota API key habis untuk sementara.'
      : 'Akses ditolak.';
    throw new Error(`${denied} (403)`);
  }
  throw new Error(`Drive API ${res.status}: ${body.slice(0, 200)}`);
}

/**
 * Menelusuri folder publik secara REKURSIF — seluruh sub-sub-folder ikut.
 *
 * Antrean BFS, sama bentuknya dengan `crawlUserDrive` agar perilaku kedua
 * jalur tak menyimpang. `seen` mencegah putaran tak berujung pada folder
 * yang saling menunjuk (pintasan Drive bisa membuat siklus).
 */
export async function crawlPublicFolder(
  apiKey: string,
  root: ParsedFolderUrl,
  opts: { maxFiles?: number } = {},
): Promise<PublicDriveFile[]> {
  const max = opts.maxFiles ?? 300;
  const out: PublicDriveFile[] = [];
  const queue: Array<{ id: string; key?: string }> = [{ id: root.folderId, key: root.resourceKey }];
  const seen = new Set<string>();
  /** resourceKey terkumpul sepanjang penelusuran, sesuai format header Drive. */
  const keys = new Map<string, string>();
  if (root.resourceKey) keys.set(root.folderId, root.resourceKey);

  let first = true;
  while (queue.length && out.length < max) {
    const parent = queue.shift()!;
    if (seen.has(parent.id)) continue;
    seen.add(parent.id);

    let pageToken: string | undefined;
    do {
      const params: Record<string, string> = {
        q: `'${parent.id}' in parents and trashed = false`,
        fields: 'nextPageToken, files(id,name,mimeType,modifiedTime,resourceKey)',
        pageSize: '1000',
        supportsAllDrives: 'true',
        includeItemsFromAllDrives: 'true',
      };
      if (pageToken) params.pageToken = pageToken;
      const headerKeys = [...keys.entries()].map(([id, k]) => `${id}/${k}`).join(',');
      const res = await driveGet('/files', apiKey, params, headerKeys || undefined);

      // Kegagalan di folder AKAR = konfigurasi salah → hentikan & jelaskan.
      // Kegagalan di subfolder = satu cabang tak terbaca → lanjutkan, sisanya
      // tetap berguna. Menggagalkan seluruh sync karena satu subfolder aneh
      // akan membuat sumber yang 95% sehat tampak mati total.
      if (!res.ok) {
        if (first) await explain(res, parent.id);
        break;
      }
      first = false;

      const json = await res.json() as {
        nextPageToken?: string;
        files?: Array<PublicDriveFile & { resourceKey?: string }>;
      };
      for (const f of json.files ?? []) {
        if (!f.id || !f.name) continue;
        if (f.resourceKey) keys.set(f.id, f.resourceKey);
        if (f.mimeType === FOLDER_MIME) queue.push({ id: f.id, key: f.resourceKey });
        else out.push(f);
        if (out.length >= max) break;
      }
      pageToken = json.nextPageToken;
    } while (pageToken && out.length < max);
  }
  return out.slice(0, max);
}

/** Unduh berkas biner publik. */
export async function downloadPublicFile(
  apiKey: string, fileId: string, resourceKey?: string,
): Promise<Buffer> {
  const res = await driveGet(`/files/${fileId}`, apiKey,
    { alt: 'media', supportsAllDrives: 'true' },
    resourceKey ? `${fileId}/${resourceKey}` : undefined);
  if (!res.ok) await explain(res, fileId);
  return Buffer.from(await res.arrayBuffer());
}

/** Export berkas Google-native (Docs/Sheets/Slides) publik sebagai teks. */
export async function exportPublicFile(
  apiKey: string, fileId: string, exportMime: string, resourceKey?: string,
): Promise<Buffer> {
  const res = await driveGet(`/files/${fileId}/export`, apiKey,
    { mimeType: exportMime },
    resourceKey ? `${fileId}/${resourceKey}` : undefined);
  if (!res.ok) await explain(res, fileId);
  return Buffer.from(await res.arrayBuffer());
}

/** Nama folder — dipakai UI sebagai label sumber & untuk memastikan URL sah. */
export async function getPublicFolderName(
  apiKey: string, root: ParsedFolderUrl,
): Promise<string> {
  const res = await driveGet(`/files/${root.folderId}`, apiKey,
    { fields: 'name,mimeType', supportsAllDrives: 'true' },
    root.resourceKey ? `${root.folderId}/${root.resourceKey}` : undefined);
  if (!res.ok) await explain(res, root.folderId);
  const j = await res.json() as { name?: string; mimeType?: string };
  if (j.mimeType && j.mimeType !== FOLDER_MIME) {
    throw new Error('Tautan itu menunjuk sebuah berkas, bukan folder.');
  }
  return j.name ?? 'Folder Drive publik';
}
