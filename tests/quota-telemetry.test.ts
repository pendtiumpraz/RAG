import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env.DATABASE_URL ??= 'postgres://x:y@localhost:5432/z';
process.env.CREDENTIALS_ENCRYPTION_KEY ??= '0'.repeat(64);

/**
 * TELEMETRI KUOTA.
 *
 * Kegagalan yang dijaga di sini SUNYI dan berumur panjang: tanpa pencatatan,
 * penolakan kuota tetap bekerja dengan benar bagi pengguna (402 + pesan yang
 * jelas) sambil tak meninggalkan satu pun jejak. Tak ada galat, tak ada tes
 * merah — hanya pertanyaan yang tetap tak terjawab enam bulan kemudian,
 * ketika ia justru paling dibutuhkan.
 */

const KS = readFileSync('src/modules/knowledge/knowledge.service.ts', 'utf8');
const REP = readFileSync('scripts/quota-report.ts', 'utf8');

test('penolakan kuota DICATAT, bukan cuma dilempar', async () => {
  const { AKSI_TOLAK_KUOTA } = await import('../src/modules/knowledge/knowledge.service');
  assert.equal(AKSI_TOLAK_KUOTA, 'quota.rejected');
  // Dicatat SEBELUM melempar — kalau sesudah, ia tak pernah tereksekusi.
  const fn = KS.slice(KS.indexOf('async function assertChunkQuota'), KS.indexOf('async function chunkCount') >>> 0 || undefined);
  const iAudit = fn.indexOf('await audit(');
  const iThrow = fn.indexOf('throw new QuotaError');
  assert.ok(iAudit > 0, 'penolakan kuota tak dicatat sama sekali');
  assert.ok(iAudit < iThrow, 'pencatatan diletakkan setelah throw — tak akan pernah jalan');
});

test('yang dicatat cukup untuk MENJAWAB pertanyaannya', async () => {
  /* Mencatat "ada penolakan" saja tak menjawab apa pun. Yang menentukan
     keputusan kuota adalah: paket apa, seberapa kurang, dan dari jalur mana —
     pengguna yang menabrak saat MENGUNGGAH sedang mencoba produknya dengan
     sengaja, yang menabrak saat SYNC mungkin tak melihat layar sama sekali. */
  const fn = KS.slice(KS.indexOf('await audit(tenantId'), KS.indexOf('throw new QuotaError'));
  for (const medan of ['plan', 'terpakai', 'batas', 'diminta', 'jalur', 'kurang']) {
    assert.ok(fn.includes(medan), `medan "${medan}" tak ikut dicatat`);
  }
});

test('laporan menghormati RLS — tidak mengintip lintas tenant', () => {
  /* Versi pertama menjalankan agregasi tunggal atas seluruh audit_logs dan
     mengembalikan NOL baris walau datanya ada, karena aplikasi menyambung
     sebagai peran NOBYPASSRLS. Yang menyesatkan: kuerinya tidak GAGAL, ia
     hanya kosong — dan laporan kosong terbaca persis seperti "belum ada
     kejadian". Ketahuan hanya karena dijalankan. */
  assert.ok(/withTenant\(t\.id/.test(REP),
    'laporan tak memakai withTenant — akan diam-diam kosong di bawah RLS');
  assert.ok(!/app\.admin_context/.test(REP),
    'laporan memakai jalan pintas lintas-tenant; itu dibuka hanya di jalur superadmin berpenjaga');
});

test('laporan menolak menyimpulkan dari data kosong', () => {
  // Kuota tak boleh disetel ulang atas dasar tebakan yang dibungkus tabel.
  assert.ok(/Belum ada satu pun penolakan kuota tercatat/.test(REP));
  assert.ok(/TIDAK boleh disetel ulang/.test(REP),
    'laporan kosong tak menyatakan bahwa ia bukan dasar keputusan');
  // Dan membedakan "belum terjadi" dari "tak terekam" — dua hal yang sangat
  // berbeda, dan yang kedua persis keadaan sebelum kartu ini.
  assert.ok(/bukan berarti kejadiannya tak terekam/.test(REP));
});

test('laporan mengukur AKIBATNYA, bukan sekadar jumlah penolakan', () => {
  /* Akun yang menabrak lalu naik paket membuktikan batasnya mendorong; akun
     yang menabrak lalu tak pernah kembali membuktikan batasnya mengusir.
     Dua-duanya terlihat sama di angka "jumlah penolakan". */
  assert.ok(/chat_sesudah|chatSesudah/.test(REP), 'aktivitas sesudah penolakan tak diukur');
  assert.ok(/planSekarang/.test(REP), 'kenaikan paket sesudah penolakan tak diukur');
  assert.ok(/jamKeTolak/.test(REP), 'jarak waktu dari mendaftar ke tabrakan pertama tak diukur');
});
