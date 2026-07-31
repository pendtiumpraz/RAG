import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env.DATABASE_URL ??= 'postgres://x:y@localhost:5432/z';
process.env.CREDENTIALS_ENCRYPTION_KEY ??= '0'.repeat(64);

/**
 * BILAH SISA KUOTA.
 *
 * Endpoint /api/usage/storage sudah ada sejak kuota dipasang tapi TAK SATU
 * PUN halaman memakainya, jadi batas paket baru terasa saat unggahan atau
 * sync DITOLAK. Dengan kuota Free yang sengaja ketat, inilah pembeda antara
 * pesan "paketmu penuh" dan kesan "aplikasinya rusak".
 */

const BAR = readFileSync('src/app/_components/quota-bar.tsx', 'utf8');
const KB = readFileSync('src/app/(app)/knowledge/page.tsx', 'utf8');
const RUTE = readFileSync('src/app/api/usage/storage/route.ts', 'utf8');

test('bilah dipasang di halaman yang MEMAKAI kuota', () => {
  // Peringatan yang harus digulir untuk ditemukan tak pernah dibaca sebelum
  // tombolnya ditekan — dan tombol di halaman inilah yang memakai kuota.
  assert.ok(/import \{ QuotaBar \}/.test(KB), 'halaman Knowledge tak memakai bilah kuota');
  const kepala = KB.slice(KB.indexOf('page-head'), KB.indexOf('</div>', KB.indexOf('page-head')) + 400);
  assert.ok(/<QuotaBar/.test(kepala), 'bilah tidak berada di kepala halaman');
});

test('tanpa batas TIDAK ditampilkan sebagai kuota nol', () => {
  /* Infinity tak selamat melewati JSON.stringify — ia jadi `null`.
     Menganggap null sebagai NOL akan membuat tenant on-premise dan platform
     melihat "kuota 0" dengan bilah merah penuh, padahal justru merekalah
     yang tak dibatasi apa pun. Kegagalan ini tak melempar galat; ia hanya
     berbohong dengan meyakinkan. */
  assert.ok(/takTerbatas/.test(BAR), 'tak ada penanganan kuota tanpa batas');
  assert.ok(/v == null \|\| !Number\.isFinite\(v\)/.test(BAR),
    'null dari JSON tidak diperlakukan sebagai tanpa batas');
  assert.ok(/TANPA BATAS/.test(BAR), 'keadaan tanpa batas tak punya tampilannya sendiri');
});

test('peringatan menyala di 80%, bukan hanya saat penuh', () => {
  // Ambangnya di 80 karena satu kali sync folder besar bisa memakan sisa 20%
  // sekaligus; peringatan yang datang di 95% sudah terlambat ditindaklanjuti.
  const m = /ambangPeringatan\s*=\s*(\d+)/.exec(BAR);
  assert.ok(m, 'tak ada ambang peringatan');
  const ambang = Number(m![1]);
  assert.ok(ambang <= 80 && ambang >= 60,
    `ambang ${ambang}% — terlalu telat untuk masih bisa ditindaklanjuti`);
});

test('tiga keadaan punya tampilan BERBEDA', () => {
  /* Bilah yang selalu merah berhenti dibaca sebagai peringatan, dan bilah
     yang tak pernah berubah warna tak memberi tahu apa pun. */
  assert.ok(/var\(--danger\)/.test(BAR), 'keadaan penuh tak dibedakan');
  assert.ok(/var\(--source-mark\)/.test(BAR) || /var\(--warn\)/.test(BAR),
    'keadaan mendekati batas tak dibedakan');
  assert.ok(/var\(--signal\)/.test(BAR), 'keadaan tenang tak dibedakan');
});

test('penolakan menyebut JALAN KELUARNYA, bukan cuma menolak', () => {
  // Batas yang menolak tanpa menawarkan apa pun tak dibaca sebagai batas,
  // melainkan sebagai jalan buntu.
  assert.ok(/hapus dokumen|naikkan paket/i.test(BAR),
    'pesan kuota habis tak menyebutkan apa yang bisa dilakukan');
});

test('satuan yang DITEGAKKAN disebut lebih dulu, terjemahannya menyusul', () => {
  /* Kuota yang sebenarnya adalah POTONGAN. Menaruh megabyte di depan membuat
     orang mengira MB-lah kuotanya, lalu bingung ketika berkas 1 MB berisi
     tabel menghabiskan jatah lebih banyak daripada berkas 5 MB hasil pindai. */
  const iPotongan = BAR.indexOf('potongan\n');
  const iMb = BAR.indexOf('di basis data');
  assert.ok(iPotongan > 0 && iMb > iPotongan,
    'terjemahan ke megabyte mendahului satuan potongan yang benar-benar ditegakkan');
});

test('bilah disegarkan sesudah tindakan yang mengubah pemakaian', () => {
  /* Bilah yang menampilkan angka SEBELUM sync padahal sync-nya sudah selesai
     lebih buruk daripada tak ada bilah: orang mengira masih punya sisa yang
     sebenarnya sudah terpakai. Kegagalan ini tak melempar apa pun. */
  assert.ok(/refreshKey/.test(BAR), 'bilah tak bisa disegarkan sama sekali');
  assert.ok(/segarkanKuota/.test(KB), 'halaman tak pernah menyegarkan bilahnya');
  const setelahSync = KB.slice(KB.indexOf('Sync dijalankan'), KB.indexOf('Sync dijalankan') + 260);
  assert.ok(/segarkanKuota\(\)/.test(setelahSync), 'kuota tak disegarkan sesudah sync');
});

test('endpoint tetap di balik sesi', () => {
  // Pemakaian penyimpanan menyatakan berapa dokumen yang dimiliki sebuah
  // tenant — angka yang tak boleh bisa dibaca siapa pun tanpa sesi.
  assert.ok(/getCurrentUser\(\)/.test(RUTE), 'endpoint kuota tak memeriksa sesi');
  assert.ok(/user\.tenantId/.test(RUTE), 'kuota tak dibatasi ke tenant pemanggil');
});
