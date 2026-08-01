import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

process.env.DATABASE_URL ??= 'postgres://x:y@localhost:5432/z';
process.env.CREDENTIALS_ENCRYPTION_KEY ??= '0'.repeat(64);

import {
  JEDA_PANGKAS_MS, LANTAI_TOKEN, UMUR_MATI_DETIK, detikTunggu, pakaiEmberBersama,
} from '../src/modules/core/limits-bersama';

/**
 * EMBER TOKEN BERSAMA.
 *
 * Yang dijaga di sini bukan "batasnya bekerja" — itu jalur bahagia. Yang
 * dijaga tiga bentuk kegagalan yang semuanya SENYAP:
 *   • penghitung yang gagal-tertutup mengubah gangguan basis data jadi
 *     pemadaman produk, dan sebabnya tak kelihatan di log mana pun;
 *   • baca-lalu-tulis dua langkah membuat batas kembali berlipat, persis
 *     yang hendak diperbaiki, tanpa satu pun galat;
 *   • ember memori yang dilewati membuat setiap penolakan tetap menyentuh
 *     basis data — dan penolakan justru yang paling banyak terjadi saat
 *     diserang.
 */

const SRC = readFileSync('src/modules/core/limits-bersama.ts', 'utf8');

/* ── hitungan tunggu ─────────────────────────────────────────────────── */

test('Retry-After tak pernah 0 — nol mengundang klien mencoba seketika', () => {
  /* `Retry-After: 0` membuat klien yang patuh mengulang tanpa jeda, dan itu
     memperbesar beban yang sedang ditahan. */
  assert.equal(detikTunggu(-0.1, 5), 1);
  assert.equal(detikTunggu(0, 5), 1);
});

test('tunggu dihitung dari SISA token dan laju isi ulangnya', () => {
  // kurang 0,4 token pada 0,2/detik = 2 detik
  assert.equal(detikTunggu(-0.4, 0.2), 2);
  // kurang 1 token pada 5/detik = kurang dari sedetik → dibulatkan ke 1
  assert.equal(detikTunggu(-1, 5), 1);
  assert.equal(detikTunggu(-10, 1), 10);
});

test('laju nol tidak menghasilkan Infinity atau NaN', () => {
  /* Nilai itu akan mendarat di header Retry-After dan membuat sebagian klien
     HTTP gagal mengurai balasan — penolakan berubah jadi kerusakan. */
  assert.equal(detikTunggu(-1, 0), 60);
  assert.ok(Number.isFinite(detikTunggu(-1, 0)));
});

/* ── kapan ember bersama dipakai ─────────────────────────────────────── */

test('on-premise TIDAK memakai ember bersama', () => {
  /* Pemasangan on-prem berjalan sebagai SATU proses; embernya sudah benar
     seluruhnya, dan perjalanan tambahan ke basis data cuma beban. */
  assert.equal(pakaiEmberBersama({ DEPLOYMENT_MODE: 'onprem' }), false);
  assert.equal(pakaiEmberBersama({}), true);
});

test('env bisa memaksa dua arah — termasuk MENYALAKAN di on-prem', () => {
  /* On-prem berskala besar bisa saja menjalankan beberapa proses di belakang
     penyeimbang beban; tanpa saklar 'on', satu-satunya jalan adalah menambal
     kode. */
  assert.equal(pakaiEmberBersama({ RATE_LIMIT_BERSAMA: 'off' }), false);
  assert.equal(pakaiEmberBersama(
    { RATE_LIMIT_BERSAMA: 'on', DEPLOYMENT_MODE: 'onprem' }), true);
});

/* ── bentuk SQL-nya ──────────────────────────────────────────────────── */

test('SATU pernyataan atomik — bukan baca lalu tulis', () => {
  /* Dua langkah membuat dua lambda yang datang bersamaan membaca sisa yang
     sama dan sama-sama merasa berhak: batasnya kembali berlipat, yaitu
     persis cacat yang kartu ini ada untuk memperbaiki. */
  assert.ok(/insert into rate_buckets[\s\S]{0,400}on conflict \(key\) do update set/.test(SRC),
    'bukan upsert satu pernyataan');
  assert.ok(/returning tokens/.test(SRC), 'sisa token tak dikembalikan — hasilnya tak bisa dinilai');
  const iAmbil = SRC.indexOf('export async function ambilTokenBersama');
  const blok = SRC.slice(iAmbil, SRC.indexOf('export async function pangkasEmberMati'));
  assert.ok(!/select .* from rate_buckets/i.test(blok),
    'ada SELECT terpisah sebelum menulis — kondisi balapan kembali terbuka');
});

test('pengisian ulang dihitung DI BASIS DATA, bukan dari jam aplikasi', () => {
  /* Sepuluh lambda punya sepuluh jam yang tak pernah persis sama, dan
     selisih beberapa ratus milidetik sudah cukup membuat ember terisi dua
     kali untuk satu detik yang sama. */
  assert.ok(/extract\(epoch from \(now\(\) - b\.last_at\)\)/.test(SRC),
    'selisih waktu tak diambil dari now() basis data');
  assert.ok(/last_at = now\(\)/.test(SRC));
});

test('token dijepit ATAS dan BAWAH', () => {
  /* Tanpa atap, ember yang lama menganggur mengumpulkan token tak berhingga
     dan burst pertamanya menjadi tak terbatas. Tanpa lantai, penyerang yang
     gigih menumpuk utang ribuan token dan tetap tertolak berjam-jam setelah
     berhenti — hukuman yang tak pernah dijanjikan siapa pun. */
  assert.ok(/least\(/.test(SRC), 'tak ada batas atas');
  assert.ok(/greatest\(/.test(SRC), 'tak ada batas bawah');
  assert.equal(LANTAI_TOKEN, -1);
});

/* ── urutan lapis & kegagalan ────────────────────────────────────────── */

test('ember MEMORI diperiksa lebih dulu, dan penolakannya berhenti di situ', () => {
  /* Penolakan justru yang paling banyak terjadi saat diserang. Kalau setiap
     penolakan tetap menyentuh basis data, serangan yang seharusnya ditahan
     murah berubah jadi beban penuh di Postgres. */
  const blok = SRC.slice(SRC.indexOf('export async function rateLimitBersama'));
  const iLokal = blok.indexOf('rateLimit(key');
  const iBersama = blok.indexOf('ambilTokenBersama');
  assert.ok(iLokal > 0 && iLokal < iBersama, 'ember bersama dipanggil sebelum ember memori');
  assert.ok(/if \(!lokal\.ok\) return lokal;/.test(blok),
    'penolakan memori tetap lanjut ke basis data');
});

test('GAGAL-TERBUKA saat basis data terganggu', () => {
  /* Penghitung laju yang gagal-tertutup mengubah gangguan basis data jadi
     pemadaman total: chatbot berhenti menjawab bukan karena disalahgunakan,
     melainkan karena penjaganya sendiri sedang sakit. */
  const blok = SRC.slice(SRC.indexOf('export async function rateLimitBersama'));
  assert.ok(/catch \{[\s\S]*?return lokal;/.test(blok),
    'galat basis data tidak diloloskan — satu gangguan mematikan seluruh chat');
  assert.ok(!/catch \{[\s\S]{0,200}ok: false/.test(blok), 'gagal-tertutup');
});

test('pemangkasan menelan galatnya sendiri dan berjeda', () => {
  const blok = SRC.slice(SRC.indexOf('export async function pangkasEmberMati'),
    SRC.indexOf('export async function rateLimitBersama'));
  assert.ok(/catch \{/.test(blok), 'kebersihan bisa menggagalkan permintaan pengguna');
  assert.ok(/delete from rate_buckets/.test(blok), 'pemangkasan bukan penghapusan fisik');
  assert.ok(!/deleted_at/.test(blok), 'memakai soft delete — tabel akan tumbuh tanpa batas');
  assert.ok(JEDA_PANGKAS_MS >= 60_000, 'pemangkasan terlalu sering — menumpang tiap permintaan');
  assert.ok(UMUR_MATI_DETIK >= 600, 'ambang mati terlalu pendek, ember hidup ikut terbuang');
});

/* ── pemasangannya di rute ───────────────────────────────────────────── */

function ruteApi(dir = 'src/app/api'): string[] {
  const out: string[] = [];
  for (const f of readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${f.name}`;
    if (f.isDirectory()) out.push(...ruteApi(p));
    else if (f.name === 'route.ts') out.push(p);
  }
  return out;
}

test('TIDAK ADA rute yang masih memakai penghitung memori saja', () => {
  /* Satu rute yang terlewat berarti satu pintu yang batasnya masih berlipat
     — dan yang paling mungkin terlewat justru endpoint auth, yang paling
     berbahaya. */
  const tertinggal = ruteApi().filter((p) => {
    const s = readFileSync(p, 'utf8');
    return /(?<!Bersama)\brateLimit\(/.test(s);
  });
  assert.deepEqual(tertinggal, [], `rute masih memakai rateLimit() sinkron: ${tertinggal.join(', ')}`);
});

test('endpoint AUTH ikut terlindungi — bukan hanya chat', () => {
  /* Ini justru sebab utama kartu ini dikerjakan: perlindungan tebak-sandi
     yang N kali lebih longgar dari yang tertulis adalah lubang keamanan,
     bukan sekadar kuota yang meleset. */
  for (const p of [
    'src/app/api/auth/signup/route.ts',
    'src/app/api/auth/forgot/route.ts',
    'src/app/api/auth/reset/route.ts',
    'src/app/api/auth/login-status/route.ts',
    'src/app/api/auth/verify-email/route.ts',
  ]) {
    assert.ok(/await rateLimitBersama\(/.test(readFileSync(p, 'utf8')), `${p} belum memakai ember bersama`);
  }
});

/* ── migrasi & skema ─────────────────────────────────────────────────── */

test('migrasi menyatakan pengecualian soft delete dengan TERANG', () => {
  /* Pengecualian aturan keras yang tak dijelaskan akan dibaca pembaca
     berikutnya sebagai kelalaian, lalu "diperbaiki" — dan tabel ini kembali
     tumbuh tanpa batas. */
  const m = readFileSync('migrations/0041_rate_buckets.sql', 'utf8');
  assert.ok(/create table if not exists rate_buckets/.test(m));
  assert.ok(!/deleted_at/.test(m.split('┌')[0]), 'kolom deleted_at ikut dibuat');
  assert.ok(/PENGECUALIAN ATURAN KERAS/.test(m), 'pengecualian tak dijelaskan');
  assert.ok(/disetujui pemilik produk/i.test(m), 'pengecualian tak menyebut siapa yang menyetujui');
  assert.ok(!/references/i.test(m), 'ada FOREIGN KEY — melanggar Rule #2');
  assert.ok(/grant select, insert, update, delete on rate_buckets to nalar_app/.test(m),
    'peran aplikasi tak diberi hak — tabelnya tak terbaca sama sekali');
});

test('tabel dideklarasi di schema.ts dengan nama indeks yang SAMA', () => {
  /* Indeks yang hanya ada di migrasi pernah DIHAPUS diam-diam oleh db:push
     (produksi, 27 Jul 2026). */
  const s = readFileSync('src/modules/core/db/schema.ts', 'utf8');
  assert.ok(/pgTable\('rate_buckets'/.test(s), 'tabel tak dideklarasi — db:push akan menghapusnya');
  assert.ok(s.includes("index('idx_rate_buckets_last_at')"), 'nama indeks tak cocok dengan migrasi');
  const i = s.indexOf("pgTable('rate_buckets'");
  const blok = s.slice(i, i + 900);
  assert.ok(!/tenant_id/.test(blok), 'punya tenant_id tapi tanpa RLS — isolasi bohong');
  assert.ok(!/\.\.\.stamps/.test(blok), 'memakai stamps — deleted_at ikut masuk');
});
