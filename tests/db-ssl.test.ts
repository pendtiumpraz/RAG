import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env.DATABASE_URL ??= 'postgres://x:y@localhost:5432/z';
process.env.CREDENTIALS_ENCRYPTION_KEY ??= '0'.repeat(64);

const load = () => import('../src/modules/core/db/ssl');

test('host publik SELALU pakai TLS — apa pun penyedianya', async () => {
  const { decideSsl } = await load();
  // Ini inti perbaikannya. Versi lama menebak dari nama host (`neon.tech`,
  // `.aws.`), jadi TLS MATI DIAM-DIAM begitu basis datanya pindah ke VPS —
  // dan seluruh isi dokumen pelanggan menyeberang internet sebagai teks
  // polos, tanpa satu pun galat yang memberi tahu.
  for (const h of [
    'postgres://u:p@srv123.hostinger.com:5432/nalar',
    'postgres://u:p@db.contoh.co.id:5432/nalar',
    'postgres://u:p@ep-x.us-east-1.aws.neon.tech/db',
    'postgres://u:p@mydb.abc.ap-southeast-1.rds.amazonaws.com:5432/db',
    'postgres://u:p@203.0.113.10:5432/db',
  ]) {
    assert.equal(decideSsl(h).ssl, 'require', `TLS mati untuk ${h}`);
  }
});

test('host lokal & jaringan privat boleh tanpa TLS', async () => {
  const { decideSsl } = await load();
  // On-premise menaruh basis data di jaringan yang sama dengan aplikasinya;
  // memaksa TLS di sana hanya menyulitkan pemasangan tanpa menambah keamanan.
  for (const h of [
    'postgres://u:p@localhost:5432/db',
    'postgres://u:p@127.0.0.1:5432/db',
    'postgres://u:p@10.0.1.5:5432/db',
    'postgres://u:p@192.168.1.20:5432/db',
    'postgres://u:p@172.16.0.9:5432/db',
    'postgres://u:p@db:5432/db',            // nama layanan docker-compose
  ]) {
    assert.equal(decideSsl(h).ssl, undefined, `TLS dipaksa untuk host lokal ${h}`);
  }
});

test('mematikan TLS pada host publik harus DINYATAKAN', async () => {
  const { decideSsl } = await load();
  const u = 'postgres://u:p@srv123.hostinger.com:5432/db?sslmode=disable';
  assert.equal(decideSsl(u).ssl, undefined);
  // Dan alasannya ikut tercatat, supaya keputusan itu bisa diaudit belakangan.
  assert.match(decideSsl(u).reason, /eksplisit/i);
});

test('connection string rusak memilih yang AMAN', async () => {
  const { decideSsl } = await load();
  // Saat tak bisa diurai, satu-satunya kesalahan yang boleh diambil adalah
  // yang terlalu ketat — bukan yang terlalu longgar.
  assert.equal(decideSsl('bukan-url-sama-sekali').ssl, 'require');
});

test('jalur baca-tulis dan jalur migrasi memakai keputusan yang SAMA', () => {
  // Kalau keduanya berbeda, migrasi bisa berjalan tanpa enkripsi pada basis
  // data yang aplikasinya sendiri menyambung terenkripsi — dan yang bocor
  // justru saat skema serta datanya dipindahkan.
  const idx = readFileSync('src/modules/core/db/index.ts', 'utf8');
  const mig = readFileSync('src/modules/core/db/migrate.ts', 'utf8');
  assert.match(idx, /decideSsl\(connectionString\)/);
  assert.match(mig, /decideSsl\(url\)/);
  // Yang dilarang adalah POLANYA — menebak TLS dengan mencocokkan nama host
  // ke regex — bukan penyebutan kata "neon" di komentar yang menjelaskan
  // kenapa cara itu ditinggalkan.
  for (const [nama, isi] of [['index.ts', idx], ['migrate.ts', mig]] as const) {
    assert.ok(!/const needSsl\s*=/.test(isi), `${nama} masih menebak TLS dari nama host`);
    assert.ok(!/ssl:\s*needSsl/.test(isi), `${nama} masih memakai tebakan TLS`);
  }
});

test('pemeriksa basis data menilai peran sesuai PERUNTUKANNYA', () => {
  // Peran aplikasi TIDAK BOLEH bisa melewati RLS; peran migrasi JUSTRU harus
  // berhak penuh. Menilai keduanya dengan satu ukuran akan melaporkan gagal
  // untuk koneksi admin yang sepenuhnya benar — dan orang akan berhenti
  // mempercayai alatnya.
  const probe = readFileSync('src/modules/core/db/probe.ts', 'utf8');
  assert.match(probe, /intent: 'app' \| 'admin'/);
  assert.match(probe, /intent === 'admin' \? \(bypass \? 'ok' : 'warn'\) : \(bypass \? 'fail' : 'ok'\)/);
  // Dan ia tak boleh benar-benar membuat tabel: alat uji harus aman
  // dijalankan terhadap produksi.
  assert.ok(!/create table if not exists _nalar_probe/.test(probe),
    'pemeriksa membuat tabel sungguhan — tak aman dijalankan ke produksi');
  assert.match(probe, /has_table_privilege/);
});
