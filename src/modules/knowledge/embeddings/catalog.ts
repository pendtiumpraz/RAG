import { EMBEDDING_MODELS, type EmbeddingModel } from '@/modules/core/registry';
import { embeddingServerRepository } from '@/modules/settings/embedding-server.repository';
import { selfhostedConfig } from './selfhosted';

/**
 * KATALOG MODEL EMBEDDING = registry statis + model yang DITEMUKAN di server
 * embedding sendiri (VPS).
 *
 * Kenapa dinamis: menambah model di VPS tak boleh memaksa deploy ulang
 * aplikasi. Superadmin menekan "Test koneksi", server melaporkan model +
 * dimensinya, dan model itu langsung bisa dipilih tenant.
 *
 * Id model yang ditemukan diberi awalan `vps:` supaya tak pernah bentrok
 * dengan id registry statis. Id inilah yang tersimpan di
 * `tenant_settings.active_embedding_model` dan `documents.embedding_model`,
 * jadi bentuknya harus stabil.
 */

export const VPS_PREFIX = 'vps:';

/** Ubah model hasil deteksi jadi bentuk EmbeddingModel yang dipahami aplikasi. */
function toEmbeddingModel(serverName: string, m: { id: string; dimensions: number; dtype?: string }): EmbeddingModel {
  return {
    id: `${VPS_PREFIX}${m.id}`,
    label: `${m.id}${m.dtype ? ` (${m.dtype})` : ''} — ${serverName}`,
    kind: 'selfhosted',
    bucket: 'large',
    dimensions: m.dimensions,
    servedModel: m.id,
  };
}

/**
 * Entri `selfhosted` STATIS hanya masuk akal bila jalur env dipakai; kalau
 * EMBEDDING_SELFHOSTED_URL kosong, menampilkannya cuma menjebak pengguna
 * memilih model yang pasti gagal.
 */
function staticModels(): EmbeddingModel[] {
  const envConfigured = selfhostedConfig() !== null;
  return EMBEDDING_MODELS.filter((m) => m.kind !== 'selfhosted' || envConfigured);
}

/** Seluruh model yang bisa dipilih saat ini. */
export async function listEmbeddingModels(): Promise<EmbeddingModel[]> {
  const discovered: EmbeddingModel[] = [];
  try {
    for (const s of await embeddingServerRepository.listEnabled()) {
      for (const m of s.models ?? []) discovered.push(toEmbeddingModel(s.name, m));
    }
  } catch (err) {
    // Katalog tak boleh menjatuhkan halaman Settings kalau DB sedang bermasalah;
    // model statis tetap bisa dipakai.
    console.error('[catalog] gagal membaca server embedding:', err);
  }

  // Server duplikat bisa melayani model bernama sama — ambil yang pertama.
  const seen = new Set<string>();
  const unique = discovered.filter((m) => !seen.has(m.id) && seen.add(m.id));
  return [...staticModels(), ...unique];
}

/** Cari satu model menurut id, statis maupun hasil deteksi. */
export async function resolveEmbeddingModel(id: string): Promise<EmbeddingModel | undefined> {
  if (!id.startsWith(VPS_PREFIX)) {
    return staticModels().find((m) => m.id === id);
  }
  return (await listEmbeddingModels()).find((m) => m.id === id);
}
