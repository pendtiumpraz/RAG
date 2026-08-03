import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateKeyPairSync, createPrivateKey, sign } from 'node:crypto';

import {
  AMBANG_PERINGATAN_HARI, barisLogLisensi, periksaLisensi, sisaHari, uraiKunci,
  type IsiLisensi,
} from '../src/modules/core/lisensi';

/**
 * LISENSI ON-PREMISE.
 *
 * Kode lisensi punya bentuk kegagalan yang tak dialami kode lain: ia berjalan
 * di server orang lain, di jaringan yang tak bisa kita lihat, dan salahnya
 * baru ketahuan lewat telepon dari pelanggan yang marah. Dua arah salah, dan
 * keduanya mahal — lisensi palsu yang diterima berarti produk dibajak; lisensi
 * SAH yang ditolak berarti pelanggan yang sudah membayar melihat layanannya
 * merah. Yang kedua lebih sering terjadi dan lebih merusak.
 */

/* Sepasang kunci nyata, dibuat sekali di sini. Menyalin kunci tetap ke dalam
   tes berarti tes berhenti membuktikan bahwa penerbitannya benar-benar
   bekerja — ia hanya membuktikan bahwa string yang sama masih sama. */
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const PUB = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
const PRIV = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

function terbitkan(isi: IsiLisensi): string {
  const data = Buffer.from(JSON.stringify(isi), 'utf8');
  const sig = sign(null, data, createPrivateKey(PRIV));
  return `${data.toString('base64url')}.${sig.toString('base64url')}`;
}

const env = (extra: Record<string, string> = {}) => ({
  DEPLOYMENT_MODE: 'onprem', LICENSE_PUBLIC_KEY: PUB, ...extra,
}) as unknown as NodeJS.ProcessEnv;

const HARI_INI = new Date('2026-08-03T00:00:00Z');

/* ── jalur bahagia ────────────────────────────────────────────────────── */

test('kunci yang diterbitkan dengan kunci privat yang benar → aktif', () => {
  const k = terbitkan({ untuk: 'PT Contoh', sampai: '2027-01-01', edisi: 'enterprise' });
  const h = periksaLisensi(env({ LICENSE_KEY: k }), HARI_INI);
  assert.equal(h.status, 'aktif');
  assert.equal(h.isi?.untuk, 'PT Contoh');
  assert.ok((h.sisaHari ?? 0) > 100);
  assert.equal(h.perluPerhatian, false);
});

test('lisensi tanpa masa berlaku tetap aktif, dan sisaHari-nya null', () => {
  /* Bukan 0 dan bukan Infinity: keduanya akan dibandingkan dengan ambang
     peringatan oleh kode berikutnya, dan salah satunya akan membuat lisensi
     abadi berbunyi "hampir habis" selamanya. */
  const h = periksaLisensi(env({ LICENSE_KEY: terbitkan({ untuk: 'PT Abadi' }) }), HARI_INI);
  assert.equal(h.status, 'aktif');
  assert.equal(h.sisaHari, null);
  assert.equal(h.perluPerhatian, false);
});

/* ── penolakan ────────────────────────────────────────────────────────── */

test('TANDA TANGAN dari kunci privat LAIN ditolak', () => {
  const lain = generateKeyPairSync('ed25519');
  const data = Buffer.from(JSON.stringify({ untuk: 'PT Pembajak', sampai: '2099-01-01' }), 'utf8');
  const sig = sign(null, data, lain.privateKey);
  const k = `${data.toString('base64url')}.${sig.toString('base64url')}`;
  assert.equal(periksaLisensi(env({ LICENSE_KEY: k }), HARI_INI).status, 'tidak-sah');
});

test('ISI yang diubah membatalkan tanda tangan yang sah', () => {
  /* Serangan yang paling jelas: ambil lisensi percobaan sendiri, ganti
     tanggalnya jadi 2099, pasang tanda tangan lama. */
  const asli = terbitkan({ untuk: 'PT Contoh', sampai: '2026-08-10' });
  const sig = asli.split('.')[1];
  const palsu = Buffer.from(JSON.stringify({ untuk: 'PT Contoh', sampai: '2099-01-01' }), 'utf8')
    .toString('base64url');
  assert.equal(periksaLisensi(env({ LICENSE_KEY: `${palsu}.${sig}` }), HARI_INI).status, 'tidak-sah');
});

test('kunci terpotong saat disalin GAGAL TERBACA, bukan terbaca separuh', () => {
  const k = terbitkan({ untuk: 'PT Contoh' });
  assert.equal(uraiKunci(k.split('.')[0]), null, 'kunci tanpa tanda tangan diterima');
  assert.equal(uraiKunci(''), null);
  assert.equal(uraiKunci('.'), null);
  assert.equal(uraiKunci('bukan-base64.juga-bukan'), null);
});

test('payload sah secara base64 tapi bukan lisensi ditolak', () => {
  /* JSON valid tanpa `untuk` bukan lisensi. Menerimanya berarti konsol
     menampilkan pemegang lisensi kosong, dan tak ada yang tahu itu artinya
     "rusak" atau "memang begitu". */
  const data = Buffer.from(JSON.stringify({ sampai: '2099-01-01' }), 'utf8');
  const sig = sign(null, data, createPrivateKey(PRIV));
  assert.equal(uraiKunci(`${data.toString('base64url')}.${sig.toString('base64url')}`), null);
  const kosong = Buffer.from(JSON.stringify({ untuk: '   ' }), 'utf8');
  assert.equal(uraiKunci(`${kosong.toString('base64url')}.${sig.toString('base64url')}`), null);
});

/* ── kedaluwarsa & peringatan dini ───────────────────────────────────── */

test('kedaluwarsa DILAPORKAN, dan tak ada yang dimatikan', () => {
  /* Ini mesin pengetahuan yang sedang dipakai orang bekerja. Mematikannya
     karena urusan antara dua bagian keuangan berarti menghukum seluruh
     karyawan pelanggan — dan yang pertama menelepon bukan yang bisa
     memperbaikinya. Perangkat lunak yang mengunci dirinya di tengah hari
     kerja tak pernah dibeli dua kali. */
  const k = terbitkan({ untuk: 'PT Contoh', sampai: '2026-07-01' });
  const h = periksaLisensi(env({ LICENSE_KEY: k }), HARI_INI);
  assert.equal(h.status, 'kedaluwarsa');
  assert.ok((h.sisaHari ?? 0) < 0);
  assert.equal(h.perluPerhatian, true);
  assert.ok(/Tak ada fitur yang dimatikan/.test(h.pesan),
    'pesan kedaluwarsa tak menyebut bahwa layanannya tetap jalan');

  /* Dan tak ada satu pun jalur di kode ini yang memutus sesuatu. */
  const src = readFileSync('src/modules/core/lisensi.ts', 'utf8');
  assert.ok(!/process\.exit|throw new Error\(/.test(src),
    'kode lisensi punya jalur yang menghentikan proses');
});

test('peringatan dini muncul 30 hari sebelum habis, bukan di hari terakhir', () => {
  /* Pengadaan korporasi butuh berminggu-minggu. Peringatan yang muncul di hari
     terakhir datang terlalu telat untuk bisa ditindaklanjuti siapa pun. */
  const dalam = (hari: number) =>
    new Date(HARI_INI.getTime() + hari * 86_400_000).toISOString().slice(0, 10);

  const jauh = periksaLisensi(env({ LICENSE_KEY: terbitkan({ untuk: 'X', sampai: dalam(120) }) }), HARI_INI);
  assert.equal(jauh.perluPerhatian, false);

  const dekat = periksaLisensi(env({ LICENSE_KEY: terbitkan({ untuk: 'X', sampai: dalam(10) }) }), HARI_INI);
  assert.equal(dekat.perluPerhatian, true, 'lisensi sisa 10 hari tak menarik perhatian');

  assert.equal(AMBANG_PERINGATAN_HARI, 30);
});

test('tanggal yang tak bisa diurai = tanpa masa berlaku, bukan kedaluwarsa', () => {
  /* Menganggapnya kedaluwarsa akan membuat lisensi yang formatnya sedikit
     beda menampilkan merah besar di konsol pelanggan yang tak melakukan
     kesalahan apa pun. */
  assert.equal(sisaHari('bukan-tanggal', HARI_INI), null);
  assert.equal(sisaHari(undefined, HARI_INI), null);
  assert.equal(sisaHari('', HARI_INI), null);
});

/* ── keadaan yang bukan salah pelanggan ──────────────────────────────── */

test('SaaS: lisensi tak berlaku, dan tak berisik', () => {
  const h = periksaLisensi({ DEPLOYMENT_MODE: 'saas' } as NodeJS.ProcessEnv, HARI_INI);
  assert.equal(h.status, 'tak-berlaku');
  assert.equal(h.perluPerhatian, false);
  assert.equal(barisLogLisensi(h), null, 'SaaS mencetak baris lisensi di log tiap proses');
});

test('on-prem tanpa kunci: berjalan penuh, tapi TERLIHAT', () => {
  const h = periksaLisensi(env(), HARI_INI);
  assert.equal(h.status, 'kosong');
  assert.equal(h.perluPerhatian, true);
  assert.ok(/tetap berjalan penuh/.test(h.pesan));
});

test('kunci publik hilang dilaporkan APA ADANYA, bukan disamarkan jadi aktif', () => {
  /* Kalau ketiadaan kunci publik diperlakukan sebagai "lolos", lisensi
     berhenti berarti apa pun: siapa pun tinggal menghapus satu baris env. */
  const k = terbitkan({ untuk: 'PT Contoh' });
  const h = periksaLisensi(
    { DEPLOYMENT_MODE: 'onprem', LICENSE_KEY: k } as NodeJS.ProcessEnv, HARI_INI);
  assert.equal(h.status, 'tidak-sah');
  assert.ok(/LICENSE_PUBLIC_KEY/.test(h.pesan));
});

/* ── tanpa panggilan keluar ───────────────────────────────────────────── */

test('pemeriksaan lisensi TIDAK menyentuh jaringan sama sekali', () => {
  /* Pelanggan on-premise memilih on-premise supaya tak ada panggilan keluar.
     Lisensi yang menelepon pulang akan ditolak bagian keamanan mereka — dan
     kalaupun lolos, pemasangan mereka mati saat jaringan KITA mati. */
  const src = readFileSync('src/modules/core/lisensi.ts', 'utf8');
  for (const terlarang of ['fetch(', 'http.request', 'https.request', 'axios', 'XMLHttpRequest']) {
    assert.ok(!src.includes(terlarang), `lisensi memanggil jaringan lewat ${terlarang}`);
  }
  // Dan tak menyentuh basis data — supaya bisa diperiksa sebelum DB siap.
  assert.ok(!/from '\.\/db|drizzle-orm/.test(src), 'lisensi bergantung pada basis data');
});

/* ── penerbitnya ──────────────────────────────────────────────────────── */

test('kunci privat dibaca dari env, tak pernah dari repo', () => {
  const cli = readFileSync('scripts/license.ts', 'utf8');
  assert.ok(/process\.env\.LICENSE_PRIVATE_KEY/.test(cli), 'kunci privat tak dari env');
  assert.ok(!/BEGIN PRIVATE KEY-----\\n[A-Za-z0-9+/]/.test(cli), 'ada kunci privat tertulis di skrip');
  // Dan tak ada rute HTTP yang bisa menerbitkan lisensi.
  const rute = readFileSync('src/app/api/admin/license/route.ts', 'utf8');
  assert.ok(!/POST|PATCH|PUT|DELETE/.test(rute),
    'ada endpoint yang mengubah lisensi — satu akun superadmin yang jebol = lisensi apa pun');
});

test('lisensi TIDAK bocor lewat /api/health yang publik', () => {
  /* Health endpoint adalah permukaan yang paling sering dipindai orang, dan
     isi lisensi menyebut nama organisasi, masa berlaku, dan nomor seri. */
  const health = readFileSync('src/app/api/health/route.ts', 'utf8');
  assert.ok(!/lisensi|license/i.test(health), 'health endpoint menyebut lisensi');
});

test('panduan on-prem tak lagi bilang lisensi belum ada', () => {
  const doc = readFileSync('docs/ONPREM.md', 'utf8');
  assert.ok(!/Mekanisme lisensi.{0,40}belum ada/s.test(doc),
    'panduan masih menyatakan lisensi belum ada');
  assert.ok(/LICENSE_KEY/.test(doc), 'panduan tak menyebut variabel lisensinya');
  assert.ok(/LICENSE_PUBLIC_KEY/.test(doc));
  const envx = readFileSync('.env.example', 'utf8');
  for (const v of ['LICENSE_KEY', 'LICENSE_PUBLIC_KEY']) {
    assert.ok(new RegExp(`^#?\\s*${v}=`, 'm').test(envx), `${v} tak ada di .env.example`);
  }
});
