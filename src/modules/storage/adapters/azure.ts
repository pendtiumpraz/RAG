/**
 * ADAPTER AZURE BLOB STORAGE.
 *
 * Uji koneksi memakai penandatanganan SharedKey (API versi 2021-12-02) dengan
 * crypto bawaan Node — TANPA SDK. Kredensial: nama akun + kunci akun
 * (base64) dan container. Cukup untuk membuktikan kunci benar dan akun
 * terjangkau; peran terhadap container diuji per-unggahan.
 */
import { createHmac } from 'node:crypto';
import {
  daftarkanPenyedia, type KredensialStorage, type StorageAdapter,
} from '../adapter';

const VERSI = '2021-12-02';

function cekKred(kred: KredensialStorage): void {
  if (!kred.azureAccountName) throw new Error('Nama akun Azure wajib diisi.');
  if (!kred.azureAccountKey) throw new Error('Kunci akun Azure wajib diisi.');
}

/** Tanda tangan SharedKey utk permintaan GET ke akun Blob. */
function tandaTanganSharedKey(
  account: string, kunciB64: string, stringToSign: string,
): string {
  const mac = createHmac('sha256', Buffer.from(kunciB64, 'base64'))
    .update(stringToSign, 'utf8').digest('base64');
  return `SharedKey ${account}:${mac}`;
}

export const azureAdapter: StorageAdapter = {
  provider: 'azure',
  label: 'Azure Blob Storage',
  wajib: [
    { kunci: 'azureAccountName', label: 'Nama akun penyimpanan' },
    { kunci: 'azureAccountKey', label: 'Kunci akun' },
    { kunci: 'azureContainer', label: 'Container' },
  ],
  scopingDari(kred) {
    return {
      account: kred.azureAccountName,
      container: kred.azureContainer || null,
    };
  },
  validasi(kred) {
    cekKred(kred);
    if (!kred.azureContainer) throw new Error('Container wajib diisi.');
  },
  async uji(kred) {
    this.validasi(kred);
    const account = kred.azureAccountName!;
    const app = account.endsWith('.blob.core.windows.net') ? account : `${account}.blob.core.windows.net`;
    const host = app.indexOf('.') < 0 ? `${account}.blob.core.windows.net` : app;
    const xMsDate = new Date().toUTCString();
    const canonical = `GET\n\n\n\n\n\n\n\n\n\n\nx-ms-date:${xMsDate}\nx-ms-version:${VERSI}\n/${account}/\ncomp:list&restype:service`;
    const auth = tandaTanganSharedKey(account, kred.azureAccountKey!, canonical);

    const res = await fetch(`https://${host}/?comp=list&restype=service`, {
      headers: {
        'x-ms-date': xMsDate,
        'x-ms-version': VERSI,
        Authorization: auth,
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const teks = await res.text().catch(() => '');
      throw new Error(`Azure menjawab ${res.status}${teks ? `: ${teks.slice(0, 120)}` : ''}`);
    }
    return { ok: true, detail: `Terhubung ke ${host}` };
  },
  async simpan(kred, c) {
    this.validasi(kred);
    const account = kred.azureAccountName!;
    const host = account.endsWith('.blob.core.windows.net')
      ? account : `${account}.blob.core.windows.net`;
    const container = kred.azureContainer!.replace(/^\/+/, '');
    const jenis = c.mime || 'application/octet-stream';
    const xMsDate = new Date().toUTCString();
    /* StringToSign Put Blob (API 2021-12-02):
       VERB\nContent-Encoding\nContent-Language\nContent-Length\nContent-MD5
       \nContent-Type\nDate\nIf-Modified-Since\nIf-Match\nIf-None-Match
       \nIf-Unmodified-Since\nRange\nCanonicalizedHeaders\nCanonicalizedResource */
    const canonical = `PUT\n\n\n${c.bytes.length}\n\n${jenis}\n\n\n\n\n\n`
      + `x-ms-blob-type:BlockBlob\nx-ms-date:${xMsDate}\nx-ms-version:${VERSI}\n`
      + `/${account}/${container}/${c.key}`;
    const auth = tandaTanganSharedKey(account, kred.azureAccountKey!, canonical);

    const res = await fetch(
      `https://${host}/${container}/${encodeURIComponent(c.key)}`,
      {
        method: 'PUT',
        headers: {
          'x-ms-blob-type': 'BlockBlob',
          'x-ms-date': xMsDate,
          'x-ms-version': VERSI,
          'content-type': jenis,
          'content-length': String(c.bytes.length),
          Authorization: auth,
        },
        body: Uint8Array.from(c.bytes).buffer,
        signal: AbortSignal.timeout(60_000),
      },
    );
    if (!res.ok) {
      const teks = await res.text().catch(() => '');
      throw new Error(`Azure menolak unggahan (HTTP ${res.status}): ${teks.slice(0, 160)}`);
    }
    return { path: c.key };
  },
};

daftarkanPenyedia(azureAdapter);
