/**
 * ADAPTER PENYIMPANAN OBJEK KOMPATIBEL-S3 — AWS S3, Cloudflare R2, dan
 * S3-compatible (MinIO, Wasabi, dll).
 *
 * Memakai mesin tanda tangan SigV4 yang sudah diuji di `connections/s3.ts`
 * dan lapisan HTTP `knowledge/storage/s3.ts` — TANPA SDK. Uji koneksi
 * mengunduh pendaftaran isi bucket (1 objek) sebagai bukti kredensial benar
 * dan izin baca cukup.
 */
import type { KredensialS3 } from '@/modules/connections/s3';
import { daftarObjek } from '@/modules/knowledge/storage/s3';
import {
  daftarkanPenyedia, type KredensialStorage, type StorageAdapter,
} from '../adapter';

function s3Kred(kred: KredensialStorage): KredensialS3 {
  return {
    accessKeyId: kred.accessKeyId ?? '',
    secretAccessKey: kred.secretAccessKey ?? '',
    region: kred.region || 'us-east-1',
    bucket: kred.bucket ?? '',
    endpoint: kred.endpoint || undefined,
    gayaPath: kred.gayaPath === true,
  };
}

function adapter(provider: 's3' | 'r2' | 's3-compat', label: string): StorageAdapter {
  return {
    provider,
    label,
    wajib: [
      { kunci: 'accessKeyId', label: 'Access key ID' },
      { kunci: 'secretAccessKey', label: 'Secret access key' },
      { kunci: 'bucket', label: 'Bucket' },
    ],
    scopingDari(kred) {
      return {
        bucket: kred.bucket,
        region: kred.region || 'us-east-1',
        endpoint: kred.endpoint || null,
        gayaPath: kred.gayaPath === true,
      };
    },
    validasi(kred) {
      if (!kred.accessKeyId) throw new Error('Access key ID wajib diisi.');
      if (!kred.secretAccessKey) throw new Error('Secret access key wajib diisi.');
      if (!kred.bucket) throw new Error('Bucket wajib diisi.');
    },
    async uji(kred) {
      this.validasi(kred);
      const kr = s3Kred(kred);
      /* Ambil maks. 1 objek. Bucket kosong pun mengembalikan daftar kosong
         (200) — itu sudah bukti kredensial SAH dan izin ListBucket cukup. */
      const { objek, terpotong } = await daftarObjek(kr, '', new Date());
      return {
        ok: true,
        detail: `Terhubung ke bucket "${kred.bucket}"${objek.length ? ` · ${objek.length}+ objek` : ''}${terpotong ? ' (daftar lanjutan ada)' : ''}`,
      };
    },
  };
}

daftarkanPenyedia(adapter('s3', 'AWS S3'));
daftarkanPenyedia(adapter('r2', 'Cloudflare R2'));
daftarkanPenyedia(adapter('s3-compat', 'S3-compatible (MinIO, Wasabi, …)'));
