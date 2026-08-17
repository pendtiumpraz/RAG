import {
  parseDaftar, tandatanganiGet, tandatanganiPut, type KredensialS3, type ObjekS3,
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
  kred: KredensialS3, prefix: string, saat?: Date,
): Promise<HasilDaftarS3> {
  const objek: ObjekS3[] = [];
  let lanjutan: string | null = null;

  for (let halaman = 0; halaman < MAKS_HALAMAN; halaman++) {
    const params: Record<string, string> = { 'list-type': '2', 'max-keys': '1000' };
    if (prefix) params.prefix = prefix;
    if (lanjutan) params['continuation-token'] = lanjutan;

    /* Tiap halaman ditandatangani ULANG dengan waktunya sendiri. S3 menolak
       tanda tangan yang waktunya meleset lebih dari 15 menit, dan satu cap
       waktu yang dipakai bersama seluruh halaman akan menua selama
       penelusuran — bucket besar gagal di halaman terakhir dengan galat yang
       menuduh jam server, padahal jamnya benar. `saat` hanya disuntik uji. */
    const t = tandatanganiGet(kred, '', params, stempelAmz(saat ?? new Date()));
    const res = await fetch(t.url, { headers: t.headers, signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(galatS3(res.status, await res.text().catch(() => '')));

    const hal = parseDaftar(await res.text());
    objek.push(...hal.objek);

    // Daftar tuntas — satu-satunya keadaan yang boleh dilaporkan lengkap.
    if (!hal.terpotong) return { objek, terpotong: false };

    /* Masih terpotong tapi S3 tak memberi token lanjutan: kita BERHENTI di
       tengah. Melaporkannya lengkap berarti planDelta memperlakukan setiap
       berkas di luar daftar sebagai terhapus — dan menghapus dokumen yang
       masih hidup. Versi pertama kartu ini justru menyetel terpotong=false
       di cabang ini; ujinya lolos karena hanya menguji pembaca XML-nya, bukan
       lingkaran yang memakainya. */
    if (!hal.lanjutan) return { objek, terpotong: true };
    lanjutan = hal.lanjutan;
  }

  // Kehabisan jatah halaman sementara S3 masih menyisakan objek.
  return { objek, terpotong: true };
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
 * Simpan satu objek (unggahan manual) dengan PUT bertanda tangan SigV4.
 *
 * Badan dikirim apa adanya — S3 tidak mengubahnya. `content-type` ikut
 * ditandatangani (lihat tandatanganiPut) supaya isi tak bisa diganti di
 * tengah jalan tanpa tanda tangan yang batal.
 */
export async function simpanObjek(
  kred: KredensialS3, key: string, bytes: Buffer, mime?: string | null,
  saat: Date = new Date(),
): Promise<{ path: string }> {
  const t = tandatanganiPut(kred, key, bytes, mime || null, stempelAmz(saat));
  const res = await fetch(t.url, {
    method: 'PUT',
    headers: { ...t.headers, 'content-length': String(bytes.length) },
    body: Uint8Array.from(bytes).buffer,
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(galatS3(res.status, await res.text().catch(() => '')));
  return { path: key };
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
