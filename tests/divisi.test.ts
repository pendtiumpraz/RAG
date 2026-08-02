import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { irisBlok } from './_iris';

import {
  bolehLihat, lintasDivisi, PERAN_LINTAS_DIVISI, PESAN_DILUAR_DIVISI,
  type AktorDivisi,
} from '../src/modules/chatbot/divisi';

/**
 * RBAC PER-DIVISI — aturan aksesnya, bukan penyimpanannya.
 *
 * Aturan izin punya satu bentuk kegagalan yang jauh lebih mahal daripada
 * semua yang lain: ia LOLOS terlalu banyak, diam-diam, dan tak ada satu pun
 * galat yang muncul. Yang dijaga di sini karena itu bukan "orang yang berhak
 * bisa masuk" — itu jalur bahagia, dan kerusakannya langsung terlihat —
 * melainkan "orang yang tak berhak TIDAK bisa", termasuk lewat pintu-pintu
 * yang tak melewati daftar.
 */

const member = (divisionId: string | null): AktorDivisi => ({ role: 'member', divisionId });

/* ── arti NULL, yang menentukan segalanya ────────────────────────────── */

test('chatbot tanpa divisi terlihat oleh SIAPA PUN', () => {
  /* Migrasi 0040 meninggalkan SELURUH chatbot yang sudah ada bernilai NULL.
     Arti lain apa pun akan mencabut akses seluruh tenant pada saat migrasi
     berjalan — tanpa galat, tanpa jejak, dan tanpa siapa pun tahu sebabnya. */
  assert.equal(bolehLihat(member('div-a'), null), true);
  assert.equal(bolehLihat(member(null), null), true);
});

test('aktor tanpa divisi TIDAK melihat chatbot berdivisi', () => {
  /* "Belum ditempatkan" berarti melihat yang tak dibatasi saja. Menyamakannya
     dengan admin akan membuat setiap akun baru — dan setiap akun yang lupa
     ditempatkan — punya akses penuh sejak menit pertama. */
  assert.equal(bolehLihat(member(null), 'div-a'), false);
});

test('dua NULL TIDAK dianggap cocok lewat perbandingan biasa', () => {
  /* Ini bentuk kegagalan yang paling mudah ditulis tanpa sengaja:
       return aktor.divisionId === divisiChatbot
     Hasilnya kebetulan benar hari ini, tapi benar karena alasan yang salah,
     dan berhenti benar begitu ada divisi bawaan. Uji ini mengunci bahwa
     cabang NULL diputus lebih dulu, bukan disamakan. */
  const kode = readFileSync('src/modules/chatbot/divisi.ts', 'utf8');
  const badan = kode.slice(kode.indexOf('export function bolehLihat'));
  assert.ok(/if \(divisiChatbot === null\) return true;/.test(badan),
    'cabang "chatbot tak dibatasi" hilang');
  assert.ok(/if \(aktor\.divisionId === null\) return false;/.test(badan),
    'cabang "aktor belum ditempatkan" hilang — dua NULL akan saling cocok');
});

/* ── siapa menembus batas ─────────────────────────────────────────────── */

test('admin & superadmin melihat SELURUH divisi', () => {
  for (const role of ['admin', 'superadmin']) {
    assert.equal(bolehLihat({ role, divisionId: null }, 'div-a'), true, `${role} terhalang divisi`);
    assert.equal(lintasDivisi({ role, divisionId: 'div-b' }), true);
  }
});

test('member TIDAK menembus batas, dan peran karangan juga tidak', () => {
  assert.equal(bolehLihat(member('div-a'), 'div-b'), false);
  assert.equal(bolehLihat(member('div-a'), 'div-a'), true);
  /* Peran yang tak dikenal harus JATUH KE TERBATAS, bukan ke bebas. Kalau
     daftar peran bertambah suatu hari dan berkas ini terlupa, kegagalannya
     harus berupa "tak bisa melihat" — bukan "melihat semuanya". */
  assert.equal(bolehLihat({ role: 'owner', divisionId: null }, 'div-a'), false);
  assert.equal(bolehLihat({ role: '', divisionId: null }, 'div-a'), false);
  assert.deepEqual([...PERAN_LINTAS_DIVISI].sort(), ['admin', 'superadmin']);
});

/* ── penegakannya, bukan cuma aturannya ──────────────────────────────── */

const REPO = readFileSync('src/modules/chatbot/chatbot.repository.ts', 'utf8');
const SVC = readFileSync('src/modules/chatbot/chatbot.service.ts', 'utf8');

test('penyaringan ada di WHERE, bukan di memori', () => {
  /* Menyaring setelah query berjalan berarti barisnya sempat keluar dari
     basis data — dan setiap penghitungan atau ekspor yang lupa memakai hasil
     saringannya akan membocorkan yang sama. */
  assert.ok(/\.where\(and\([\s\S]{0,120}klausaDivisi\(aktor\)\)\)/.test(REPO),
    'klausaDivisi tak dipasang di WHERE listActive/listTrashed');
  assert.ok(!/\.filter\([\s\S]{0,60}bolehLihat/.test(REPO),
    'penyaringan dilakukan di memori setelah query');
});

test('SAMPAH ikut disaring', () => {
  /* Sampah yang tak tersaring adalah cara paling sepi membocorkan daftar
     chatbot divisi lain: namanya tetap terbaca, dan orang jarang memikirkan
     Sampah saat memeriksa siapa melihat apa. */
  const blok = REPO.slice(REPO.indexOf('listTrashed'), REPO.indexOf('countActive'));
  assert.ok(/klausaDivisi\(aktor\)/.test(blok), 'listTrashed tak menyaring divisi');
});

test('aktor WAJIB, bukan opsional dengan bawaan "lihat semua"', () => {
  /* Parameter opsional berarti setiap pemanggil baru yang lupa mengisinya
     menembus pembatasan tanpa satu pun galat kompilasi. Yang wajib memaksa
     penulisnya memutuskan — dan itulah kenapa smoke.ts sempat gagal
     dikompilasi saat kartu ini dikerjakan: persis efek yang diinginkan. */
  assert.ok(/listActive\(tx: Db, tenantId: string, aktor: AktorDivisi\)/.test(REPO));
  assert.ok(/listTrashed\(tx: Db, tenantId: string, aktor: AktorDivisi\)/.test(REPO));
  assert.ok(!/aktor\?: AktorDivisi|aktor: AktorDivisi = /.test(REPO),
    'aktor dibuat opsional — pemanggil yang lupa akan menembus pembatasan');
});

test('operasi ber-ID dijaga, bukan hanya daftarnya', () => {
  /* Daftar yang tersaring belum menjaga apa pun: id chatbot muncul di URL,
     di log, dan di potongan embed yang memang dibagikan. Tanpa pemeriksaan
     ini, PATCH/DELETE dengan id tebakan tetap tembus. */
  for (const op of ['update', 'softDelete', 'restore']) {
    const i = SVC.indexOf(`async ${op}(tenantId: string, aktor: AktorDivisi`);
    assert.ok(i > 0, `${op} tak menerima aktor`);
    const blok = irisBlok(SVC, `async ${op}(tenantId: string, aktor: AktorDivisi`);
    assert.ok(/this\.pastikanBoleh\(tx, id, aktor/.test(blok), `${op} tak memanggil pastikanBoleh`);
  }
  // restore bekerja pada baris yang SUDAH terhapus lunak — tanpa withTrashed
  // pemeriksaannya menjawab "tidak ditemukan" dan tak pernah menguji divisi.
  assert.ok(/pastikanBoleh\(tx, id, aktor, \{ withTrashed: true \}\)/.test(
    irisBlok(SVC, 'async restore(tenantId: string, aktor: AktorDivisi')));
});

test('batas paket dihitung SE-TENANT, bukan lewat daftar yang tersaring', () => {
  /* Kalau lewat daftar, tiap divisi mendapat jatah penuh sendiri: tenant
     gratis dengan lima divisi diam-diam punya lima kali batasnya. Cacat ini
     nyaris tertulis — `this.list(tenantId)` yang lama tinggal ditambahi
     aktor dan semuanya tetap terkompilasi. */
  /* Diiris antar-BATAS FUNGSI — lihat tests/_iris.ts untuk kejadian yang
     melahirkan aturan itu. */
  const blok = irisBlok(SVC, 'async create(');
  assert.ok(/repo\.countActive\(tx, tenantId\)/.test(blok),
    'jumlah chatbot dihitung dari daftar yang tersaring divisi');
  assert.ok(!/this\.list\(tenantId/.test(blok));
});

test('member tak bisa melepas chatbotnya sendiri jadi tak dibatasi', () => {
  /* Kalau ia boleh mengirim divisionId, satu permintaan HTTP cukup untuk
     membuka chatbot divisinya ke seluruh tenant — pembatasannya akan
     terlihat berjalan di layar sambil bisa dilewati sepenuhnya. */
  /* Diiris antar-BATAS FUNGSI, bukan dengan jendela sekian ratus karakter:
     jendela tetap ikut bergeser setiap kali ada komentar yang ditambahkan,
     dan uji yang "lulus" karena jendelanya kependekan tak menjaga apa pun. */
  const blokCreate = SVC.slice(SVC.indexOf('async create('), SVC.indexOf('async pastikanBoleh('));
  assert.ok(/lintasDivisi\(aktor\)\s*\?\s*\(input\.divisionId \?\? null\)\s*:\s*aktor\.divisionId/
    .test(blokCreate), 'create menerima divisionId dari siapa pun');
  const blokUpdate = SVC.slice(SVC.indexOf('async update('), SVC.indexOf('async softDelete('));
  assert.ok(/if \('divisionId' in input && !lintasDivisi\(aktor\)\) delete input\.divisionId;/
    .test(blokUpdate), 'update membiarkan member memindahkan chatbot');
});

test('ditolak karena divisi ≠ data tak sah — 403, bukan 422', () => {
  /* Menyamakannya membuat "kamu tak berhak" terbaca sebagai "kirimanmu
     salah", dan orang akan mencoba memperbaiki kiriman yang sudah benar. */
  assert.ok(/export class AksesDitolakError extends Error/.test(SVC));
  const route = readFileSync('src/app/api/chatbots/[id]/route.ts', 'utf8');
  assert.ok(/AksesDitolakError\) return NextResponse\.json\([\s\S]{0,60}status: 403/.test(route));
  // …dan pemeriksaan 403 harus lebih dulu: AksesDitolakError bukan turunan
  // ValidationError, tapi urutan yang terbalik tetap menandakan pembaca
  // berikutnya menganggap keduanya sejenis.
  assert.ok(route.indexOf('AksesDitolakError') < route.indexOf('ValidationError) return'));
  assert.equal(PESAN_DILUAR_DIVISI, 'Chatbot ini milik divisi lain');
  assert.ok(!/divisi \$\{|nama divisi/i.test(PESAN_DILUAR_DIVISI),
    'pesan galat menyebut divisi pemilik — membocorkan struktur organisasi');
});

/* ── jalur publik tak boleh ikut terbatas ────────────────────────────── */

test('pengunjung widget TIDAK melewati saringan divisi', () => {
  /* Pengunjung tak punya divisi menurut definisinya. Kalau jalur publik ikut
     disaring, setiap chatbot berdivisi akan berhenti menjawab di situs
     pelanggan — kerusakan produksi yang sebabnya ada di berkas RBAC. */
  const tc = readFileSync('src/modules/core/db/tenant-context.ts', 'utf8');
  assert.ok(/resolveChatbotByPublicKey/.test(tc));
  assert.ok(!/divisi|divisionId/i.test(tc),
    'jalur resolusi publik menyentuh divisi — widget akan mati untuk chatbot berdivisi');
});

/* ── integritas referensial (konsekuensi No-FK) ──────────────────────── */

test('menghapus divisi MELEPAS anggota & chatbotnya, tidak menggantung', () => {
  /* Tanpa FK, tak ada yang membersihkan penunjuk ke baris terhapus. Chatbot
     yang menunjuk divisi mati akan hilang dari layar semua orang kecuali
     admin — terhapus tanpa pernah dihapus, dan tak ada layar yang
     menjelaskan ke mana perginya. */
  const ds = readFileSync('src/modules/settings/division.service.ts', 'utf8');
  const blok = ds.slice(ds.indexOf('async softDelete'), ds.indexOf('async restore'));
  assert.ok(/update\(users\)\.set\(\{ divisionId: null/.test(blok), 'anggota tak dilepas');
  assert.ok(/update\(chatbots\)\.set\(\{ divisionId: null/.test(blok), 'chatbot tak dilepas');
  assert.ok(/deletedAt: now/.test(blok) && !/delete\(divisions\)/.test(blok),
    'divisi dihapus keras — melanggar Rule #3');
});

test('divisi aktor dibaca dari DB, BUKAN dari token sesi', () => {
  /* Token berumur panjang. Kalau divisinya ikut di dalam token, orang yang
     dipindahkan — atau dikeluarkan dari divisinya karena suatu alasan —
     tetap memegang akses lamanya sampai ia sendiri memutuskan untuk logout.
     Pencabutan izin yang baru berlaku "nanti" bukan pencabutan izin. */
  const ds = readFileSync('src/modules/settings/division.service.ts', 'utf8');
  const blok = ds.slice(ds.indexOf('async aktor('), ds.indexOf('/** Daftar divisi'));
  assert.ok(/withTenant\(user\.tenantId/.test(blok) && /users\.divisionId/.test(blok),
    'aktor() tak membaca divisi dari basis data');
  const nextAuth = readFileSync('src/modules/auth/next-auth.d.ts', 'utf8');
  assert.ok(!/divisionId/.test(nextAuth), 'divisi masuk ke token sesi — pencabutan izin jadi tertunda');
});

/* ── skema & migrasi ─────────────────────────────────────────────────── */

test('migrasi tidak menempatkan siapa pun ke divisi bawaan', () => {
  /* Backfill apa pun di sini akan MENCABUT akses yang orang punya hari ini,
     diam-diam, pada saat migrasi berjalan. */
  const m = readFileSync('migrations/0040_divisions.sql', 'utf8');
  assert.ok(/add column if not exists division_id uuid;/.test(m));
  assert.ok(!/update (users|chatbots) set division_id/i.test(m),
    'migrasi mengisi division_id — akses tercabut saat migrasi berjalan');
  assert.ok(!/references/i.test(m), 'ada FOREIGN KEY — melanggar Rule #2');
  assert.ok(/enable row level security/.test(m) && /force row level security/.test(m));
  assert.ok(/tenant_id = app_current_tenant\(\)/.test(m), 'tabel divisi tanpa isolasi tenant');
  assert.ok(/grant select, insert, update, delete on divisions to nalar_app/.test(m),
    'peran aplikasi tak diberi hak — RLS aktif tapi tabelnya tak terbaca sama sekali');
});

test('indeks di schema.ts bernama SAMA dengan migrasi — jebakan db:push', () => {
  /* Nama yang berbeda membuat db:push membangun indeks kedua yang isinya
     sama sambil membiarkan yang lama, dan indeks parsial yang tak dideklarasi
     pernah DIHAPUS diam-diam olehnya (produksi, 27 Jul 2026). */
  const s = readFileSync('src/modules/core/db/schema.ts', 'utf8');
  const m = readFileSync('migrations/0040_divisions.sql', 'utf8');
  for (const nama of ['idx_divisions_tenant', 'uq_divisions_tenant_name', 'idx_users_division', 'idx_chatbots_division']) {
    assert.ok(s.includes(`'${nama}'`), `indeks ${nama} tak dideklarasi di schema.ts`);
    assert.ok(m.includes(nama), `indeks ${nama} tak ada di migrasi`);
  }
  const iDiv = s.indexOf("pgTable('divisions'");
  assert.ok(/\}\)\)\.enableRLS\(\);/.test(s.slice(iDiv, s.indexOf('pgTable', iDiv + 10))),
    'tabel divisions tanpa .enableRLS() — db:push akan mematikan RLS-nya');
});
