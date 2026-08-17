/**
 * ABSTRAKSI PENYIMPANAN OBJEK (BYOB) — adapter + registry.
 *
 * Uraian tugas: pelanggan NON-superadmin bisa menghubungkan penyimpanan objek
 * MEREKA SENDIRI (AWS S3, Cloudflare R2, Google Cloud Storage, Azure Blob,
 * atau penyimpanan S3-compatible lain). Platform blob dari env
 * (BLOB_STORE_ID/BLOB_READ_WRITE_TOKEN) tetap menjadi bawaan dan tak pernah
 * tersimpan di database.
 *
 * Berkas ini mendefinisikan KONTRANK antar adaptor dan registry penyedia.
 * Menambah penyedia baru = tambah SATU entri ke `PENYEDIA` + satu berkas
 * adapter kecil yang menuruni interface di bawah; tak ada kode lain yang
 * perlu diubah (pola registry yang diminta Bos Galih).
 *
 * RAHASIA: setiap adaptor menerima kredensial yang SUDAH didekripsi dari
 * storage.service — tak ada adaptor yang menyentuh enkripsi. Kredensial tak
 * pernah dikirim balik ke peramban; yang keluar hanya `scoping` (info
 * lingkup/akun tanpa rahasia) dan `hasCredentials`.
 */

export type PenyediaStorage =
  | 's3'        // AWS S3
  | 'r2'        // Cloudflare R2 (S3-compatible)
  | 'gcs'       // Google Cloud Storage
  | 'azure'     // Azure Blob Storage
  | 's3-compat' // penyimpanan S3-compatible lain (MinIO, Wasabi, dll.)
  | 'platform'; // blob platform dari env — tak pernah tersimpan di DB

/** Bentuk kredensial statis ANTAR penyedia — dienkripsi di DB, didekripsi di service. */
export interface KredensialStorage {
  /** S3/R2/S3-compat */
  accessKeyId?: string;
  secretAccessKey?: string;
  region?: string;
  bucket?: string;
  endpoint?: string;
  gayaPath?: boolean;
  /** GCS — JSON service account (isi mentah, bukan jalur). */
  serviceAccountJson?: string;
  /** Azure — nama akun + kunci penyimpanan, atau SAS. */
  azureAccountName?: string;
  azureAccountKey?: string;
  azureContainer?: string;
  azureSas?: string;
}

/**
 * Apa yang DITERIMA adaptor untuk dibangun lalu diuji.
 * `credentials` sudah DIDEKRIPSI oleh storage.service.
 */
export interface KonteksAdapter {
  provider: PenyediaStorage;
  scoping: Record<string, unknown>;
  credentials: KredensialStorage;
}

/** Hasil uji koneksi — dipakai tombol "Uji" di UI. */
export interface HasilUji {
  ok: boolean;
  /** Keterangan tampil: 'Terhubung ke bucket "x"' dst. */
  detail?: string;
  reason?: string;
}

/** Kontrak setiap penyedia penyimpanan. */
export interface StorageAdapter {
  readonly provider: PenyediaStorage;
  readonly label: string;
  /** Kredensial yang WAJIB diisi, dalam Bahasa Indonesia. */
  readonly wajib: Array<{ kunci: keyof KredensialStorage; label: string }>;
  /** Info lingkup/akun tanpa rahasia utk ditampilkan di daftar. */
  scopingDari(kred: KredensialStorage): Record<string, unknown>;
  /** Periksa kelengkapan kredensial; lempar Error dengan pesan yang jelas. */
  validasi(kred: KredensialStorage): void;
  /** Uji koneksi nyata ke penyedia. Platform blob dianggap auto-ok. */
  uji(kred: KredensialStorage): Promise<HasilUji>;
}

/* ── registry ─────────────────────────────────────────────────────── */
const PENYEDIA_MAP = new Map<PenyediaStorage, StorageAdapter>();

export function daftarPenyedia(): StorageAdapter[] {
  return [...PENYEDIA_MAP.values()];
}

export function penyedia(p: PenyediaStorage | string): StorageAdapter {
  const a = PENYEDIA_MAP.get(p as PenyediaStorage);
  if (!a) throw new Error(`Penyedia penyimpanan tak dikenal: ${p}`);
  return a;
}

export function daftarkanPenyedia(adapter: StorageAdapter): void {
  PENYEDIA_MAP.set(adapter.provider, adapter);
}

