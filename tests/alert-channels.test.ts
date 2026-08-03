process.env.DATABASE_URL ??= 'postgres://u:p@localhost:5432/x';
process.env.CREDENTIALS_ENCRYPTION_KEY ??= '0'.repeat(64);

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * SALURAN PERINGATAN LANGSUNG — dan bentuk kegagalan yang tak bergejala.
 *
 * Seluruh berkas ini menjaga satu kelas kesalahan: PEMANTAUAN YANG MATI SUNYI.
 * Peringatan yang tak terkirim tak menimbulkan galat, tak muncul di layar
 * siapa pun, dan tak membuat satu pun tes lain gagal. Ia hanya membuat orang
 * mengira sistemnya sehat — sampai ada yang bertanya kenapa dokumen berhenti
 * masuk tiga minggu lalu.
 */

const SVC = readFileSync('src/modules/integrations/alert-channels.service.ts', 'utf8');
const WIRE = readFileSync('src/app/api/_wire.ts', 'utf8');
const V1 = readFileSync('src/app/api/v1/_guard.ts', 'utf8');
const MAILER = readFileSync('src/modules/mail/mailer.service.ts', 'utf8');
const UI = readFileSync('src/app/(app)/settings/Peringatan.tsx', 'utf8');
const MIGRASI = readFileSync('migrations/0049_saluran_peringatan.sql', 'utf8');

/* ── keputusan murni ──────────────────────────────────────────────────── */

test('ambang tingkat: bawaan gawat menyaring perhatian, bukan sebaliknya', async () => {
  const { layakKirim } = await import('../src/modules/integrations/alert-channels.service');
  assert.equal(layakKirim('gawat', 'gawat'), true);
  assert.equal(layakKirim('perhatian', 'gawat'), false, 'perhatian lolos ambang gawat');
  assert.equal(layakKirim('perhatian', 'perhatian'), true);
  assert.equal(layakKirim('gawat', 'perhatian'), true, 'gawat tertahan ambang yang lebih rendah');
});

test('tingkat yang TAK DIKENAL tetap dikirim, bukan dibuang diam-diam', async () => {
  /* Kalau suatu hari ada tingkat baru yang lupa didaftarkan, akibat yang benar
     adalah peringatan yang terlalu berisik — bukan peringatan yang tak pernah
     sampai. Yang pertama akan dikeluhkan orang dan diperbaiki; yang kedua tak
     akan pernah dikeluhkan siapa pun. */
  const { layakKirim } = await import('../src/modules/integrations/alert-channels.service');
  assert.equal(layakKirim('bencana', 'gawat'), true);
  assert.equal(layakKirim('gawat', 'entah'), true);
});

test('pesan Slack mengisi `text`, bukan hanya blocks', async () => {
  /* `text` adalah yang dipakai Slack untuk pemberitahuan ponsel dan daftar
     kanal. Mengosongkannya (gampang: blocks terlihat "lebih modern") membuat
     peringatan tiba sebagai baris KOSONG di layar kunci — terkirim, terbaca
     sebagai tak ada apa-apa. */
  const { pesanSlack } = await import('../src/modules/integrations/alert-channels.service');
  const m = pesanSlack({ jenis: 'sync.gagal', tingkat: 'gawat', pesan: 'Sync sumber gagal.', konteks: { sourceId: 'abc' } });
  assert.ok(m.text.includes('sync.gagal'), 'notifikasi ponsel tak menyebut jenisnya');
  assert.ok(m.text.includes('Sync sumber gagal.'));
  assert.ok(m.blocks.length >= 1);
});

test('konteks bersarang tak diseret mentah ke Slack', async () => {
  /* Konteks peringatan bebas bentuk. Objek/array yang ditempel apa adanya
     jadi "[object Object]" — baris yang menyita perhatian tanpa memberi tahu
     apa pun. */
  const { pesanSlack } = await import('../src/modules/integrations/alert-channels.service');
  const m = pesanSlack({
    jenis: 'x', tingkat: 'gawat', pesan: 'p',
    konteks: { sourceId: 'abc', lastSync: { ingested: 3 }, daftar: [1, 2] },
  });
  assert.ok(!JSON.stringify(m).includes('[object Object]'));
});

/* ── pemasangan langganan ─────────────────────────────────────────────── */

test('saluran langsung DIPASANG bersama webhook, bukan di tempatnya sendiri', () => {
  /* Dua titik pemasangan berarti satu di antaranya akan lupa dipanggil oleh
     rute berikutnya — dan gagalnya senyap. */
  assert.ok(/wireAlertChannels\(\)/.test(WIRE), '_wire.ts tak memasang saluran peringatan');
  assert.ok(/wireWebhooks\(\)/.test(WIRE));
});

test('jalur /api/v1 memanggil ensureIntegrations, bukan wireWebhooks saja', () => {
  /* Sebelum kartu ini, v1 hanya memasang webhook. Peringatan yang dipicu oleh
     permintaan API — mis. ingest lewat kunci API yang menabrak kuota — tak
     akan pernah terkirim ke email/Slack, dan tak ada satu pun galat. */
  assert.ok(/ensureIntegrations\(\)/.test(V1), 'v1 tak memasang seluruh integrasi');
  /* Diikat ke IMPOR-nya, bukan ke penyebutan namanya: berkas itu menyebut
     `wireWebhooks()` justru di komentar yang menjelaskan kenapa ia TIDAK
     dipakai lagi, dan pemeriksaan yang melarang katanya akan menghukum
     kalimat yang memperbaiki kesalahannya. Fungsi yang tak diimpor tak bisa
     dipanggil — itu yang sebenarnya dijaga. */
  assert.ok(!/import \{[^}]*wireWebhooks/.test(V1), 'v1 masih memasang webhook sendirian');
});

test('mendengarkan `alert.raised` — kejadian yang sama dengan webhook', () => {
  assert.ok(/on\('alert\.raised'/.test(SVC), 'tak berlangganan kejadian peringatan');
  const wh = readFileSync('src/modules/integrations/webhook.service.ts', 'utf8');
  assert.ok(/'alert\.raised'/.test(wh), 'webhook berhenti mendengarkan peringatan');
});

test('kegagalan saluran TIDAK menggagalkan alur yang memicunya', () => {
  /* Sync yang gagal lalu ikut meledak karena peringatannya gagal terkirim
     adalah kerusakan kedua yang menutupi kerusakan pertama. */
  const blok = SVC.slice(SVC.indexOf('export function wireAlertChannels'));
  assert.ok(/try \{[^}]*kirim/.test(blok.replace(/\n/g, '')), 'pendengar tak menangkap galatnya');
  // Dan tiap saluran ditangkap SENDIRI — Slack yang mati tak boleh membatalkan email.
  const kirim = SVC.slice(SVC.indexOf('async kirim('), SVC.indexOf('async uji('));
  assert.equal((kirim.match(/catch \(e\)/g) ?? []).length, 2,
    'satu saluran yang gagal ikut membatalkan saluran lain');
});

test('hasil kirim membedakan "tak ada saluran" dari "gagal"', () => {
  /* Boolean yang menyatukan sukses-diam dengan gagal-diam sudah pernah
     membuat sistem peringatan mati tanpa ada yang tahu — lihat catatan
     HasilPeringatan di core/alerts.ts. Jangan diulang di lapisan ini. */
  assert.ok(/\{ email: boolean; slack: boolean; dilewati: boolean \}/.test(SVC),
    'kirim() mengembalikan boolean tunggal');
  assert.ok(/Tak ada saluran yang menerima/.test(UI),
    'UI melaporkan uji berhasil walau tak ada yang menerimanya');
});

/* ── keamanan ─────────────────────────────────────────────────────────── */

test('URL Slack DIENKRIPSI, dan tak pernah dikirim balik ke peramban', () => {
  /* Ia kredensial penuh: yang memegangnya bisa menulis ke kanal itu selamanya.
     Satu dump basis data tak boleh setara dengan akses tulis ke Slack
     pelanggan. */
  assert.ok(/encryptSecret\(bersih\)/.test(SVC), 'URL Slack disimpan terang');
  assert.ok(/encrypted_slack_url/.test(MIGRASI), 'kolomnya tak menyebut dirinya terenkripsi');
  // Yang keluar ke UI hanya boolean.
  assert.ok(/slackTerpasang: Boolean\(r\?\.slack\)/.test(SVC), 'keterpasangan Slack bukan boolean');
  assert.ok(!/slackUrl:\s*r\?\.slack/.test(SVC), 'URL Slack ikut keluar ke peramban');
  assert.ok(!/saluran\.slackUrl/.test(UI), 'UI membaca URL Slack yang seharusnya tak pernah dikirim');
});

test('URL Slack lewat penjagaan SSRF yang sama dengan webhook keluar', () => {
  /* Ia dipasok pengguna dan diketuk server kita. Tanpa penjagaan, ia alat
     untuk mengetuk 169.254.169.254 atau layanan di jaringan privat. */
  assert.ok(/assertPublicHttpUrl\(u, \{ allowLoopback: true/.test(SVC),
    'URL Slack tak diperiksa sebagai URL pihak ketiga');
});

test('teks dari LUAR diloloskan sebelum masuk HTML email', () => {
  /* Pesan peringatan memuat nama berkas dari Drive dan pesan galat dari server
     upstream — teks yang tak kita tulis. Seluruh email lain hanya menempelkan
     kalimat tetap, jadi kebutuhan ini baru muncul di sini, dan justru itu yang
     membuatnya mudah terlewat. */
  assert.ok(/function esc\(s: string\)/.test(MAILER), 'tak ada peloloskan HTML sama sekali');
  const alert = MAILER.slice(MAILER.indexOf('sendAlert('), MAILER.indexOf('sendPasswordReset('));
  assert.ok(/esc\(p\.pesan\)/.test(alert), 'pesan peringatan masuk HTML tanpa diloloskan');
  assert.ok(/esc\(String\(v\)\)/.test(alert), 'nilai konteks masuk HTML tanpa diloloskan');
  assert.ok(/esc\(p\.jenis\)/.test(alert), 'jenis peringatan masuk HTML tanpa diloloskan');
});

/* ── makna "kosong" ───────────────────────────────────────────────────── */

test('URL kosong BERBEDA dari URL tak disentuh', () => {
  /* Menyatukannya berarti tiap penyimpanan form tanpa mengetik ulang URL
     diam-diam mencabut Slack — dan orang baru tahu berminggu-minggu kemudian,
     saat peringatan yang seharusnya berbunyi ternyata tak sampai. */
  assert.ok(/if \(input\.slackUrl !== undefined\)/.test(SVC),
    'undefined dan string kosong diperlakukan sama');
  assert.ok(/\.\.\.\(slack\.trim\(\) \? \{ slackUrl: slack\.trim\(\) \} : \{\}\)/.test(UI),
    'UI mengirim string kosong saat kolomnya tak diisi — itu mencabut Slack');
});

test('bawaan ambangnya GAWAT, dijaga basis data juga', () => {
  assert.ok(/default 'gawat'/.test(MIGRASI), 'bawaan ambang bukan yang paling sunyi');
  assert.ok(/check \(alert_min_level in \('perhatian', 'gawat'\)\)/.test(MIGRASI),
    'nilai di luar dua tingkat bisa masuk — dan pembandingnya diam-diam tak pernah cocok');
});

test('uji saluran dikirim sebagai GAWAT supaya tak tersaring ambangnya sendiri', () => {
  /* Uji yang tak sampai karena ambangnya menyaringnya akan terbaca sebagai
     saluran rusak, dan orang akan mencabut konfigurasi yang sebenarnya benar. */
  const uji = SVC.slice(SVC.indexOf('async uji('));
  assert.ok(/tingkat: 'gawat'/.test(uji), 'uji saluran bisa tersaring ambangnya sendiri');
});

test('migrasinya idempotent — aturan proyek, bukan selera', () => {
  assert.ok(/add column if not exists/.test(MIGRASI));
  assert.ok(/if not exists \(\s*select 1 from pg_constraint/.test(MIGRASI),
    'constraint ditambahkan tanpa penjagaan — jalan kedua akan gagal');
});

test('kolom migrasi & schema.ts sepakat', () => {
  /* Kolom yang ada di migrasi tapi tak dideklarasikan schema.ts adalah persis
     yang dihapus diam-diam oleh `db:push` — tiga kali sudah terjadi di proyek
     ini. */
  const schema = readFileSync('src/modules/core/db/schema.ts', 'utf8');
  for (const kolom of ['alert_email', 'encrypted_slack_url', 'alert_min_level']) {
    assert.ok(MIGRASI.includes(kolom), `migrasi tak memuat ${kolom}`);
    assert.ok(schema.includes(`'${kolom}'`), `schema.ts tak mendeklarasikan ${kolom} — db:push akan membuangnya`);
  }
});
