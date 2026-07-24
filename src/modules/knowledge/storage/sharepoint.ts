import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ConfidentialClientApplication } from '@azure/msal-node';

/**
 * SharePoint / OneDrive via Microsoft Graph. Mirrors gdrive.ts:
 *  - superadmin drive hosts the embedding model files
 *  - per-user drives supply that user's own knowledge base
 */

async function appToken(): Promise<string> {
  const cca = new ConfidentialClientApplication({
    auth: {
      clientId: process.env.MS_CLIENT_ID!,
      authority: `https://login.microsoftonline.com/${process.env.MS_TENANT_ID}`,
      clientSecret: process.env.MS_CLIENT_SECRET!,
    },
  });
  const res = await cca.acquireTokenByClientCredential({
    scopes: ['https://graph.microsoft.com/.default'],
  });
  if (!res?.accessToken) throw new Error('Failed to acquire Graph app token');
  return res.accessToken;
}

async function graph(token: string, url: string, responseType: 'json' | 'buffer' = 'json') {
  const res = await fetch(`https://graph.microsoft.com/v1.0${url}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Graph ${url} failed: ${res.status}`);
  return responseType === 'json' ? res.json() : Buffer.from(await res.arrayBuffer());
}

export async function downloadSuperadminSharepointFile(fileName: string, destDir: string) {
  const token = await appToken();
  const driveId = process.env.SUPERADMIN_SHAREPOINT_DRIVE_ID!;
  const buf = (await graph(
    token,
    `/drives/${driveId}/root:/models/${fileName}:/content`,
    'buffer',
  )) as Buffer;
  await fs.writeFile(path.join(destDir, fileName), buf);
}

/** Per-user list/download uses the user's delegated Graph token. */
export async function listUserSharepointFiles(userToken: string, folderPath: string) {
  const json = (await graph(userToken, `/me/drive/root:/${folderPath}:/children`)) as {
    value: Array<{ id: string; name: string; file?: unknown }>;
  };
  return json.value ?? [];
}

export async function downloadUserSharepointFile(userToken: string, itemId: string): Promise<Buffer> {
  return (await graph(userToken, `/me/drive/items/${itemId}/content`, 'buffer')) as Buffer;
}

export interface GraphItem { id: string; name: string; file?: unknown; folder?: unknown }

/**
 * Crawl OneDrive/SharePoint user via Microsoft Graph.
 *  • scope 'all'    → SELURUH drive (rekursif dari root).
 *  • scope 'folder' → satu path + REKURSIF ke subfolder.
 */
export async function crawlUserSharepoint(
  userToken: string,
  opts: { scope: 'all' | 'folder'; folderPath?: string; maxFiles?: number },
): Promise<GraphItem[]> {
  const max = opts.maxFiles ?? 2000;
  const out: GraphItem[] = [];
  // endpoint children utk root/path
  const rootEndpoint = opts.scope === 'all' || !opts.folderPath
    ? '/me/drive/root/children'
    : `/me/drive/root:/${opts.folderPath}:/children`;

  const queue: string[] = [rootEndpoint];
  while (queue.length && out.length < max) {
    const endpoint = queue.shift()!;
    let next: string | null = endpoint;
    while (next && out.length < max) {
      const page = (await graph(userToken, next)) as { value: Array<GraphItem & { id: string }>; '@odata.nextLink'?: string };
      for (const it of page.value ?? []) {
        if (it.folder) queue.push(`/me/drive/items/${it.id}/children`);
        else if (it.file) out.push(it);
      }
      const link = page['@odata.nextLink'];
      next = link ? link.replace('https://graph.microsoft.com/v1.0', '') : null;
    }
  }
  return out.slice(0, max);
}
