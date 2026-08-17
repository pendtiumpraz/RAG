/**
 * ADAPTER GOOGLE CLOUD STORAGE (GCS).
 *
 * Penyedia GCS berbicara JSON API (bukan SigV4). Uji koneksi memakai JWT
 * yang ditandatangani RSA dengan kunci privat dari service account, lalu
 * menukarnya menjadi access token lewat endpoint OAuth2 Google — TANPA SDK dan
 * hanya memakai crypto bawaan Node + fetch.
 *
 * Kredensial yang diterima: JSON service account (isi mentah). Akses yang
 * diberikan penetapan peran ("Storage Object Viewer" minimal untuk daftar).
 */
import {
  createPrivateKey, createSign,
} from 'node:crypto';
import {
  daftarkanPenyedia, type KredensialStorage, type StorageAdapter,
} from '../adapter';

interface SaJson {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

function sabunJava(kred: KredensialStorage): SaJson {
  if (!kred.serviceAccountJson) throw new Error('Service account JSON wajib diisi.');
  let sa: SaJson;
  try { sa = JSON.parse(kred.serviceAccountJson) as SaJson; }
  catch { throw new Error('Service account JSON tidak valid (bukan JSON).'); }
  if (!sa.client_email || !sa.private_key) {
    throw new Error('Service account JSON harus memuat client_email dan private_key.');
  }
  return sa;
}

interface Claim {
  iss: string;
  scope: string;
  aud: string;
  exp: number;
  iat: number;
}

function jwtTertanda(sa: SaJson, scope: string): string {
  const now = Math.floor(Date.now() / 1000);
  const claim: Claim = {
    iss: sa.client_email,
    scope,
    aud: sa.token_uri || 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };
  const b64 = (input: string | object) => Buffer.from(JSON.stringify(input))
    .toString('base64url');
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64(claim)}`;
  const sign = createSign('RSA-SHA256');
  sign.update(unsigned);
  const sig = sign.sign(createPrivateKey(sa.private_key)).toString('base64url');
  return `${unsigned}.${sig}`;
}

async function tokenAkses(sa: SaJson): Promise<string> {
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: jwtTertanda(sa, 'https://www.googleapis.com/auth/devstorage.read_only'),
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Gagal menukar kredensial GCS: HTTP ${res.status}`);
  const j = await res.json().catch(() => ({})) as { access_token?: string };
  if (!j.access_token) throw new Error('Google tak mengembalikan access token.');
  return j.access_token;
}

export const gcsAdapter: StorageAdapter = {
  provider: 'gcs',
  label: 'Google Cloud Storage',
  wajib: [{ kunci: 'serviceAccountJson', label: 'Service account JSON' }],
  scopingDari(kred) {
    try {
      const sa = sabunJava(kred);
      return { account: sa.client_email };
    } catch {
      return { account: null };
    }
  },
  validasi(kred) { sabunJava(kred); },
  async uji(kred) {
    const sa = sabunJava(kred);
    const token = await tokenAkses(sa);
    /* Probe sederhana: daftar bucket milik akun (JSON API). Ini membuktikan
       token sah; peran objek terhadap bucket tertentu diuji per-unggahan. */
    const res = await fetch('https://storage.googleapis.com/storage/v1/b?maxResults=1', {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Pemeriksaan GCS gagal: HTTP ${res.status}`);
    return { ok: true, detail: `Terhubung sebagai ${sa.client_email}` };
  },
};

daftarkanPenyedia(gcsAdapter);
