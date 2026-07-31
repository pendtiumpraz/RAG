import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env.DATABASE_URL ??= 'postgres://x:y@localhost:5432/z';
process.env.CREDENTIALS_ENCRYPTION_KEY ??= '0'.repeat(64);

/**
 * DUA FAKTOR — jalur pendaftaran, login, dan pemulihan.
 *
 * Yang dijaga di sini adalah kegagalan yang TIDAK melempar apa pun: 2FA yang
 * bisa dilewati, kode yang bisa diulang, rahasia yang tersimpan terbaca, dan
 * — yang paling sering terlupa — pengguna yang terkunci dari akunnya sendiri
 * oleh fitur yang dimaksudkan melindunginya.
 */

const SVC = readFileSync('src/modules/auth/two-factor.service.ts', 'utf8');
const OPT = readFileSync('src/modules/auth/auth.options.ts', 'utf8');
const RUTE = readFileSync('src/app/api/auth/two-factor/route.ts', 'utf8');
const MIG = readFileSync('migrations/0038_two_factor.sql', 'utf8');
const SCHEMA = readFileSync('src/modules/core/db/schema.ts', 'utf8');

test('2FA diperiksa SESUDAH kata sandi terbukti benar', async () => {
  /* Memeriksanya lebih dulu memberi tahu penyerang mana email yang memakai
     2FA tanpa ia perlu tahu kata sandinya sama sekali — endpoint login
     berubah jadi alat pemetaan akun bernilai tinggi. */
  const fn = OPT.slice(OPT.indexOf('async authorize('), OPT.indexOf('providers: [') + 2000);
  const iSandi = fn.indexOf('verifyCredentials');
  const iDua = fn.indexOf('twoFactorService.aktif');
  assert.ok(iSandi > 0 && iDua > iSandi,
    'pemeriksaan 2FA mendahului kata sandi — email ber-2FA jadi bisa dipetakan');
});

test('akun TANPA 2FA tak tersentuh sama sekali', async () => {
  /* Kalau tidak, migrasi 0038 akan mengunci setiap pengguna yang sedang
     login — termasuk orang yang menjalankan migrasinya. */
  assert.ok(/if \(await twoFactorService\.aktif\(user\.id\)\) \{/.test(OPT),
    'pemeriksaan 2FA tak dipagari keadaan aktif');
  /* Seluruh KOLOM migrasi boleh NULL: 2FA menyala per AKUN, bukan per sistem.
     Diperiksa pada baris `add column` saja — predikat indeks parsial memang
     memuat `is not null`, dan itu bukan batasan pada barisnya. */
  const kolom = MIG.split('\n').filter((b) => /^alter table/i.test(b.trim()));
  assert.equal(kolom.length, 4, 'jumlah kolom 2FA berubah tanpa tesnya ikut berubah');
  for (const b of kolom) {
    assert.ok(!/not null/i.test(b), `kolom 2FA NOT NULL akan mengunci pengguna lama: ${b}`);
    assert.ok(!/default/i.test(b), `kolom 2FA ber-DEFAULT akan menyalakan 2FA serentak: ${b}`);
  }
});

test('rahasia disimpan TERENKRIPSI, bukan teks polos', async () => {
  /* Rahasia TOTP setara kata sandi kedua: siapa pun yang membacanya bisa
     membuat kode sah selamanya, tanpa jejak apa pun di log. */
  assert.ok(/encryptSecret\(rahasia\)/.test(SVC), 'rahasia TOTP disimpan apa adanya');
  assert.ok(/decryptSecret\(u\.secret\)/.test(SVC), 'rahasia dibaca tanpa dekripsi');
  assert.ok(/TERENKRIPSI/.test(MIG), 'migrasi tak menyatakan kolomnya terenkripsi');
});

test('pendaftaran TIDAK aktif sampai satu kode benar dimasukkan', async () => {
  /* Rahasia yang langsung berlaku akan mengunci orang yang salah memindai QR
     dari akunnya sendiri — ia tak akan pernah punya kode yang cocok, dan tak
     ada yang bisa dilakukannya. */
  const mulai = SVC.slice(SVC.indexOf('async mulai('), SVC.indexOf('async konfirmasi('));
  assert.ok(/totpEnabledAt: null/.test(mulai), 'mulai() langsung mengaktifkan 2FA');
  const konf = SVC.slice(SVC.indexOf('async konfirmasi('), SVC.indexOf('async verifikasi('));
  const iCek = konf.indexOf('verifikasiTotp');
  const iAktif = konf.indexOf('totpEnabledAt: new Date()');
  assert.ok(iCek > 0 && iAktif > iCek, 'aktivasi terjadi sebelum kodenya diperiksa');
});

test('langkah waktu dicatat SEBELUM login diluluskan', async () => {
  /* Kalau sesudah, dua permintaan yang tiba bersamaan dengan kode yang sama
     akan lolos keduanya — dan penahan pemakaian-ulang jadi hiasan. */
  const fn = SVC.slice(SVC.indexOf('async verifikasi('), SVC.indexOf('async matikan('));
  const iTulis = fn.indexOf('totpLastStep: hasil.langkah');
  const iReturn = fn.indexOf('return true');
  assert.ok(iTulis > 0 && iTulis < iReturn, 'langkah dicatat setelah login lolos');
  assert.ok(/langkahTerakhir: u\.lastStep/.test(fn), 'langkah terakhir tak dikirim ke verifikator');
});

test('kode cadangan: HASH, sekali pakai, dan dicoba PALING AKHIR', async () => {
  const fn = SVC.slice(SVC.indexOf('async verifikasi('), SVC.indexOf('async matikan('));
  // Dicoba setelah TOTP gagal — mencobanya lebih dulu berarti setiap upaya
  // login membandingkan sepuluh hash scrypt, dan scrypt memang dibuat lambat.
  const iTotp = fn.indexOf('verifikasiTotp');
  const iCadangan = fn.indexOf('u.backup');
  assert.ok(iTotp > 0 && iCadangan > iTotp,
    'kode cadangan dicoba sebelum TOTP — jalur login jadi alat penghabis CPU');
  // Sekali pakai.
  assert.ok(/sisa\.filter\(\(_, j\) => j !== i\)/.test(fn), 'kode cadangan tak dibuang setelah dipakai');
  // Disimpan sebagai hash, bukan teks.
  assert.ok(/hashPassword\(normalisasiCadangan\(k\)\)/.test(SVC),
    'kode cadangan disimpan terbaca — satu kebocoran basis data melewati seluruh 2FA');
});

test('mematikan 2FA menuntut KATA SANDI, bukan sesi yang hidup', async () => {
  /* Sesi yang hidup adalah persis yang dimiliki penyerang pencuri cookie.
     Kalau mematikan 2FA cukup dengan sesi, lapisan keduanya bisa dilepas
     oleh orang yang justru harus ditahannya. */
  const fn = SVC.slice(SVC.indexOf('async matikan('), SVC.indexOf('async sisaCadangan('));
  assert.ok(/verifyPassword\(kataSandi, u\.hash\)/.test(fn), 'mematikan 2FA tak menuntut kata sandi');
  assert.ok(/kataSandi: z\.string\(\)\.min\(1\)/.test(RUTE), 'rute tak menuntut kata sandi');
});

test('endpoint hanya menyentuh akun PEMANGGIL', async () => {
  /* Menerima userId dari badan permintaan akan membuat siapa pun yang punya
     sesi bisa mematikan 2FA milik orang lain — bug yang bentuknya persis
     seperti fitur. */
  assert.ok(/getCurrentUser\(\)/.test(RUTE), 'rute tak mengambil identitas dari sesi');
  assert.ok(!/userId: z\.string/.test(RUTE), 'userId bisa dikirim lewat badan permintaan');
  assert.ok(/twoFactorService\.\w+\(user\.id/.test(RUTE), 'service dipanggil dengan id selain milik pemanggil');
});

test('indeks migrasi & schema.ts memakai NAMA yang sama', () => {
  // Nama berbeda → db:push membuat indeks kedua yang isinya sama sambil
  // membiarkan yang lama.
  assert.ok(/idx_users_totp_enabled/.test(MIG) && /idx_users_totp_enabled/.test(SCHEMA));
  assert.ok(/create index if not exists/.test(MIG), 'migrasi tak idempoten');
  assert.ok(/add column if not exists/.test(MIG), 'penambahan kolom tak idempoten');
});

test('kolom kode di layar login baru muncul SETELAH sandi terbukti benar', () => {
  /* Menampilkannya sejak awal memberi tahu penebak email mana yang memakai
     2FA — daftar akun bernilai tinggi, didapat tanpa satu pun kata sandi. */
  const HAL = readFileSync('src/app/auth/page.tsx', 'utf8');
  assert.ok(/\{mintaTotp && \(/.test(HAL), 'kolom kode tak dipagari keadaan apa pun');
  // Satu-satunya yang menyalakannya adalah cabang outcome 'active' —
  // dan outcome baru dijawab server setelah kata sandi terbukti.
  const nyala = HAL.match(/setMintaTotp\(true\)/g) ?? [];
  assert.equal(nyala.length, 1, 'ada jalan lain menyalakan kolom kode');
  const awal = HAL.indexOf("why.outcome === 'active'");
  const akhir = HAL.indexOf("else setError('Email atau password salah", awal);
  assert.ok(awal > 0 && akhir > awal, 'bentuk cabang login berubah — tesnya perlu ikut dibaca ulang');
  assert.ok(HAL.slice(awal, akhir).includes('setMintaTotp(true)'),
    "setMintaTotp(true) tidak berada di cabang outcome 'active'");
  // Dan kodenya benar-benar ikut terkirim — tanpa ini, menyalakan 2FA
  // mengunci pemiliknya dari akunnya sendiri secara permanen.
  assert.ok(/signIn\('credentials', \{[\s\S]{0,200}totp: totp\.trim\(\)/.test(HAL),
    'kode tak dikirim ke signIn — akun ber-2FA jadi mustahil dimasuki');
});

test('QR gagal dirender tidak menggagalkan pendaftaran', () => {
  /* Rahasianya tetap bisa diketik manual; menjatuhkan seluruh alur karena
     satu gambar akan menutup 2FA untuk siapa pun yang render QR-nya gagal. */
  assert.ok(/\.catch\(\(\) => null\)/.test(RUTE), 'kegagalan render QR menjatuhkan pendaftaran');
});
