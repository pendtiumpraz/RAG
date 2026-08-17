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
};

daftarkanPenyedia(azureAdapter);
