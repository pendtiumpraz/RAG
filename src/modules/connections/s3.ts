import { createHash, createHmac } from 'node:crypto';

/**
 * PENYIMPANAN OBJEK KOMPATIBEL-S3 — penandatanganan SigV4 dan pembacaan
 * daftar isi bucket.
 *
 * TANPA SDK, dan itu keputusan sadar. `@aws-sdk/client-s3` menarik puluhan
 * paket dan belasan megabyte ke dalam lambda yang sudah dekat batasnya,
 * untuk memakai dua operasi saja: daftar objek dan ambil objek. Yang
 * benar-benar rumit di S3 bukan protokolnya — itu HTTP biasa — melainkan
 * tanda tangannya, dan tanda tangan itu ±60 baris crypto yang bisa diuji
 * terhadap vektor resmi.
 *
 * KOMPATIBEL-S3, BUKAN AWS SAJA. Endpoint bisa disetel supaya MinIO,
 * Cloudflare R2, dan Wasabi ikut terlayani — pemasangan on-premise justru
 * lebih sering memakai itu daripada AWS sungguhan.
 *
 * BATAS YANG HARUS DIKETAHUI PEMBACA BERIKUTNYA: modul ini tak pernah diuji
 * terhadap layanan S3 sungguhan (tak ada kredensial di lingkungan
 * pengembangan). Yang terbukti adalah tanda tangannya — bagian yang paling
 * mudah salah dan paling sulit didiagnosis, karena satu byte meleset
 * menghasilkan 403 yang tak menjelaskan apa pun.
 */

const KOSONG_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

export interface KredensialS3 {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  bucket: string;
  /** Tanpa skema akan ditolak; lihat `endpointS3`. */
  endpoint?: string;
  /**
   * MinIO dan sebagian besar penyimpanan swakelola hanya melayani gaya
   * path (`https://host/bucket/key`); AWS memakai gaya host virtual
   * (`https://bucket.s3.region.amazonaws.com/key`). Menebaknya salah
   * menghasilkan 404 pada bucket yang jelas-jelas ada.
   */
  gayaPath?: boolean;
}

/** HMAC-SHA256 yang mengembalikan Buffer — rantai turunan kunci butuh biner. */
function hmac(kunci: Buffer | string, data: string): Buffer {
  return createHmac('sha256', kunci).update(data, 'utf8').digest();
}

export function sha256Hex(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Kunci penandatangan berjenjang: tanggal → wilayah → layanan → penutup.
 *
 * Berjenjang bukan demi kerumitan: tiap lapis MEMPERSEMPIT jangkauan kunci,
 * sehingga kunci harian satu wilayah tak bisa dipakai di wilayah lain atau
 * di hari lain. Itu pula sebabnya urutannya tak boleh ditukar — hasilnya
 * tetap berupa 32 byte yang "kelihatan benar", dan galatnya baru muncul
 * sebagai 403 tanpa keterangan.
 */
export function kunciPenandatangan(
  secretAccessKey: string, tanggal: string, region: string, layanan = 's3',
): Buffer {
  const kTanggal = hmac(`AWS4${secretAccessKey}`, tanggal);
  const kWilayah = hmac(kTanggal, region);
  const kLayanan = hmac(kWilayah, layanan);
  return hmac(kLayanan, 'aws4_request');
}

/**
 * Pelolosan RFC 3986 untuk jalur objek.
 *
 * `encodeURIComponent` membiarkan `!'()*` lolos dan itu MEMBUAT TANDA TANGAN
 * MELESET pada kunci objek yang memuatnya — nama berkas dengan tanda kurung
 * ("Laporan (final).pdf") sama sekali tidak langka. Garis miring sengaja
 * TIDAK diloloskan: ia pemisah jalur, bukan bagian dari satu segmen.
 */
export function lolosJalur(jalur: string): string {
  return jalur.split('/').map((seg) => encodeURIComponent(seg)
    .replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)).join('/');
}

/** Kueri kanonik: diurutkan menurut nama, nilainya diloloskan penuh. */
export function kueriKanonik(params: Record<string, string>): string {
  return Object.keys(params).sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
    .join('&');
}

export interface PermintaanTertanda {
  url: string;
  headers: Record<string, string>;
}

/**
 * Tanda tangani satu permintaan GET.
 *
 * `amzDate` disuntikkan, tidak diambil dari jam sistem: fungsi yang membaca
 * waktu sendiri tak bisa diuji terhadap vektor uji mana pun, dan vektor uji
 * itulah satu-satunya bukti yang bisa kita punya tanpa kredensial.
 */
export function tandatanganiGet(
  kred: KredensialS3,
  jalurObjek: string,
  params: Record<string, string>,
  amzDate: string,
): PermintaanTertanda {
  const tanggal = amzDate.slice(0, 8);
  const host = hostS3(kred);
  const jalur = kred.gayaPath
    ? `/${kred.bucket}${jalurObjek ? `/${lolosJalur(jalurObjek)}` : ''}`
    : `/${jalurObjek ? lolosJalur(jalurObjek) : ''}`;

  const headerKanonik = `host:${host}\nx-amz-content-sha256:${KOSONG_SHA256}\nx-amz-date:${amzDate}\n`;
  const headerDitandatangani = 'host;x-amz-content-sha256;x-amz-date';
  const permintaanKanonik = [
    'GET', jalur, kueriKanonik(params),
    headerKanonik, headerDitandatangani, KOSONG_SHA256,
  ].join('\n');

  const lingkup = `${tanggal}/${kred.region}/s3/aws4_request`;
  const untukDitandatangani = [
    'AWS4-HMAC-SHA256', amzDate, lingkup, sha256Hex(permintaanKanonik),
  ].join('\n');

  const tandaTangan = createHmac('sha256', kunciPenandatangan(kred.secretAccessKey, tanggal, kred.region))
    .update(untukDitandatangani, 'utf8').digest('hex');

  const kueri = kueriKanonik(params);
  return {
    url: `${skemaDanHost(kred)}${jalur}${kueri ? `?${kueri}` : ''}`,
    headers: {
      host,
      'x-amz-content-sha256': KOSONG_SHA256,
      'x-amz-date': amzDate,
      authorization: `AWS4-HMAC-SHA256 Credential=${kred.accessKeyId}/${lingkup}, `
        + `SignedHeaders=${headerDitandatangani}, Signature=${tandaTangan}`,
    },
  };
}

/**
 * Tanda tangani satu permintaan PUT (menyimpan objek) bertanda tangan.
 *
 * Untuk unggahan manual berkas ORISINAL ke penyimpanan objek BYOB. Beda
 * dari GET: payload bukan kosong, jadi `x-amz-content-sha256` memuat hash
 * isi dan `content-type` ikut ditandatangani (konsistensi header + payload
 * adalah apa yang mencegah pertampering-an isi di tengah jalan).
 */
export function tandatanganiPut(
  kred: KredensialS3,
  jalurObjek: string,
  body: Buffer,
  contentType: string | null,
  amzDate: string,
): PermintaanTertanda {
  const tanggal = amzDate.slice(0, 8);
  const host = hostS3(kred);
  const jalur = kred.gayaPath
    ? `/${kred.bucket}${jalurObjek ? `/${lolosJalur(jalurObjek)}` : ''}`
    : `/${jalurObjek ? lolosJalur(jalurObjek) : ''}`;

  const payloadHash = sha256Hex(body);
  const jenis = contentType?.trim() || 'application/octet-stream';
  const headerKanonik =
    `content-type:${jenis}\n`
    + `host:${host}\n`
    + `x-amz-content-sha256:${payloadHash}\n`
    + `x-amz-date:${amzDate}\n`;
  const headerDitandatangani = 'content-type;host;x-amz-content-sha256;x-amz-date';
  const permintaanKanonik = [
    'PUT', jalur, '', headerKanonik, headerDitandatangani, payloadHash,
  ].join('\n');

  const lingkup = `${tanggal}/${kred.region}/s3/aws4_request`;
  const untukDitandatangani = [
    'AWS4-HMAC-SHA256', amzDate, lingkup, sha256Hex(permintaanKanonik),
  ].join('\n');

  const tandaTangan = createHmac('sha256', kunciPenandatangan(kred.secretAccessKey, tanggal, kred.region))
    .update(untukDitandatangani, 'utf8').digest('hex');

  return {
    url: `${skemaDanHost(kred)}${jalur}`,
    headers: {
      'content-type': jenis,
      host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      authorization: `AWS4-HMAC-SHA256 Credential=${kred.accessKeyId}/${lingkup}, `
        + `SignedHeaders=${headerDitandatangani}, Signature=${tandaTangan}`,
    },
  };
}

/**
 * Endpoint WAJIB https kecuali loopback — sama seperti pembatasan pada
 * server embedding. Kunci akses dan isi dokumen pelanggan menyeberangi kabel
 * ini; http polos berarti keduanya terbaca siapa pun di jalur itu.
 */
export function endpointS3(kred: KredensialS3): URL {
  const mentah = kred.endpoint?.trim()
    || `https://s3.${kred.region}.amazonaws.com`;
  const u = new URL(mentah);
  const loopback = u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '::1';
  if (u.protocol !== 'https:' && !loopback) {
    throw new Error(`Endpoint S3 harus https (kecuali loopback): ${u.origin}`);
  }
  return u;
}

function skemaDanHost(kred: KredensialS3): string {
  const u = endpointS3(kred);
  return kred.gayaPath ? u.origin : `${u.protocol}//${kred.bucket}.${u.host}`;
}

export function hostS3(kred: KredensialS3): string {
  const u = endpointS3(kred);
  return kred.gayaPath ? u.host : `${kred.bucket}.${u.host}`;
}

export interface ObjekS3 {
  key: string;
  /** ETag tanpa tanda kutip — dipakai sebagai external_version. */
  etag: string;
  size: number;
}

export interface DaftarS3 {
  objek: ObjekS3[];
  /** true bila S3 memotong daftarnya. Lihat catatan di parseDaftar(). */
  terpotong: boolean;
  lanjutan: string | null;
}

/** Ambil isi satu elemen XML sederhana — S3 tak pernah menyarangkan ini. */
function isi(xml: string, tag: string): string | null {
  const m = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(xml);
  return m ? m[1] : null;
}

/**
 * Baca balasan ListObjectsV2.
 *
 * XML-nya diurai dengan regex, dan itu memang cukup DI SINI: bentuknya
 * dihasilkan mesin, dangkal, dan tak pernah memuat atribut atau ruang nama
 * di dalam elemen yang dibaca. Menambah pengurai XML penuh berarti satu
 * dependensi lagi di lambda demi lima medan.
 *
 * `terpotong` DITERUSKAN APA ADANYA, dan inilah bagian yang paling penting
 * di seluruh berkas ini. Sinkronisasi memakai selisih daftar untuk memutuskan
 * berkas mana yang HILANG dan harus dibuang; daftar yang terpotong berarti
 * berkas di luar jendela hanya tak terlihat, bukan tak ada. Melaporkannya
 * sebagai daftar lengkap akan menghapus dokumen yang masih hidup — kerusakan
 * senyap yang baru ketahuan saat chatbot menjawab "tidak ada" untuk berkas
 * yang jelas-jelas ada di bucket.
 */
export function parseDaftar(xml: string): DaftarS3 {
  const objek: ObjekS3[] = [];
  for (const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
    const blok = m[1];
    const key = isi(blok, 'Key');
    if (!key) continue;
    /* "Folder" di S3 tak ada; yang ada objek berukuran nol berakhiran '/'
       yang dibuat konsol web. Mengunduhnya menghasilkan berkas kosong yang
       lalu masuk sebagai dokumen tanpa isi. */
    if (key.endsWith('/')) continue;
    objek.push({
      key: nyahXml(key),
      etag: (isi(blok, 'ETag') ?? '').replace(/^&quot;|&quot;$/g, '').replace(/^"|"$/g, ''),
      size: Number(isi(blok, 'Size') ?? 0),
    });
  }
  return {
    objek,
    terpotong: isi(xml, 'IsTruncated')?.trim() === 'true',
    lanjutan: isi(xml, 'NextContinuationToken'),
  };
}

/** Entitas XML pada nama berkas — S3 melolosinya, kita harus mengembalikannya. */
function nyahXml(s: string): string {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');   // TERAKHIR: kalau lebih dulu, "&amp;lt;" jadi "<"
}
