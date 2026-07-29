/**
 * SHAREPOINT SUNGGUHAN — situs, document library, dan tautan berbagi.
 *
 * Sebelum ini jenis sumber `sharepoint` hanyalah alias `/me/drive`, yaitu
 * OneDrive PRIBADI pengguna. Document library sebuah situs tim, atau folder
 * yang dibagikan kepada pengguna, sama sekali tak terjangkau — labelnya
 * menjanjikan sesuatu yang belum ada isinya. Modul ini yang mengisinya.
 *
 * Tiga bentuk masukan, semuanya bermuara ke pasangan (driveId, itemId) lalu
 * ditelusuri rekursif oleh `crawlDriveFolder()`:
 *   • tautan berbagi  → /shares/{token}/driveItem
 *   • URL situs       → /sites/{host}:{path} → /drives
 *   • /me/drive       → tetap di sharepoint.ts (perilaku lama)
 *
 * Semuanya TETAP menuntut OAuth Microsoft. Graph tak punya padanan "API key
 * untuk tautan publik" seperti Google Drive: endpoint /shares selalu meminta
 * token, bahkan untuk tautan yang sudah dibagikan ke publik.
 */
import type { GraphItem } from './sharepoint';

const GRAPH = 'https://graph.microsoft.com/v1.0';

/** Panggilan Graph yang menerjemahkan galat jadi sebab yang bisa dibaca. */
async function graphOrExplain(token: string, url: string, what: string): Promise<unknown> {
  const res = await fetch(`${GRAPH}${url}`, { headers: { Authorization: `Bearer ${token}` } });
  if (res.ok) return res.json();
  const body = await res.text().catch(() => '');
  if (res.status === 401) throw new Error('Token Microsoft kedaluwarsa — sambungkan ulang akunnya.');
  if (res.status === 403) throw new Error(`Akun ini tak punya izin membuka ${what}. Minta akses ke pemilik situs.`);
  if (res.status === 404) throw new Error(`${what} tak ditemukan. Periksa URL-nya, dan pastikan akun yang tersambung memang punya akses.`);
  throw new Error(`Graph ${res.status} saat membuka ${what}: ${body.slice(0, 160)}`);
}

/**
 * Menyandikan URL berbagi jadi token `/shares/{…}` sesuai aturan Graph:
 * base64url tanpa padding, diawali `u!`.
 */
export function encodeSharingUrl(url: string): string {
  const b64 = Buffer.from(url.trim(), 'utf8').toString('base64');
  return `u!${b64.replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-')}`;
}

/** true bila URL berbentuk tautan berbagi SharePoint/OneDrive (`/:f:/`, `1drv.ms`, …). */
export function isSharingLink(url: string): boolean {
  return /\/:[a-z]:\//i.test(url) || /1drv\.ms/i.test(url);
}

export interface DriveTarget { driveId: string; itemId: string; name: string }

/** Tautan berbagi → (driveId, itemId). Berlaku untuk folder maupun library. */
export async function resolveShareLink(token: string, url: string): Promise<DriveTarget> {
  const j = await graphOrExplain(
    token,
    `/shares/${encodeSharingUrl(url)}/driveItem?$select=id,name,parentReference,folder`,
    'tautan berbagi itu',
  ) as { id: string; name: string; folder?: unknown; parentReference?: { driveId?: string } };

  const driveId = j.parentReference?.driveId;
  if (!driveId) throw new Error('Tautan itu tak menunjuk ke drive mana pun.');
  if (!j.folder) {
    throw new Error('Tautan itu menunjuk satu BERKAS, bukan folder. Bagikan foldernya lalu salin tautan folder tersebut.');
  }
  return { driveId, itemId: j.id, name: j.name };
}

export interface ParsedSiteUrl { hostname: string; sitePath: string; folderPath?: string }

/**
 * Menguraikan URL situs SharePoint.
 *   https://contoso.sharepoint.com/sites/Marketing
 *   https://contoso.sharepoint.com/sites/Marketing/Shared Documents/Kebijakan
 *   https://contoso.sharepoint.com/teams/Legal
 */
export function parseSharePointSiteUrl(input: string): ParsedSiteUrl {
  const raw = input.trim();
  if (!raw) throw new Error('URL situs SharePoint belum diisi.');
  let url: URL;
  try { url = new URL(raw); } catch {
    throw new Error('Bukan URL yang sah. Contoh: https://perusahaan.sharepoint.com/sites/NamaSitus');
  }
  if (!/sharepoint\.com$/i.test(url.hostname)) {
    throw new Error('Host itu bukan SharePoint (harus berakhiran sharepoint.com).');
  }
  const parts = decodeURIComponent(url.pathname).split('/').filter(Boolean);
  const i = parts.findIndex((p) => p === 'sites' || p === 'teams');
  if (i === -1 || !parts[i + 1]) {
    throw new Error('URL itu tak memuat /sites/<nama> atau /teams/<nama>.');
  }
  return {
    hostname: url.hostname,
    sitePath: `/${parts[i]}/${parts[i + 1]}`,
    folderPath: parts.slice(i + 2).join('/') || undefined,
  };
}

/** Document library sebuah situs — dipakai UI agar pengguna bisa memilih. */
export async function listSiteDrives(
  token: string, site: ParsedSiteUrl,
): Promise<Array<{ id: string; name: string }>> {
  const s = await graphOrExplain(token, `/sites/${site.hostname}:${site.sitePath}?$select=id`, 'situs itu') as { id: string };
  const d = await graphOrExplain(token, `/sites/${s.id}/drives?$select=id,name`, 'daftar library situs itu') as {
    value?: Array<{ id: string; name: string }>;
  };
  return d.value ?? [];
}

/**
 * URL situs → (driveId, itemId) siap ditelusuri.
 *
 * Bila URL memuat path folder, segmen pertamanya dicocokkan dulu dengan nama
 * library. Tanpa pencocokan itu, "Shared Documents/Kebijakan" akan dicari
 * sebagai folder bernama "Shared Documents" DI DALAM library Documents — dan
 * selalu 404, persis kesalahan yang paling sering bikin orang menyerah.
 */
export async function resolveSiteFolder(token: string, site: ParsedSiteUrl): Promise<DriveTarget> {
  const drives = await listSiteDrives(token, site);
  if (!drives.length) throw new Error('Situs itu tak punya document library yang bisa dibaca akun ini.');

  let drive = drives[0];
  let inner = site.folderPath ?? '';
  if (inner) {
    const [head, ...rest] = inner.split('/');
    const match = drives.find((d) =>
      d.name.toLowerCase() === head.toLowerCase()
      // "Shared Documents" di URL = library yang bernama "Documents"
      || (head.toLowerCase() === 'shared documents' && d.name.toLowerCase() === 'documents'));
    if (match) { drive = match; inner = rest.join('/'); }
  }

  const item = await graphOrExplain(
    token,
    inner ? `/drives/${drive.id}/root:/${encodeURI(inner)}?$select=id,name`
          : `/drives/${drive.id}/root?$select=id,name`,
    inner ? `folder "${inner}"` : `library "${drive.name}"`,
  ) as { id: string; name: string };

  return { driveId: drive.id, itemId: item.id, name: item.name || drive.name };
}

/**
 * Telusur REKURSIF dari (driveId, itemId) — seluruh sub-sub-folder ikut.
 *
 * `seen` menjaga dari siklus: SharePoint mengizinkan pintasan yang menunjuk
 * balik ke leluhurnya, dan tanpa penjaga ini crawl takkan pernah berhenti.
 */
export async function crawlDriveFolder(
  token: string, target: DriveTarget, opts: { maxFiles?: number } = {},
): Promise<GraphItem[]> {
  const max = opts.maxFiles ?? 2000;
  const out: GraphItem[] = [];
  const queue: string[] = [`/drives/${target.driveId}/items/${target.itemId}/children`];
  const seen = new Set<string>([target.itemId]);

  while (queue.length && out.length < max) {
    let next: string | null = queue.shift()!;
    while (next && out.length < max) {
      const page = await graphOrExplain(token, next, 'isi folder') as {
        value?: Array<GraphItem & { id: string }>; '@odata.nextLink'?: string;
      };
      for (const it of page.value ?? []) {
        if (it.folder) {
          if (seen.has(it.id)) continue;
          seen.add(it.id);
          queue.push(`/drives/${target.driveId}/items/${it.id}/children`);
        } else if (it.file) out.push(it);
        if (out.length >= max) break;
      }
      const link = page['@odata.nextLink'];
      next = link ? link.replace(GRAPH, '') : null;
    }
  }
  return out.slice(0, max);
}

/** Unduh berkas dari drive mana pun — bukan hanya /me/drive. */
export async function downloadDriveItem(
  token: string, driveId: string, itemId: string,
): Promise<Buffer> {
  const res = await fetch(`${GRAPH}/drives/${driveId}/items/${itemId}/content`,
    { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Gagal mengunduh berkas (${res.status}).`);
  return Buffer.from(await res.arrayBuffer());
}
