import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env.DATABASE_URL ??= 'postgres://x:y@localhost:5432/z';
process.env.CREDENTIALS_ENCRYPTION_KEY ??= '0'.repeat(64);

/**
 * PEKERJA INGEST.
 *
 * Kegagalan yang dijaga di sini semuanya SUNYI — tak satu pun melempar galat.
 * Pekerja yang berjalan dengan batas lambda tetap maju, hanya ribuan kali
 * lebih lama; pekerja yang memakai userId sembarang gagal dengan galat izin
 * yang terbaca seperti akses dicabut; pekerja tanpa atap putaran menggantung
 * semalaman tanpa ada yang tahu.
 */

const load = () => import('../src/modules/knowledge/sync-limits');
const W = readFileSync('scripts/ingest-worker.ts', 'utf8');
const SYNC = readFileSync('src/modules/knowledge/sync.service.ts', 'utf8');

test('mode pekerja hanya menyala bila DINYATAKAN', async () => {
  /* Menebak "apakah aku di lambda?" gagal ke arah yang paling mahal: salah
     menebak "pekerja" saat sebenarnya di lambda membuat SETIAP sync
     kehabisan waktu di tengah jalan, dan gagalnya tak terbaca sebagai salah
     konfigurasi melainkan sebagai sync yang rusak. */
  const { batasSync, ENV_PEKERJA } = await load();
  assert.equal(batasSync({}).mode, 'lambda');
  assert.equal(batasSync({ [ENV_PEKERJA]: '' }).mode, 'lambda');
  // Variabel yang terlanjur tersetel '0'/'false' di suatu tempat tak boleh
  // diam-diam menyalakan mode yang salah.
  assert.equal(batasSync({ [ENV_PEKERJA]: '0' }).mode, 'lambda');
  assert.equal(batasSync({ [ENV_PEKERJA]: 'false' }).mode, 'lambda');
  for (const v of ['1', 'true', 'YES']) {
    assert.equal(batasSync({ [ENV_PEKERJA]: v }).mode, 'pekerja', `nilai "${v}" tak menyalakan mode pekerja`);
  }
});

test('batas pekerja jauh lebih besar TAPI tetap berhingga', async () => {
  const { BATAS_LAMBDA, BATAS_PEKERJA } = await load();
  assert.ok(BATAS_PEKERJA.ingestPerRun > BATAS_LAMBDA.ingestPerRun * 10,
    'batas pekerja tak cukup besar untuk mengubah apa pun');
  /* Jendela listing yang paling menentukan, dan paling mudah luput: dengan
     3,1 juta berkas, batas 2.000 membuat listing SELALU terpotong — dan
     planDelta sengaja MELEWATI penghapusan ketika listing terpotong. Artinya
     pada korpus besar, berkas yang dihapus di Drive tak pernah hilang dari
     knowledge base. */
  assert.ok(BATAS_PEKERJA.listFiles > BATAS_LAMBDA.listFiles * 10,
    'jendela listing pekerja tak dinaikkan — deteksi berkas terhapus tetap mati');
  // BERHINGGA: tanpa atap, satu sync membaca seluruh korpus ke satu rencana
  // sebelum menyentuh berkas pertama, dan pada 3,1 juta berkas itu berarti
  // kehabisan memori sebelum satu dokumen pun masuk.
  for (const v of [BATAS_PEKERJA.ingestPerRun, BATAS_PEKERJA.listFiles]) {
    assert.ok(Number.isFinite(v) && v > 0, 'batas pekerja tak berhingga — akan mati kehabisan memori');
  }
});

test('sync membaca batasnya dari sync-limits, bukan angka mati', async () => {
  assert.ok(/batasSync\(\)/.test(SYNC), 'sync.service kembali memakai angka mati');
  assert.ok(!/const MAX_INGEST_PER_SYNC = \d+/.test(SYNC),
    'batas ingest ditulis mati lagi — mode pekerja jadi tak berpengaruh');
  assert.ok(!/const MAX_LIST_FILES = \d+/.test(SYNC),
    'jendela listing ditulis mati lagi');
});

test('pekerja MENOLAK berjalan dengan batas lambda', () => {
  /* Diam-diam memakainya akan tampak bekerja — ia memang maju — sambil
     membutuhkan ribuan kali lebih lama, dan tak ada yang akan curiga. */
  assert.ok(/batas\.mode !== 'pekerja'/.test(W), 'pekerja tak memeriksa modenya sendiri');
  assert.ok(/process\.exit\(2\)/.test(W), 'pekerja lanjut berjalan walau modenya salah');
});

test('pekerja memakai runSync YANG SAMA, bukan jalur ingest sendiri', () => {
  /* Jalur ingest kedua akan berbeda perilakunya dalam hal yang tak seorang
     pun sadari sampai hasil ingest lewat pekerja ternyata tak sama dengan
     lewat tombol. */
  assert.ok(/import \{ runSync \}/.test(W), 'pekerja tak memanggil runSync produksi');
  assert.ok(/export async function runSync/.test(SYNC), 'runSync tak diekspor');
  // Tak ada embed/chunk sendiri di pekerja.
  assert.ok(!/chunkText|embed\(/.test(W), 'pekerja punya jalur ingest sendiri');
});

test('userId diambil dari PEMILIK KONEKSI, bukan user sembarang', () => {
  /* userId hanya dipakai mengambil token OAuth akun sumber itu. Memakai user
     sembarang berarti token milik orang lain, dan sync gagal dengan galat
     izin yang menyesatkan: seolah aksesnya dicabut, padahal sekadar salah
     orang. */
  assert.ok(/from oauth_connections/.test(W), 'pemilik token tak dicari dari oauth_connections');
  assert.ok(/account_email = \$\{email\.toLowerCase\(\)\}/.test(W),
    'akun sumber tak dicocokkan — bisa memilih koneksi akun lain di tenant yang sama');
});

test('sumber berkuota habis DILEWATI, bukan diputar ulang', () => {
  // Memutar ulang sesuatu yang pasti ditolak hanya membakar panggilan
  // upstream; yang perlu terjadi adalah manusia menghapus dokumen atau
  // menaikkan paket.
  assert.ok(/r\.status === 'quota'/.test(W), 'sumber berkuota habis ikut diputar ulang');
});

test('ada atap putaran DAN penghentian yang rapi', () => {
  /* Sync yang tak pernah menghabiskan antreannya akan memutar selamanya
     tanpa satu pun tanda; dan memutus di TENGAH sync meninggalkan sumber
     berstatus 'syncing' yang tak pernah berubah — terbaca sebagai macet
     padahal cuma dihentikan. */
  assert.ok(/MAX_PUTARAN/.test(W), 'tak ada atap putaran — pekerja bisa menggantung semalaman');
  assert.ok(/SIGINT/.test(W) && /SIGTERM/.test(W), 'tak menangani sinyal henti');
  assert.ok(/berhenti = true/.test(W) && /if \(berhenti\) break/.test(W),
    'penghentian tak menunggu putaran selesai');
});

test('satu sumber yang gagal tak menghentikan sumber lain', () => {
  const blok = W.slice(W.indexOf('for (const a of daftar)'));
  assert.ok(/catch \(e\)/.test(blok) && /break;/.test(blok),
    'kegagalan satu sumber menjatuhkan seluruh antrean');
});
