import type { Provider } from '@/modules/core/registry';

/**
 * UJI KUNCI API — apakah kunci yang tersimpan benar-benar diterima penyedia.
 *
 * Sengaja memakai endpoint DAFTAR MODEL tiap penyedia, bukan permintaan
 * penyelesaian teks: gratis atau nyaris gratis, tak memakan kuota token, dan
 * tetap membuktikan kuncinya sah. Menguji dengan mengirim prompt berarti
 * menagih pengguna hanya untuk memastikan tombolnya bekerja.
 *
 * Yang diuji hanya KEABSAHAN kunci — bukan apakah model tertentu tersedia
 * untuk akun itu.
 */

export interface KeyTestResult { ok: boolean; message: string; models?: number }

const TIMEOUT_MS = 12_000;

async function probe(url: string, headers: Record<string, string>): Promise<KeyTestResult> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers, signal: ac.signal });
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: 'Kunci ditolak penyedia (401/403) — periksa nilainya.' };
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { ok: false, message: `Penyedia membalas HTTP ${res.status}. ${body.slice(0, 120)}` };
    }
    const json = await res.json().catch(() => ({}));
    const list = (json.data ?? json.models ?? []) as unknown[];
    return {
      ok: true,
      models: Array.isArray(list) ? list.length : undefined,
      message: Array.isArray(list) && list.length
        ? `Kunci valid — ${list.length} model terlihat.`
        : 'Kunci valid.',
    };
  } catch (err) {
    const e = err as Error;
    return {
      ok: false,
      message: e.name === 'AbortError'
        ? 'Penyedia tak menjawab dalam 12 detik.'
        : `Tak bisa menghubungi penyedia: ${e.message}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function testProviderKey(provider: Provider, key: string): Promise<KeyTestResult> {
  const bearer = { Authorization: `Bearer ${key}` };

  switch (provider) {
    case 'anthropic':
      return probe('https://api.anthropic.com/v1/models', {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      });
    case 'openai':
      return probe('https://api.openai.com/v1/models', bearer);
    case 'deepseek':
      return probe('https://api.deepseek.com/models', bearer);
    case 'xai':
      return probe('https://api.x.ai/v1/models', bearer);
    case 'groq':
      return probe('https://api.groq.com/openai/v1/models', bearer);
    case 'mistral':
      return probe('https://api.mistral.ai/v1/models', bearer);
    case 'cohere':
      return probe('https://api.cohere.com/v1/models', bearer);
    case 'google':
      // Google memakai kunci di query string, bukan header.
      return probe(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`, {});
    default:
      return { ok: false, message: `Uji untuk provider "${provider}" belum didukung.` };
  }
}
