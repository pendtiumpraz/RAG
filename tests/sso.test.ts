import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  KonfigurasiSsoDitolak, NAMA_KUKI_SSO, PRESET_SSO, domainEmail, emailCocokKoneksi,
  issuerDari, normalDomain, urlPenemuan,
} from '../src/modules/auth/sso';

/**
 * SSO ENTERPRISE (D16).
 *
 * Tak ada identity provider sungguhan di lingkungan ini, jadi alur
 * ujung-ke-ujung tak bisa dijalankan. Yang JUSTRU paling perlu dijaga memang
 * tak butuh IdP: penurunan endpoint (salah satu huruf = penolakan yang tak
 * menjelaskan apa pun), dan — jauh lebih penting — setiap jalan yang membuat
 * seseorang mendarat di TENANT YANG BUKAN MILIKNYA.
 */

const OPT = readFileSync('src/modules/auth/auth.options.ts', 'utf8');
const SVC = readFileSync('src/modules/auth/auth.service.ts', 'utf8');
const SSOSVC = readFileSync('src/modules/auth/sso.service.ts', 'utf8');

/* ── penurunan endpoint ──────────────────────────────────────────────── */

test('Entra menuntut Directory (tenant) ID berupa UUID', () => {
  /* Menerima URL penuh juga akan "bekerja", tapi lalu tak ada yang memeriksa
     bahwa yang ditempel benar-benar tenant Entra dan bukan endpoint lain —
     dan pelanggan mengetahuinya hanya lewat penolakan IdP yang bisu. */
  assert.equal(issuerDari('entra', '11111111-2222-3333-4444-555555555555'),
    'https://login.microsoftonline.com/11111111-2222-3333-4444-555555555555/v2.0');
  assert.throws(() => issuerDari('entra', 'https://login.microsoftonline.com/x'), KonfigurasiSsoDitolak);
  assert.throws(() => issuerDari('entra', 'perusahaan.onmicrosoft.com'), KonfigurasiSsoDitolak);
});

test('Okta diturunkan dari URL organisasi, bukan ditulis tangan', () => {
  assert.equal(issuerDari('okta', 'https://perusahaan.okta.com'), 'https://perusahaan.okta.com/oauth2/default');
  assert.equal(issuerDari('okta', 'https://perusahaan.okta.com/'), 'https://perusahaan.okta.com/oauth2/default');
});

test('Google satu issuer untuk semua Workspace', () => {
  /* Domainnya dipakai MEMILIH koneksi, bukan menyusun endpoint — dan
     menyusun endpoint dari domain akan menghasilkan URL yang tak pernah ada. */
  assert.equal(issuerDari('google', 'perusahaan.co.id'), 'https://accounts.google.com');
});

test('kesalahan tempel yang paling sering DIMAAFKAN, bukan ditolak bisu', () => {
  /* Garis miring di ujung dan "/.well-known/..." yang ikut tersalin adalah
     dua kesalahan yang paling sering terjadi, dan keduanya menghasilkan
     penemuan yang gagal tanpa menyebut sebabnya. */
  assert.equal(issuerDari('oidc', 'https://idp.co.id/realms/utama/'), 'https://idp.co.id/realms/utama');
  assert.equal(issuerDari('oidc', 'https://idp.co.id/realms/utama/.well-known/openid-configuration'),
    'https://idp.co.id/realms/utama');
});

test('http polos, kredensial di URL, dan isian kosong DITOLAK', () => {
  /* Endpoint ini menerima pengalihan login dan menukar kode otorisasi memakai
     client secret pelanggan; http polos berarti keduanya terbaca siapa pun di
     jalur itu. Loopback pun tak dikecualikan — IdP tak pernah berjalan di
     mesin yang sama dengan aplikasi, jadi pengecualian itu hanya membuka
     lubang tanpa melayani satu kasus nyata pun. */
  assert.throws(() => issuerDari('oidc', 'http://idp.co.id'), KonfigurasiSsoDitolak);
  assert.throws(() => issuerDari('oidc', 'http://localhost:8080'), KonfigurasiSsoDitolak);
  assert.throws(() => issuerDari('oidc', 'https://user:pw@idp.co.id'), KonfigurasiSsoDitolak);
  assert.throws(() => issuerDari('oidc', '   '), KonfigurasiSsoDitolak);
  assert.throws(() => issuerDari('okta', 'bukan-url'), KonfigurasiSsoDitolak);
});

test('URL penemuan disusun dari issuer, tanpa garis miring ganda', () => {
  assert.equal(urlPenemuan('https://idp.co.id/realms/a'),
    'https://idp.co.id/realms/a/.well-known/openid-configuration');
  assert.equal(urlPenemuan('https://idp.co.id/'),
    'https://idp.co.id/.well-known/openid-configuration');
});

/* ── domain ──────────────────────────────────────────────────────────── */

test('domain dinormalkan — dua cara menulis tak boleh jadi dua koneksi', () => {
  assert.equal(normalDomain('  PERUSAHAAN.co.id '), 'perusahaan.co.id');
  assert.equal(normalDomain('@perusahaan.co.id'), 'perusahaan.co.id');
  for (const buruk of ['', 'perusahaan', '.co.id', 'a..b', 'a b.co', '-x.co', 'x-.co']) {
    assert.throws(() => normalDomain(buruk), KonfigurasiSsoDitolak, `lolos: ${JSON.stringify(buruk)}`);
  }
});

test('domain email diambil dari @ TERAKHIR', () => {
  /* Alamat yang sah boleh memuat @ di bagian lokal bila dikutip; mengambil
     yang pertama akan memilih domain yang salah. */
  assert.equal(domainEmail('budi@perusahaan.co.id'), 'perusahaan.co.id');
  assert.equal(domainEmail('"a@b"@perusahaan.co.id'), 'perusahaan.co.id');
  assert.equal(domainEmail('BUDI@PERUSAHAAN.CO.ID'), 'perusahaan.co.id');
  for (const bukan of ['budi', '@perusahaan.co.id', 'budi@', 'budi@x', '']) {
    assert.equal(domainEmail(bukan), null, `lolos: ${JSON.stringify(bukan)}`);
  }
});

/* ── inti: jangan sampai mendarat di tenant orang lain ───────────────── */

test('domain diperiksa ULANG sesudah IdP menjawab', () => {
  /* IdP menjamin orangnya memegang akun di direktori mereka; ia TIDAK
     menjamin alamat yang dipulangkan ada di domain kita. IdP yang salah
     konfigurasi — atau sengaja dibuat begitu — bisa memulangkan alamat di
     domain lain, dan orang itu akan mendarat di tenant yang bukan miliknya. */
  assert.equal(emailCocokKoneksi('budi@perusahaan.co.id', 'perusahaan.co.id'), true);
  assert.equal(emailCocokKoneksi('budi@lain.co.id', 'perusahaan.co.id'), false);
  assert.equal(emailCocokKoneksi('budi@sub.perusahaan.co.id', 'perusahaan.co.id'), false);
  assert.equal(emailCocokKoneksi('bukan-email', 'perusahaan.co.id'), false);

  assert.ok(/emailCocokKoneksi\(email, sso\.ssoDomain\)/.test(OPT),
    'callback signIn tak memeriksa ulang domain — IdP bisa memulangkan alamat mana pun');
  const iCek = OPT.indexOf('emailCocokKoneksi(email, sso.ssoDomain)');
  const iBuat = OPT.indexOf('findOrCreateFromSso');
  assert.ok(iCek > 0 && iCek < iBuat, 'pengguna dibuat SEBELUM domainnya diperiksa');
});

test('pengguna SSO mendarat di tenant PEMILIK KONEKSI', () => {
  /* Kalau jatuh ke findOrCreateFromOAuth, tiap karyawan pelanggan lahir
     dengan tenant BARU sendiri — pelanggannya melihat lima puluh workspace
     kosong alih-alih satu workspace berisi lima puluh orang, dan tak ada
     jalan mudah menggabungkannya kembali. */
  assert.ok(/findOrCreateFromSso/.test(SVC), 'jalur SSO tak punya provisioning sendiri');
  const blok = SVC.slice(SVC.indexOf('async findOrCreateFromSso'), SVC.indexOf('async findOrCreateFromOAuth'));
  assert.ok(/tenantId: profile\.tenantId/.test(blok), 'tenant tidak diambil dari koneksi');
  assert.ok(!/insert\(tenants\)/.test(blok), 'jalur SSO membuat tenant baru — pelanggan pecah jadi banyak workspace');
  assert.ok(/role: 'member'/.test(blok),
    'pengguna SSO jadi admin — yang pertama masuk lewat direktori perusahaan bukan berarti pemilik');
});

test('gerbang pending TETAP berlaku di jalur SSO', () => {
  /* Keputusan pemilik produk. Keempat penyedia yang didukung melayani
     direktori raksasa; "langsung aktif" berarti siapa pun yang punya akun di
     direktori pelanggan bisa masuk tanpa satu pun mata manusia melihatnya. */
  const blok = OPT.slice(OPT.indexOf("if (account.provider === 'sso'"), OPT.indexOf('const u = await authService.findOrCreateFromOAuth'));
  assert.ok(/error=pending/.test(blok), 'pengguna SSO tak melewati gerbang persetujuan');
  assert.ok(/error=rejected/.test(blok), 'pengguna yang sudah ditolak bisa masuk lewat SSO');
  /* findOrCreateFromSso TIDAK boleh menyetel status di INSERT-nya — bawaan
     kolom 'pending' itulah gerbangnya, dan menuliskannya ulang membuka jalan
     untuk suatu hari menuliskannya 'active'. Yang diperiksa hanya nilai yang
     DITULIS; `status:` di objek balikan cuma pembacaan. */
  const svcBlok = SVC.slice(SVC.indexOf('async findOrCreateFromSso'), SVC.indexOf('async findOrCreateFromOAuth'));
  const insert = svcBlok.slice(svcBlok.indexOf('insert(users).values('), svcBlok.indexOf('.returning()'));
  assert.ok(insert.length > 20, 'blok insert tak ditemukan — uji ini tak lagi memeriksa apa pun');
  assert.ok(!/status:/.test(insert), 'status ditulis manual di insert — gerbangnya bisa berubah tanpa disadari');
});

/* ── rahasia & kebocoran ─────────────────────────────────────────────── */

test('client secret dienkripsi, dan tak pernah keluar ke dasbor', () => {
  /* Siapa pun yang membacanya bisa menukar kode otorisasi atas nama
     pelanggan. Bahkan ciphertext-nya tak perlu ada di peramban. */
  assert.ok(/encryptSecret\(input\.clientSecret\)/.test(SSOSVC), 'secret disimpan polos');
  const tampak = SSOSVC.slice(SSOSVC.indexOf('function tampak'), SSOSVC.indexOf('export const ssoService'));
  assert.ok(!/clientSecret/.test(tampak), 'bentuk yang dilihat dasbor memuat client secret');
  const route = readFileSync('src/app/api/sso/route.ts', 'utf8');
  assert.ok(!/clientSecret:/.test(route.slice(route.indexOf('export async function GET'), route.indexOf('const Body'))),
    'GET /api/sso mengirim client secret');
});

test('pencarian domain memakai GUC dan HANYA bisa membaca', () => {
  /* Orang yang mencoba masuk belum punya tenant, jadi pencarian ini berjalan
     di luar konteks tenant. Escape hatch-nya harus sesempit mungkin: satu
     tempat yang menyetelnya, kebijakan SELECT saja, dan hanya baris yang
     enabled — koneksi yang dimatikan tak boleh bisa dipakai masuk. */
  assert.ok(/set_config\('app\.sso_context', 'domain_lookup', true\)/.test(SSOSVC));
  const m = readFileSync('migrations/0043_sso_connections.sql', 'utf8');
  assert.ok(/create policy sso_connections_login_lookup[\s\S]{0,80}for select/.test(m),
    'kebijakan login bukan SELECT saja — konteks tanpa tenant bisa menulis');
  assert.ok(/and deleted_at is null and enabled/.test(m),
    'koneksi yang dimatikan masih bisa dipakai masuk');
  assert.ok(/force row level security/.test(m));
});

test('domain unik SECARA GLOBAL, ditegakkan indeks bukan kode', () => {
  /* Pemeriksaan di aplikasi berjalan di bawah RLS dan karena itu tak pernah
     bisa melihat baris tenant lain — ia akan SELALU mengatakan "domain ini
     bebas". Dua tenant yang mengaku memiliki domain sama berarti karyawan
     satu perusahaan dikirim ke IdP perusahaan lain. */
  const m = readFileSync('migrations/0043_sso_connections.sql', 'utf8');
  assert.ok(/create unique index if not exists uq_sso_connections_domain\s*\n\s*on sso_connections \(lower\(domain\)\)/.test(m),
    'indeks unik domain tak global / tak case-insensitive');
  assert.ok(!/uq_sso_connections_domain[\s\S]{0,80}tenant_id/.test(m), 'unik per tenant, bukan global');
  assert.ok(/uq_sso_connections_domain/.test(SSOSVC),
    'galat indeks tak diterjemahkan — pelanggan cuma melihat galat basis data mentah');
});

/* ── perutean login ──────────────────────────────────────────────────── */

test('koneksi dititipkan lewat KUKI, bukan URL', () => {
  /* Panggilan balik OAuth kembali ke /api/auth/callback/sso tanpa parameter
     kueri kita; tanpa kuki, langkah tukar-kode tak tahu kredensial siapa yang
     harus dipakai. */
  const lookup = readFileSync('src/app/api/auth/sso/lookup/route.ts', 'utf8');
  assert.ok(/res\.cookies\.set\(NAMA_KUKI_SSO/.test(lookup));
  assert.ok(/httpOnly: true/.test(lookup), 'kuki bisa dibaca skrip halaman');
  assert.ok(/sameSite: 'lax'/.test(lookup),
    "sameSite 'strict' justru menahan kuki pada perjalanan kembali dari IdP");
  /* Nama kukinya dipakai DUA tempat — yang menulis dan yang membaca — jadi ia
     harus datang dari satu konstanta. Nama yang ditulis literal di dua berkas
     akan berbeda suatu hari, dan gagalnya berupa SSO yang "kadang tak jalan"
     tanpa satu pun galat. Konstantanya sendiri tinggal di modul, bukan di
     route: Next.js melarang route mengekspor apa pun selain handler HTTP, dan
     `tsc --noEmit` TIDAK menangkapnya — hanya `next build` yang menolak. */
  const handler = readFileSync('src/app/api/auth/[...nextauth]/route.ts', 'utf8');
  assert.ok(/NAMA_KUKI_SSO/.test(handler), 'handler NextAuth tak membaca kuki koneksi');
  assert.ok(/from '@\/modules\/auth\/sso'/.test(handler) && /from '@\/modules\/auth\/sso'/.test(lookup),
    'nama kuki tidak datang dari satu konstanta bersama');
  assert.ok(!/'nalar_sso'/.test(handler), 'nama kuki ditulis literal di handler');
  assert.equal(NAMA_KUKI_SSO, 'nalar_sso');
});

test('jawaban lookup tak membocorkan struktur pelanggan', () => {
  /* Nama tenant, jenis IdP, dan issuer semuanya struktur internal pelanggan,
     dan tak satu pun dibutuhkan peramban untuk melanjutkan. */
  const lookup = readFileSync('src/app/api/auth/sso/lookup/route.ts', 'utf8');
  const balasan = lookup.match(/NextResponse\.json\(\{[^}]*\}/g) ?? [];
  for (const b of balasan) {
    assert.ok(!/tenant|issuer|kind|clientId/i.test(b), `balasan membocorkan: ${b}`);
  }
  assert.ok(/rateLimitBersama\(`sso-lookup/.test(lookup),
    'endpoint pemetaan pelanggan tanpa batas laju');
});

/* ── preset ──────────────────────────────────────────────────────────── */

test('empat penyedia yang diputuskan — SAML tidak termasuk', () => {
  assert.deepEqual(PRESET_SSO.map((p) => p.jenis), ['entra', 'google', 'okta', 'oidc']);
  for (const p of PRESET_SSO) {
    assert.ok(p.labelIssuer.length > 3, `${p.jenis}: label isian kosong`);
    assert.ok(p.petunjuk.length > 40, `${p.jenis}: petunjuk terlalu pendek untuk menolong siapa pun`);
  }
});
