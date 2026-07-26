import type { DiscoveredModel } from '@/modules/core/db';
import { encryptSecret, decryptSecret } from '@/modules/core/crypto';
import { ValidationError } from '@/modules/chatbot/chatbot.service';
import { assertSecureEndpoint } from '@/modules/knowledge/embeddings/selfhosted';
import { embeddingServerRepository as repo } from './embedding-server.repository';

/**
 * Kelola server embedding sendiri (VPS) — infrastruktur PLATFORM.
 *
 * Semua rute yang memanggil service ini WAJIB `requireRole('superadmin')`:
 * tabelnya tak dijaga RLS, dan menerima URL sembarang dari pihak tak tepercaya
 * akan membuka SSRF (server kita dipaksa menembak alamat internal).
 *
 * Token tak pernah keluar dari server — `list()` mengembalikan bentuk publik
 * yang hanya menyatakan ADA/TIDAKNYA token, bukan nilainya.
 */

/** Bentuk aman untuk dikirim ke browser: tanpa token. */
export interface PublicEmbeddingServer {
  id: string;
  name: string;
  baseUrl: string;
  enabled: boolean;
  hasToken: boolean;
  models: DiscoveredModel[];
  lastCheckedAt: Date | null;
  lastError: string | null;
  deletedAt?: Date | null;
}

type Row = Awaited<ReturnType<typeof repo.findById>>;

function toPublic(r: NonNullable<Row>): PublicEmbeddingServer {
  return {
    id: r.id, name: r.name, baseUrl: r.baseUrl, enabled: r.enabled,
    hasToken: !!r.encryptedToken, models: r.models ?? [],
    lastCheckedAt: r.lastCheckedAt, lastError: r.lastError,
    ...(r.deletedAt ? { deletedAt: r.deletedAt } : {}),
  };
}

function normalizeUrl(raw: string): string {
  const url = raw.trim().replace(/\/+$/, '');
  if (!url) throw new ValidationError('Alamat server wajib diisi');
  // Aturan yang sama dengan sisi pemanggil — isi dokumen tenant melintas di sini.
  assertSecureEndpoint(url);
  return url;
}

export const embeddingServerService = {
  async list(): Promise<PublicEmbeddingServer[]> {
    return (await repo.listActive()).map(toPublic);
  },

  async listTrashed(): Promise<PublicEmbeddingServer[]> {
    return (await repo.listTrashed()).map(toPublic);
  },

  /** Tambah server. Token wajib — endpoint tanpa auth menerima teks dari siapa pun. */
  async create(input: { name: string; baseUrl: string; token: string }): Promise<PublicEmbeddingServer> {
    const baseUrl = normalizeUrl(input.baseUrl);
    if (!input.name?.trim()) throw new ValidationError('Nama server wajib diisi');
    if (!input.token?.trim()) throw new ValidationError('Token wajib diisi');
    if (await repo.findByBaseUrl(baseUrl)) {
      throw new ValidationError(`Server dengan alamat ${baseUrl} sudah terdaftar`);
    }
    const row = await repo.create({
      name: input.name.trim(), baseUrl,
      encryptedToken: encryptSecret(input.token.trim()),
      models: [],
    });
    return toPublic(row);
  },

  /** Ubah server. Token kosong = JANGAN ubah token yang ada. */
  async update(id: string, input: Partial<{ name: string; baseUrl: string; token: string; enabled: boolean }>) {
    const existing = await repo.findById(id);
    if (!existing) throw new ValidationError('Server tidak ditemukan');

    const values: Record<string, unknown> = {};
    if (input.name !== undefined) {
      if (!input.name.trim()) throw new ValidationError('Nama server wajib diisi');
      values.name = input.name.trim();
    }
    if (input.baseUrl !== undefined) {
      const baseUrl = normalizeUrl(input.baseUrl);
      const clash = await repo.findByBaseUrl(baseUrl);
      if (clash && clash.id !== id) throw new ValidationError(`Alamat ${baseUrl} dipakai server lain`);
      values.baseUrl = baseUrl;
      // Alamat berubah ⇒ daftar model lama belum tentu berlaku.
      values.models = [];
      values.lastCheckedAt = null;
    }
    if (input.token) values.encryptedToken = encryptSecret(input.token.trim());
    if (input.enabled !== undefined) values.enabled = input.enabled;

    const row = await repo.update(id, values);
    if (!row) throw new ValidationError('Server tidak ditemukan');
    return toPublic(row);
  },

  async softDelete(id: string) {
    const row = await repo.softDelete(id);
    if (!row) throw new ValidationError('Server tidak ditemukan');
    return toPublic(row);
  },

  async restore(id: string) {
    const row = await repo.restore(id);
    if (!row) throw new ValidationError('Server tidak ada di Sampah');
    return toPublic(row);
  },

  /**
   * Uji koneksi + temukan model yang dilayani.
   *
   * Sengaja memanggil endpoint BER-AUTH (`/v1/models`), bukan `/health`:
   * dengan begitu satu tombol menguji jaringan DAN token sekaligus — kalau
   * hanya menguji /health, token salah baru ketahuan saat ingest pertama.
   */
  async testAndDiscover(id: string): Promise<PublicEmbeddingServer> {
    const server = await repo.findById(id);
    if (!server) throw new ValidationError('Server tidak ditemukan');
    if (!server.encryptedToken) throw new ValidationError('Server belum punya token');

    const token = decryptSecret(server.encryptedToken);
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 15_000);

    try {
      const res = await fetch(`${server.baseUrl}/v1/models`, {
        signal: ac.signal,
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const hint = res.status === 401
          ? 'token ditolak server'
          : `HTTP ${res.status}`;
        throw new Error(hint);
      }
      const json = await res.json() as { data?: Array<{ id?: string; dimensions?: number; dtype?: string; loaded?: boolean }> };
      const models: DiscoveredModel[] = (json.data ?? [])
        .filter((m) => typeof m.id === 'string' && typeof m.dimensions === 'number')
        .map((m) => ({ id: m.id!, dimensions: m.dimensions!, dtype: m.dtype, loaded: m.loaded }));

      if (models.length === 0) throw new Error('server tak melaporkan satu model pun');
      // Kolom pgvector 1536 (HNSW ≤2000) — model di atas itu tak akan bisa disimpan.
      const tooBig = models.filter((m) => m.dimensions > 1536);
      if (tooBig.length) {
        throw new Error(
          `model ${tooBig.map((m) => `${m.id} (${m.dimensions}d)`).join(', ')} melebihi kolom pgvector 1536`,
        );
      }

      const row = await repo.update(id, { models, lastCheckedAt: new Date(), lastError: null });
      return toPublic(row!);
    } catch (err) {
      const e = err as Error;
      const message = e.name === 'AbortError' ? 'server tak menjawab dalam 15 detik' : e.message;
      await repo.update(id, { lastCheckedAt: new Date(), lastError: message, models: [] });
      throw new ValidationError(`Uji koneksi gagal: ${message}`);
    } finally {
      clearTimeout(timer);
    }
  },

  /**
   * Cari server aktif yang melayani `modelId`. Dipakai saat embedding —
   * mengembalikan kredensial terdekripsi, jadi HANYA untuk server-side.
   */
  async resolveForModel(modelId: string): Promise<{ baseUrl: string; token: string; model: DiscoveredModel } | null> {
    for (const s of await repo.listEnabled()) {
      const model = (s.models ?? []).find((m) => m.id === modelId);
      if (model && s.encryptedToken) {
        return { baseUrl: s.baseUrl, token: decryptSecret(s.encryptedToken), model };
      }
    }
    return null;
  },
};
