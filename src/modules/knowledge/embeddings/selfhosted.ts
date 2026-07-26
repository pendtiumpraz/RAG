import type { EmbeddingModel } from '@/modules/core/registry';

/**
 * EMBEDDING SERVER SENDIRI (VPS).
 *
 * Model besar (BGE-M3 presisi penuh ~2,16 GB) tak masuk akal dijalankan di
 * lambda serverless: `/tmp` ~512 MB, memori terbatas, dan filesystem-nya
 * sementara sehingga bobot ditarik ulang tiap cold start (terukur 377 detik
 * untuk varian 543 MB — lihat docs/MODEL-HOSTING.md). Jalan keluarnya:
 * model tinggal di VPS, aplikasi memanggilnya lewat HTTP.
 *
 * Protokolnya sengaja **kompatibel OpenAI** (`POST {base}/v1/embeddings`)
 * supaya server di VPS boleh apa saja: service bawaan di
 * `services/embedding-server/`, HF Text Embeddings Inference, vLLM, atau
 * yang lain. Tidak ada protokol khusus yang mengunci.
 *
 * Konfigurasinya INFRASTRUKTUR (env), bukan per-tenant — sama seperti model
 * host: satu server dipakai bersama, sementara vektor hasilnya tetap
 * per-tenant dan tak pernah bercampur.
 */

export interface SelfhostedConfig { baseUrl: string; token: string | null }

/** Baca konfigurasi endpoint; null bila belum diatur. */
export function selfhostedConfig(): SelfhostedConfig | null {
  const raw = process.env.EMBEDDING_SELFHOSTED_URL?.trim();
  if (!raw) return null;
  return {
    baseUrl: raw.replace(/\/+$/, ''),
    token: process.env.EMBEDDING_SELFHOSTED_TOKEN?.trim() || null,
  };
}

/**
 * Yang melintas ke server ini adalah ISI DOKUMEN tenant. Isolasi antar-tenant
 * dijaga ketat sampai level database (RLS), jadi mengirim teksnya lewat HTTP
 * polos akan membocorkan semua itu di satu titik yang tak dijaga.
 *
 * Karena itu: wajib `https://`, kecuali tujuannya loopback (dev di mesin
 * sendiri, trafiknya tak pernah keluar host).
 */
export function assertSecureEndpoint(baseUrl: string): void {
  let url: URL;
  try { url = new URL(baseUrl); }
  catch { throw new Error(`EMBEDDING_SELFHOSTED_URL bukan URL valid: ${baseUrl}`); }

  const loopback = url.hostname === 'localhost'
    || url.hostname === '127.0.0.1'
    || url.hostname === '::1'
    || url.hostname === '[::1]';

  if (url.protocol === 'https:') return;
  if (url.protocol === 'http:' && loopback) return;

  throw new Error(
    `EMBEDDING_SELFHOSTED_URL harus https:// (dapat "${url.protocol}//${url.hostname}"). ` +
    'Isi dokumen tenant melintas di sana — HTTP polos ke IP publik membocorkannya. ' +
    'Pasang TLS di depan server embedding (mis. Caddy/nginx), atau pakai loopback untuk dev.',
  );
}

/** Tanpa token, siapa pun yang menemukan endpoint bisa memakainya. */
export function assertAuthenticated(cfg: SelfhostedConfig): void {
  if (!cfg.token) {
    throw new Error(
      'EMBEDDING_SELFHOSTED_TOKEN belum diisi. Endpoint embedding tanpa autentikasi ' +
      'bisa dipakai siapa pun yang menemukannya — dan menerima teks dokumen.',
    );
  }
}

/** Bentuk balasan kompatibel OpenAI. */
interface EmbeddingsResponse {
  data?: Array<{ embedding: number[]; index?: number }>;
  error?: { message?: string };
}

/**
 * Panggil server embedding sendiri. Mengembalikan satu vektor per teks,
 * URUT sesuai input (indeks dihormati bila server mengirimkannya).
 */
export async function embedSelfhosted(
  model: EmbeddingModel,
  texts: string[],
  opts: { timeoutMs?: number } = {},
): Promise<number[][]> {
  const cfg = selfhostedConfig();
  if (!cfg) {
    throw new Error(
      `Model "${model.id}" dilayani server embedding sendiri, tapi ` +
      'EMBEDDING_SELFHOSTED_URL belum diatur.',
    );
  }
  assertSecureEndpoint(cfg.baseUrl);
  assertAuthenticated(cfg);

  // Model besar + batch besar bisa lama; jangan menggantung selamanya.
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), opts.timeoutMs ?? 120_000);

  let res: Response;
  try {
    res = await fetch(`${cfg.baseUrl}/v1/embeddings`, {
      method: 'POST',
      signal: ac.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(cfg.token ? { Authorization: `Bearer ${cfg.token}` } : {}),
      },
      body: JSON.stringify({ model: model.servedModel ?? model.id, input: texts }),
    });
  } catch (err) {
    const e = err as Error;
    throw new Error(
      e.name === 'AbortError'
        ? `Server embedding tak menjawab dalam ${(opts.timeoutMs ?? 120_000) / 1000}s (${cfg.baseUrl})`
        : `Tak bisa menghubungi server embedding di ${cfg.baseUrl}: ${e.message}`,
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Server embedding menolak (HTTP ${res.status}): ${body.slice(0, 200)}`);
  }

  const json = (await res.json()) as EmbeddingsResponse;
  if (json.error) throw new Error(`Server embedding: ${json.error.message ?? 'galat tak dikenal'}`);
  if (!Array.isArray(json.data)) throw new Error('Balasan server embedding tak punya array `data`');

  // Urutkan bila server menyertakan index; kalau tidak, pakai urutan apa adanya.
  const rows = json.data.every((d) => typeof d.index === 'number')
    ? [...json.data].sort((a, b) => (a.index! - b.index!))
    : json.data;

  const vectors = rows.map((d) => d.embedding);
  if (vectors.length !== texts.length) {
    throw new Error(`Server embedding mengembalikan ${vectors.length} vektor untuk ${texts.length} teks`);
  }
  // Dimensi meleset = vektor tak sebanding dengan yang sudah tersimpan; hentikan
  // di sini daripada mencemari knowledge base dengan vektor yang tak bisa dicari.
  for (const v of vectors) {
    if (!Array.isArray(v) || v.length !== model.dimensions) {
      throw new Error(
        `Dimensi tak cocok: registry ${model.dimensions}, server mengirim ${Array.isArray(v) ? v.length : '?'}. ` +
        'Pastikan model di server sama dengan yang terdaftar.',
      );
    }
  }
  return vectors;
}
