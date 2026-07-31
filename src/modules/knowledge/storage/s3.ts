import {
  parseDaftar, tandatanganiGet, type KredensialS3, type ObjekS3,
} from '@/modules/connections/s3';

/**
 * Lapisan HTTP konektor S3 — memakai penandatanganan di
 * `connections/s3.ts` dan tak mengandung kriptografi sendiri.
 *
 * Dipisah supaya bagian yang bisa diuji tanpa jaringan (tanda tangan,
 * pembacaan XML) tetap terpisah dari bagian yang tidak bisa (fetch).
 */

/** Cap waktu format AWS: 20260731T101530Z. */
export function stempelAmz(saat: Date): string {
  return `${saat.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;
}

/**
 * Berapa halaman daftar yang boleh ditarik satu sinkronisasi.
 *
 * ListObjectsV2 mengembalikan maksimal 1.000 objek per halaman. Sepuluh
 * halaman = 10.000 objek, jauh di atas kuota potongan paket mana pun, dan
 * cukup rendah supaya bucket raksasa yang salah dipasang tidak membuat satu
 * sinkronisasi berjalan tanpa ujung di dalam lambda.
 *
 * Saat batas ini kena, `terpotong` DIBIARKAN true — lihat alasannya di
 * parseDaftar(): daftar terpotong tak boleh dipakai memutuskan penghapusan.
 */
export const MAKS_HALAMAN = 10;

export interface HasilDaftarS3 {
  objek: ObjekS3[];
  terpotong: boolean;
}

/** Telusuri isi bucket (dengan awalan opsional), mengikuti token lanjutan. */
export async function daftarObjek(
  kred: KredensialS3, prefix: string, saat: Date = new Date(),
): Promise<HasilDaftarS3> {
  const objek: ObjekS3[] = [];
  let lanjutan: string | null = null;
  let terpotong = false;

  for (let halaman = 0; halaman < MAKS_HALAMAN; halaman++) {
    const params: Record<string, string> = { 'list-type': '2', 'max-keys': '1000' };
    if (prefix) params.prefix = prefix;
    if (lanjutan) params['continuation-token'] = lanjutan;

    const t = tandatanganiGet(kred, '', params, stempelAmz(saat));
    const res = await fetch(t.url, { headers: t.headers, signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(galatS3(res.status, await res.text().catch(() => '')));

    const hal = parseDaftar(await res.text());
    objek.push(...hal.objek);
    terpotong = hal.terpotong;
    lanjutan = hal.lanjutan;
    if (!hal.terpotong || !lanjutan) { terpotong = false; break; }
  }
  return { objek, terpotong };
}

/** Unduh satu objek. */
export async function ambilObjek(
  kred: KredensialS3, key: string, saat: Date = new Date(),
): Promise<{ content: Buffer; mime?: string }> {
  const t = tandatanganiGet(kred, key, {}, stempelAmz(saat));
  const res = await fetch(t.url, { headers: t.headers, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(galatS3(res.status, await res.text().catch(() => '')));
  return {
    content: Buffer.from(await res.arrayBuffer()),
    mime: (res.headers.get('content-type') ?? '').split(';')[0].trim() || undefined,
  };
}

/**
 * Terjemahkan galat S3 jadi kalimat yang menunjuk penyebabnya.
 *
 * S3 menjawab 403 untuk kunci salah, jam yang meleset, DAN izin yang kurang —
 * tiga sebab yang penanganannya sama sekali berbeda. Membiarkannya sebagai
 * "403" berarti orang mengganti kunci berkali-kali padahal jam servernyalah
 * yang salah.
 */
function galatS3(status: number, badan: string): string {
  const kode = /<Code>([^<]+)<\/Code>/.exec(badan)?.[1] ?? '';
  if (kode === 'RequestTimeTooSkewed') {
    return 'Jam server meleset lebih dari 15 menit dari jam S3 — perbaiki waktunya, bukan kuncinya.';
  }
  if (kode === 'SignatureDoesNotMatch') {
    return 'Tanda tangan ditolak: secret access key salah, atau wilayah/endpoint tak cocok dengan bucket.';
  }
  if (kode === 'InvalidAccessKeyId') return 'Access key id tidak dikenal.';
  if (kode === 'AccessDenied') return 'Kunci sah tapi tak punya izin s3:ListBucket / s3:GetObject di bucket ini.';
  if (kode === 'NoSuchBucket') return 'Bucket tidak ada di wilayah/endpoint yang disetel.';
  if (status === 404) return 'Objek atau bucket tak ditemukan — periksa gaya alamat (path-style untuk MinIO/R2).';
  return `S3 menjawab ${status}${kode ? ` (${kode})` : ''}.`;
}
