import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  endpointS3, hostS3, kueriKanonik, kunciPenandatangan, lolosJalur,
  parseDaftar, sha256Hex, tandatanganiGet, type KredensialS3,
} from '../src/modules/connections/s3';
import { MAKS_HALAMAN, stempelAmz } from '../src/modules/knowledge/storage/s3';

/**
 * KONEKTOR S3 — apa yang bisa dibuktikan tanpa kredensial.
 *
 * Tak ada akun S3 di lingkungan ini, jadi "berhasil mengunduh" tak bisa
 * ditunjukkan. Yang JUSTRU paling perlu dijaga memang tak butuh akun:
 * penandatanganan SigV4 dan pembacaan daftar isi. Keduanya adalah bagian
 * yang salahnya paling sulit didiagnosis — S3 menjawab 403 tanpa
 * menjelaskan byte mana yang meleset — dan keduanya deterministik, jadi
 * bisa dikunci terhadap vektor resmi.
 */

const KRED: KredensialS3 = {
  accessKeyId: 'AKIDEXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
  region: 'us-east-1',
  bucket: 'contoh',
};

/* ── tanda tangan: satu-satunya bukti independen yang bisa kita punya ─── */

test('kunci penandatangan cocok dengan VEKTOR RESMI AWS', () => {
  /* Nilai ini datang dari dokumentasi AWS "Deriving the signing key", bukan
     dari keluaran implementasi ini — kalau diambil dari keluarannya sendiri,
     ujinya cuma membuktikan bahwa kode sama dengan dirinya sendiri, dan
     rantai HMAC yang urutannya tertukar akan lolos dengan mulus. */
  const k = kunciPenandatangan(KRED.secretAccessKey, '20150830', 'us-east-1', 'iam');
  assert.equal(k.toString('hex'),
    'c4afb1cc5771d871763a393e44b703571b55cc28424d1a5e86da6ed3c154a4b9');
});

test('urutan jenjang kunci tak boleh tertukar', () => {
  /* Tiap lapis mempersempit jangkauan kunci. Menukar wilayah dan layanan
     tetap menghasilkan 32 byte yang "kelihatan benar", dan galatnya baru
     muncul sebagai 403 tanpa keterangan di produksi pelanggan. */
  const benar = kunciPenandatangan(KRED.secretAccessKey, '20150830', 'us-east-1', 's3');
  const tertukar = kunciPenandatangan(KRED.secretAccessKey, '20150830', 's3', 'us-east-1');
  assert.notEqual(benar.toString('hex'), tertukar.toString('hex'));
});

test('sha256 badan kosong adalah konstanta yang dipakai header', () => {
  const kosong = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
  assert.equal(sha256Hex(''), kosong);
  const t = tandatanganiGet(KRED, 'a.txt', {}, '20260731T101530Z');
  assert.equal(t.headers['x-amz-content-sha256'], kosong,
    'header isi tak cocok dengan yang ikut ditandatangani — S3 menolak 403');
});

test('tanda tangan BERUBAH bila apa pun yang ditandatangani berubah', () => {
  /* Kalau salah satu masukan diam-diam tak ikut ke permintaan kanonik,
     tanda tangannya tetap sama — dan itu berarti bagian itu tak terlindungi
     sama sekali. */
  const dasar = tandatanganiGet(KRED, 'a.txt', { x: '1' }, '20260731T101530Z').headers.authorization;
  const beda = [
    tandatanganiGet(KRED, 'b.txt', { x: '1' }, '20260731T101530Z'),
    tandatanganiGet(KRED, 'a.txt', { x: '2' }, '20260731T101530Z'),
    tandatanganiGet(KRED, 'a.txt', { x: '1' }, '20260731T101531Z'),
    tandatanganiGet({ ...KRED, region: 'ap-southeast-1' }, 'a.txt', { x: '1' }, '20260731T101530Z'),
    tandatanganiGet({ ...KRED, bucket: 'lain' }, 'a.txt', { x: '1' }, '20260731T101530Z'),
  ].map((t) => t.headers.authorization);
  for (const b of beda) assert.notEqual(b, dasar);
  // …dan tetap DETERMINISTIK untuk masukan yang sama.
  assert.equal(tandatanganiGet(KRED, 'a.txt', { x: '1' }, '20260731T101530Z').headers.authorization, dasar);
});

test('waktu DISUNTIK, tidak dibaca dari jam sistem', () => {
  /* Fungsi yang membaca jamnya sendiri tak bisa diuji terhadap vektor mana
     pun — dan vektor itulah satu-satunya bukti yang tersedia tanpa akun. */
  const src = readFileSync('src/modules/connections/s3.ts', 'utf8');
  assert.ok(!/new Date\(\)|Date\.now\(\)/.test(src),
    'modul tanda tangan membaca jam sendiri — tak bisa diuji deterministik');
  assert.equal(stempelAmz(new Date(Date.UTC(2026, 6, 31, 10, 15, 30))), '20260731T101530Z');
});

/* ── pelolosan: nama berkas nyata, bukan nama contoh ─────────────────── */

test('tanda kurung & spasi diloloskan RFC 3986', () => {
  /* encodeURIComponent membiarkan !'()* lolos, dan berkas bernama
     "Laporan (final).pdf" sama sekali tidak langka. Satu karakter tak
     terlolosi = tanda tangan meleset = 403 yang tak menjelaskan apa pun. */
  assert.equal(lolosJalur('folder/Laporan (final).pdf'), 'folder/Laporan%20%28final%29.pdf');
  assert.equal(lolosJalur("a'b*c!d"), 'a%27b%2Ac%21d');
});

test('garis miring TIDAK diloloskan — ia pemisah jalur', () => {
  /* Kalau ikut diloloskan, seluruh kunci jadi satu segmen dan S3 mencari
     objek bernama "a%2Fb%2Fc.txt" yang tak pernah ada. */
  assert.equal(lolosJalur('a/b/c.txt'), 'a/b/c.txt');
});

test('kueri kanonik DIURUTKAN menurut nama', () => {
  /* S3 menandatangani kueri terurut. Urutan sisipan akan cocok kebetulan
     pada kasus satu parameter dan gagal begitu paginasi menambah yang kedua
     — jadi rusaknya baru muncul pada bucket besar. */
  assert.equal(kueriKanonik({ prefix: 'a', 'list-type': '2' }), 'list-type=2&prefix=a');
});

/* ── endpoint: kunci pelanggan menyeberangi kabel ini ────────────────── */

test('endpoint http polos DITOLAK, loopback tetap boleh', () => {
  assert.throws(() => endpointS3({ ...KRED, endpoint: 'http://minio.contoh.co.id' }), /harus https/);
  assert.doesNotThrow(() => endpointS3({ ...KRED, endpoint: 'http://localhost:9000' }));
  assert.doesNotThrow(() => endpointS3({ ...KRED, endpoint: 'http://127.0.0.1:9000' }));
});

test('gaya alamat menentukan host — menebaknya salah menghasilkan 404', () => {
  assert.equal(hostS3(KRED), 'contoh.s3.us-east-1.amazonaws.com');
  assert.equal(hostS3({ ...KRED, gayaPath: true, endpoint: 'https://minio.co.id' }), 'minio.co.id');
  const t = tandatanganiGet({ ...KRED, gayaPath: true, endpoint: 'https://minio.co.id' },
    'x.txt', {}, '20260731T101530Z');
  assert.ok(t.url.startsWith('https://minio.co.id/contoh/x.txt'), `url path-style salah: ${t.url}`);
});

/* ── daftar isi: tempat kerusakan paling senyap bersembunyi ──────────── */

const XML = `<?xml version="1.0"?><ListBucketResult>
  <IsTruncated>true</IsTruncated>
  <NextContinuationToken>tok123</NextContinuationToken>
  <Contents><Key>a/kebijakan.pdf</Key><ETag>&quot;abc123&quot;</ETag><Size>2048</Size></Contents>
  <Contents><Key>a/</Key><ETag>&quot;d41d8&quot;</ETag><Size>0</Size></Contents>
  <Contents><Key>a/Laporan &amp; Neraca.docx</Key><ETag>"ef456-3"</ETag><Size>91</Size></Contents>
</ListBucketResult>`;

test('daftar terpotong DITERUSKAN apa adanya', () => {
  /* INI yang paling penting di seluruh kartu. Sinkronisasi memakai selisih
     daftar untuk memutuskan berkas mana yang HILANG dan harus dibuang.
     Daftar terpotong berarti berkas di luar jendela hanya tak terlihat,
     bukan tak ada — melaporkannya lengkap akan MENGHAPUS dokumen yang masih
     hidup, dan baru ketahuan saat chatbot menjawab "tidak ada" untuk berkas
     yang jelas ada di bucket. */
  assert.equal(parseDaftar(XML).terpotong, true);
  assert.equal(parseDaftar('<ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>').terpotong, false);
  // Tak ada elemennya sama sekali → JANGAN diam-diam dianggap lengkap? Tidak:
  // S3 selalu mengirimnya, dan menganggap ketiadaannya "terpotong" akan
  // mematikan deteksi penghapusan selamanya. Yang benar: false.
  assert.equal(parseDaftar('<ListBucketResult></ListBucketResult>').terpotong, false);
});

test('objek "folder" berukuran nol dibuang', () => {
  /* Folder di S3 tak ada; yang ada objek berakhiran '/' yang dibuat konsol
     web. Mengunduhnya menghasilkan berkas kosong yang masuk sebagai dokumen
     tanpa isi. */
  const d = parseDaftar(XML);
  assert.deepEqual(d.objek.map((o) => o.key), ['a/kebijakan.pdf', 'a/Laporan & Neraca.docx']);
});

test('ETag dilepas tanda kutipnya, multipart tetap utuh', () => {
  const d = parseDaftar(XML);
  assert.equal(d.objek[0].etag, 'abc123', 'tanda kutip &quot; ikut terbawa jadi versi');
  assert.equal(d.objek[1].etag, 'ef456-3', 'akhiran multipart terpotong — versi jadi salah');
  assert.equal(d.objek[0].size, 2048);
});

test('entitas XML dikembalikan, dan &amp; dipulihkan TERAKHIR', () => {
  /* Kalau &amp; dipulihkan lebih dulu, "&amp;lt;" berubah jadi "<" — nama
     berkas rusak, externalId ikut rusak, dan berkas yang sama akan
     di-ingest ulang tiap sync karena manifestnya tak pernah cocok. */
  assert.equal(parseDaftar(XML).objek[1].key, 'a/Laporan & Neraca.docx');
  const nakal = '<ListBucketResult><Contents><Key>x&amp;lt;y.txt</Key><ETag>"e"</ETag><Size>1</Size></Contents></ListBucketResult>';
  assert.equal(parseDaftar(nakal).objek[0].key, 'x&lt;y.txt');
});

test('token lanjutan dibaca — tanpa itu hanya 1.000 objek pertama terlihat', () => {
  assert.equal(parseDaftar(XML).lanjutan, 'tok123');
  assert.ok(MAKS_HALAMAN >= 5 && MAKS_HALAMAN <= 50, 'batas halaman tak masuk akal');
});

/* ── rahasia tak boleh tergeletak di basis data ──────────────────────── */

test('secret access key DIENKRIPSI sebelum masuk config', () => {
  /* data_sources.config ikut di setiap SELECT, ikut ke layar daftar sumber,
     dan ikut ke cadangan basis data. Kunci S3 polos di sana bisa membaca
     seluruh bucket pelanggan — dan tak seperti token OAuth, ia tak
     kedaluwarsa sendiri. */
  const route = readFileSync('src/app/api/sources/route.ts', 'utf8');
  assert.ok(/encryptSecret\(secretAccessKey\)/.test(route), 'secret tak dienkripsi');
  assert.ok(/const \{ secretAccessKey, \.\.\.sisa \}/.test(route),
    'secret polos tidak dibuang dari config — versi terenkripsi DAN polos ikut tersimpan');
  assert.ok(/config: amankanRahasia\(/.test(route),
    'jalur insert tak melewati amankanRahasia — ada jalan memasukkan secret polos');

  const sync = readFileSync('src/modules/knowledge/sync.service.ts', 'utf8');
  const blok = sync.slice(sync.indexOf("if (kind === 's3')"));
  assert.ok(/decryptSecret\(secretEnc\)/.test(blok), 'sync membaca secret tanpa dekripsi');
  assert.ok(!/config\.secretAccessKey\b/.test(blok),
    'sync masih membaca secret polos — jalur lama tetap hidup');
});

test('sumber S3 ikut diantre sync, bukan diam setelah dibuat', () => {
  /* Kalau lupa, sumbernya tersimpan dengan status "pending" selamanya dan
     tak ada satu pun galat yang menjelaskan kenapa KB tetap kosong. */
  const route = readFileSync('src/app/api/sources/route.ts', 'utf8');
  const daftar = /if \(\[([^\]]*)\]\.includes\(parsed\.data\.kind\)\)/.exec(route)?.[1] ?? '';
  assert.ok(daftar.includes("'s3'"), 's3 tak masuk daftar jenis yang diantre sync');
  assert.ok(!daftar.includes("'upload'"), 'upload ikut diantre — tak ada yang bisa disinkronkan');
});

/* ── lingkaran paginasi: celah yang meloloskan cacat pertama ─────────── */

/**
 * Uji versi pertama kartu ini hanya menyentuh parseDaftar() — fungsi murni
 * yang memang benar — lalu MENGANDAIKAN lingkaran di sekelilingnya mewarisi
 * kebenarannya. Ia tidak: `if (!hal.terpotong || !lanjutan) terpotong = false`
 * menyetel "daftar lengkap" justru pada keadaan di mana penelusuran berhenti
 * di tengah. Akibatnya persis yang paling ingin dihindari — planDelta
 * memperlakukan berkas yang belum sempat terlihat sebagai terhapus.
 *
 * Karena itu bagian ini memalsukan `fetch`: satu-satunya cara memeriksa
 * keputusan yang diambil ANTAR halaman.
 */
function palsukanFetch(halaman: string[]) {
  const asli = globalThis.fetch;
  let ke = 0;
  const dipanggil: string[] = [];
  globalThis.fetch = (async (url: string) => {
    dipanggil.push(String(url));
    const badan = halaman[Math.min(ke++, halaman.length - 1)];
    return { ok: true, text: async () => badan } as unknown as Response;
  }) as typeof fetch;
  return { pulihkan: () => { globalThis.fetch = asli; }, dipanggil };
}

const halamanXml = (opts: { terpotong: boolean; token?: string; key: string }) =>
  `<ListBucketResult><IsTruncated>${opts.terpotong}</IsTruncated>`
  + (opts.token ? `<NextContinuationToken>${opts.token}</NextContinuationToken>` : '')
  + `<Contents><Key>${opts.key}</Key><ETag>"e"</ETag><Size>10</Size></Contents></ListBucketResult>`;

test('TERPOTONG TANPA TOKEN dilaporkan terpotong — bukan lengkap', async (t) => {
  /* Cacat nyata dari versi pertama (31 Jul 2026, commit 88e2509). S3 bilang
     masih ada sisa tapi tak memberi token lanjutan; penelusuran berhenti di
     tengah. Melaporkannya lengkap = planDelta menghapus dokumen yang masih
     hidup, dan baru ketahuan saat chatbot menjawab "tidak ada" untuk berkas
     yang jelas ada di bucket. */
  const { daftarObjek } = await import('../src/modules/knowledge/storage/s3');
  const f = palsukanFetch([halamanXml({ terpotong: true, key: 'a.pdf' })]);
  t.after(f.pulihkan);
  const hasil = await daftarObjek(KRED, '', new Date(Date.UTC(2026, 6, 31)));
  assert.equal(hasil.terpotong, true, 'berhenti di tengah tapi dilaporkan lengkap');
  assert.equal(hasil.objek.length, 1);
});

test('daftar tuntas dilaporkan LENGKAP — penghapusan harus tetap bisa terjadi', async (t) => {
  /* Sisi sebaliknya, dan sama pentingnya: kalau "terpotong" dibuat selalu
     true demi aman, deteksi berkas terhapus mati selamanya dan dokumen yang
     sudah dicabut pelanggan tetap dijawab chatbot. */
  const { daftarObjek } = await import('../src/modules/knowledge/storage/s3');
  const f = palsukanFetch([halamanXml({ terpotong: false, key: 'a.pdf' })]);
  t.after(f.pulihkan);
  assert.equal((await daftarObjek(KRED, '', new Date(Date.UTC(2026, 6, 31)))).terpotong, false);
});

test('token lanjutan diikuti sampai habis, lalu lengkap', async (t) => {
  const { daftarObjek } = await import('../src/modules/knowledge/storage/s3');
  const f = palsukanFetch([
    halamanXml({ terpotong: true, token: 'tok1', key: 'a.pdf' }),
    halamanXml({ terpotong: false, key: 'b.pdf' }),
  ]);
  t.after(f.pulihkan);
  const hasil = await daftarObjek(KRED, '', new Date(Date.UTC(2026, 6, 31)));
  assert.deepEqual(hasil.objek.map((o) => o.key), ['a.pdf', 'b.pdf']);
  assert.equal(hasil.terpotong, false);
  assert.ok(f.dipanggil[1].includes('continuation-token=tok1'), 'token tak dikirim di halaman kedua');
});

test('jatah halaman habis sementara S3 masih menyisakan → terpotong', async (t) => {
  const { MAKS_HALAMAN: maks, daftarObjek } = await import('../src/modules/knowledge/storage/s3');
  const f = palsukanFetch([halamanXml({ terpotong: true, token: 'terus', key: 'a.pdf' })]);
  t.after(f.pulihkan);
  const hasil = await daftarObjek(KRED, '', new Date(Date.UTC(2026, 6, 31)));
  assert.equal(hasil.terpotong, true);
  assert.equal(f.dipanggil.length, maks, 'jatah halaman tak ditegakkan — penelusuran tanpa ujung');
});

test('tiap halaman ditandatangani ULANG dengan waktunya sendiri', async () => {
  /* Satu cap waktu untuk seluruh penelusuran akan menua selama berjalan, dan
     bucket besar gagal di halaman terakhir dengan galat yang menuduh jam
     server padahal jamnya benar. */
  const src = readFileSync('src/modules/knowledge/storage/s3.ts', 'utf8');
  const blok = src.slice(src.indexOf('for (let halaman'), src.indexOf('// Kehabisan jatah'));
  assert.ok(/stempelAmz\(saat \?\? new Date\(\)\)/.test(blok),
    'cap waktu dihitung di luar lingkaran — tanda tangan menua saat menelusuri');
});
