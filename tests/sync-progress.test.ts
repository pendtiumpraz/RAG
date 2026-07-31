import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env.DATABASE_URL ??= 'postgres://x:y@localhost:5432/z';
process.env.CREDENTIALS_ENCRYPTION_KEY ??= '0'.repeat(64);

/**
 * PROGRES SYNC.
 *
 * Kegagalan yang dijaga di sini tak melempar apa pun: sync panjang tampak
 * menggantung, pemilik data menekan Sync lagi karena mengira yang pertama
 * mati, dan sync kedua BENAR-BENAR berjalan — membakar kuota dua kali untuk
 * pekerjaan yang sama.
 */

const SYNC = readFileSync('src/modules/knowledge/sync.service.ts', 'utf8');
const UI = readFileSync('src/app/(app)/knowledge/page.tsx', 'utf8');

test('progres ditulis BERKALA, bukan per berkas', () => {
  /* Satu UPDATE per berkas berarti 150 tulis per jalan di lambda dan 5.000
     di pekerja, semuanya untuk angka yang dibaca manusia beberapa detik
     sekali. */
  assert.ok(/KABAR_TIAP\s*=\s*\d+/.test(SYNC), 'tak ada pembatas jumlah berkas antar kabar');
  assert.ok(/KABAR_MS\s*=\s*[\d_]+/.test(SYNC), 'tak ada pembatas waktu antar kabar');
  const t = Number(/KABAR_TIAP\s*=\s*(\d+)/.exec(SYNC)![1]);
  assert.ok(t >= 2, `kabar tiap ${t} berkas — praktis per berkas`);
});

test('DUA syarat kabar, bukan satu', () => {
  /* Keduanya bisa jadi yang lambat: berkas kecil melaju puluhan per detik
     (hitungan yang menahan), satu PDF 200 halaman memakan setengah menit
     sendirian (waktu yang menahan). Hanya salah satu, dan bilahnya terlihat
     macet di separuh kasus. */
  assert.ok(/diproses % KABAR_TIAP === 0 \|\| Date\.now\(\) - kabarTerakhir >= KABAR_MS/.test(SYNC),
    'kabar progres cuma dibatasi satu syarat');
});

test('berkas GAGAL tetap dihitung sebagai kemajuan', () => {
  /* Menghitung hanya yang berhasil membuat bilah berhenti bergerak pada
     folder yang isinya banyak gagal — dan bilah yang berhenti persis itulah
     yang membuat orang mengira sync-nya mati. */
  const loop = SYNC.slice(SYNC.indexOf('for (const f of batch) {'), SYNC.indexOf('const stats = {'));
  const iCatch = loop.indexOf('failed++');
  const iHitung = loop.indexOf('diproses++');
  assert.ok(iHitung > iCatch,
    'penghitung kemajuan berada di dalam try — berkas gagal tak menggerakkan bilah');
});

test('progres DIBUANG saat sync selesai', () => {
  /* Bilah yang tertinggal dari jalan sebelumnya terbaca sebagai sync yang
     masih berjalan, dan pemiliknya menunggu sesuatu yang sudah rampung
     berjam-jam lalu. */
  assert.ok(/progress: null/.test(SYNC), 'progres tak pernah dibersihkan');
  const iBuang = SYNC.indexOf('progress: null');
  const iStatus = SYNC.indexOf("await setStatus(quotaStop ? 'quota'");
  assert.ok(iBuang > 0 && iBuang < iStatus,
    'progres dibuang setelah status final ditulis — ada jendela di mana keduanya bertentangan');
});

test('gagal menulis progres TIDAK menggagalkan sync', () => {
  // Yang hilang cuma bilahnya; pekerjaannya sendiri tetap benar.
  const fn = SYNC.slice(SYNC.indexOf('const kabarProgres'), SYNC.indexOf("await setStatus('syncing')"));
  assert.ok(/try \{/.test(fn) && /catch \(err\)/.test(fn),
    'kegagalan menulis progres bisa menjatuhkan seluruh sync');
});

test('UI menyegarkan sendiri selagi sync jalan, dan BERHENTI sesudahnya', () => {
  /* Polling yang terus jalan pada halaman diam adalah satu permintaan tiap
     dua detik selamanya, untuk jawaban yang tak pernah berubah. */
  assert.ok(/const adaBerjalan =/.test(UI), 'UI tak tahu apakah ada sync berjalan');
  assert.ok(/if \(!adaBerjalan\) return;/.test(UI), 'polling tak berhenti saat tak ada yang berjalan');
  assert.ok(/clearInterval\(t\)/.test(UI), 'interval tak dibersihkan — bocor saat halaman ditinggalkan');
});

test('bilah BEKU dibedakan dari bilah yang bergerak', () => {
  /* Proses yang MATI meninggalkan progres terakhirnya di basis data, dan
     bilah beku pada 40% tak bisa dibedakan dari sync yang sedang mengunduh
     berkas besar. Menyamakan keduanya membuat pemilik menunggu proses yang
     sudah tak ada. */
  assert.ok(/const diam = Date\.now\(\) - new Date\(p\.at\)\.getTime\(\) > 60_000/.test(UI),
    'cap waktu progres tak dibaca — sync yang mati tampak masih berjalan');
  assert.ok(/MUNGKIN BERHENTI/.test(UI), 'keadaan macet tak disebutkan kepada pengguna');
});

test('bilah tak muncul saat tak ada progres', () => {
  assert.ok(/if \(!p \|\| !p\.total\) return null;/.test(UI),
    'bilah tampil walau tak ada progres — nol dari nol akan tampil sebagai 100%');
});
