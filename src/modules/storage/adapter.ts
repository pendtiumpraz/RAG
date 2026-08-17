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
  /** GCS — bucket tujuan unggahan (diisi pemilik, bukan bagian JSON SA). */
  gcsBucket?: string;
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

/**
 * Hasil penyimpanan satu berkas — yang dikembalikan rutin unggah MANUAL.
 *
 * Hanya referensi/path yang keluar, TIDAK PERNAH rahasia. `url` (jika ada)
 * adalah tautan publik/tertandatangani tempat berkas asli bisa diunduh
 * kembali; `path` adalah kunci objek di dalam storage yang dicatat agar
 * sinkron/unduh ulang mungkin dilakukan belakangan.
 */
export interface HasilSimpan {
  /** Kunci objek di dalam storage, mis. `uploads/<tenant>/<kb>/<uuid>-<nama>`. */
  path: string;
  /** Tautan (bila penyedia memberinya) — boleh null utk yang tak punya. */
  url?: string | null;
}

/**
 * Konteks unggahan yang diterima `simpan` — saluran server-side penuh.
 *
 * `bytes` adalah isi ORISINAL berkas (bukan hasil ekstraksi teks), `mime`
 * tipe konten asal, dan `key` jalur objek yang sudah dibentuk pemanggil.
 */
export interface KonteksSimpan {
  key: string;
  bytes: Buffer;
  mime?: string | null;
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
  /**
   * Simpan satu berkas (unggahan manual) ke storage ini.
   *
   * Opsional — penyedia boleh tidak mengimplementasikannya bila tak bisa
   * menulis (mis. sudah usang); `storageService` lalu melempar galat yang
   * jelas. Sisi TULIS ini khusus dipakai jalur UNGGAHAN MANUAL; Drive &
   * SharePoint TIDAK lewat sini (mereka sync langsung, tidak butuh blob).
   */
  simpan?(kred: KredensialStorage, c: KonteksSimpan): Promise<HasilSimpan>;

  /**
   * Ambil (unduh) satu berkas ORISINAL yang disimpan lewat `simpan`.
   *
   * Dipakai jalur RE-SYNC sumber `upload`: berkas aslinya sudah disimpan di
   * blob/BYOB saat unggahan pertama, jadi sinkronisasi ulang membaca KEMBALI
   * byte-nya dari storage (bukan dari form multipart) lalu ekstraksi + ingest
   * mengalir seperti biasa. `key` adalah `path` yang dicatat di `simpan`.
   *
   * Opsional — penyedia boleh tidak mengimplementasikannya; storageService
   * lalu melempar galat yang jelas saat re-sync membutuhkannya.
   */
  ambil?(kred: KredensialStorage, key: string): Promise<HasilAmbil>;
}

/**
 * Hasil pengunduhan satu berkas tersimpan — isi ORISINAL + tipe konten.
 *
 * `mime` boleh null: ekstraktor sudah memakai nama berkas sebagai sumber
 * utama (daftar ekstensi di ./format), jadi penyedia yang tak bisa
 * mengembalikan tipe konten tetap bisa dipakai.
 */
export interface HasilAmbil {
  content: Buffer;
  mime?: string | null;
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

