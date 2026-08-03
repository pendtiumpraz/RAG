import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { irisBlok } from './_iris';

/**
 * PEMULIHAN AKUN SAAT EMAIL TAK BISA DIAKSES (kartu a-account-recovery).
 *
 * Ini satu-satunya jalur di seluruh aplikasi tempat seseorang bisa membuka
 * akses ke akun ORANG LAIN. Dua arah salah, dan keduanya mahal: pagar yang
 * bocor mengubah satu akun admin jadi kunci ke akun siapa pun; pagar yang
 * terlalu rapat mengunci organisasi keluar dari workspace-nya sendiri.
 *
 * Seluruh tes di sini menjaga PAGARNYA, bukan kenyamanannya.
 */

const SVC = readFileSync('src/modules/auth/pemulihan.service.ts', 'utf8');
const BLOK = irisBlok(SVC, 'async terbitkan(');
const RUTE = readFileSync('src/app/api/team/members/[id]/recover/route.ts', 'utf8');
const UI = readFileSync('src/app/(app)/team/page.tsx', 'utf8');

test('hanya admin & superadmin yang boleh menerbitkan', () => {
  assert.ok(/\['admin', 'superadmin'\]\.includes\(actor\.role\)/.test(BLOK),
    'peran penerbit tak diperiksa — anggota biasa bisa memulihkan siapa pun');
});

test('TIDAK bisa menerbitkan untuk DIRI SENDIRI', () => {
  /* Menerbitkan tautan pemulihan untuk diri sendiri bukan pemulihan — itu
     jalan pintas melewati kata sandi. Ia mengubah satu sesi yang dibajak
     (laptop tertinggal terbuka, cookie dicuri) dari akses sementara jadi
     penguasaan akun yang permanen. */
  assert.ok(/actor\.id === targetUserId/.test(BLOK), 'admin bisa memulihkan akunnya sendiri');
  assert.ok(/Lupa password/.test(BLOK), 'penolakannya tak menunjukkan jalur yang benar');
});

test('BATAS TENANT ditegakkan eksplisit, tak dititipkan ke RLS', () => {
  /* Kueri di layanan ini memakai koneksi tanpa konteks tenant supaya
     superadmin platform bisa menolong tenant mana pun. Yang membuat itu aman
     adalah pemeriksaan eksplisit — bukan ketiadaan kebocoran. */
  assert.ok(/actor\.role !== 'superadmin' && target\.tenantId !== actor\.tenantId/.test(BLOK),
    'admin tenant bisa memulihkan akun di tenant lain');
  /* Dan penolakannya menyamar sebagai "tidak ditemukan": membedakan "ada tapi
     bukan tenantmu" dari "tidak ada" mengubah endpoint ini jadi alat
     memetakan akun lintas organisasi. */
  const potong = BLOK.slice(BLOK.indexOf("actor.role !== 'superadmin'"));
  assert.ok(/Anggota tidak ditemukan/.test(potong.slice(0, 200)),
    'penolakan lintas-tenant membocorkan bahwa akunnya ADA');
});

test('admin tenant TIDAK bisa memulihkan superadmin platform', () => {
  /* Tanpa pagar ini, satu akun admin di tenant mana pun cukup untuk mengambil
     alih akun yang memegang kredensial SELURUH platform. */
  assert.ok(/target\.role === 'superadmin' && actor\.role !== 'superadmin'/.test(BLOK),
    'admin tenant bisa memulihkan akun superadmin');
});

test('tautan TIDAK dikirim lewat email, dan tak disimpan', () => {
  /* Inti kartunya. Semua jalur pemulihan yang ada sebelumnya bermuara ke kotak
     surat yang justru sudah tak bisa dibuka. */
  assert.ok(!/mailerService|sendMail|send\(/.test(SVC), 'tautan pemulihan dikirim lewat email');
  assert.ok(/tak pernah disimpan/.test(SVC), 'tak dinyatakan bahwa tautannya tak disimpan');
  assert.ok(/JANGAN KIRIM LEWAT EMAIL/.test(UI),
    'UI tak memperingatkan justru saat tautannya ada di layar');
});

test('masa berlakunya pendek dan disebutkan', () => {
  assert.ok(/export const JAM_BERLAKU = 1/.test(SVC), 'tautan pemulihan berlaku terlalu lama');
  assert.ok(/BERLAKU SAMPAI/.test(UI), 'UI tak menyebut kapan tautannya mati');
});

test('SELALU dicatat, dan catatannya menyebut siapa memulihkan siapa', () => {
  /* Kemampuan membuka akun orang lain hanya layak ada kalau pemakaiannya bisa
     dilihat oleh selain yang memakainya. */
  assert.ok(/audit\([^)]*'auth\.recovery_issued'/s.test(BLOK), 'penerbitan tak diaudit');
  assert.ok(/targetEmail: target\.email/.test(BLOK), 'audit tak menyebut siapa yang dipulihkan');
  assert.ok(/lintasTenant:/.test(BLOK), 'audit tak membedakan pemulihan lintas tenant');
  assert.ok(/async riwayat\(/.test(SVC), 'tak ada cara melihat riwayat pemulihan');
});

test('audit DI LUAR transaksi — kolam koneksi max:1', () => {
  /* Layanan ini tak membuka withTenant sama sekali, dan itu disengaja:
     pemulihan lintas tenant justru butuh koneksi tanpa konteks. Yang dijaga:
     jangan sampai ada yang "merapikannya" dengan membungkus semuanya ke dalam
     withTenant, karena audit() membuka withTenant sendiri dan keduanya akan
     saling menunggu selamanya di Vercel. */
  assert.ok(!/withTenant\(/.test(SVC),
    'layanan pemulihan membungkus dirinya di withTenant — audit() di dalamnya akan buntu');
});

test('akun yang DITOLAK tak bisa dipulihkan diam-diam jadi aktif', () => {
  assert.ok(/target\.status === 'rejected'/.test(BLOK),
    'akun yang sudah ditolak bisa dipulihkan tanpa melewati antrean verifikasi');
});

test('penolakan dilaporkan 422, bukan 500', () => {
  assert.ok(/ValidationError \? 422 : 500/.test(RUTE));
});

test('UI menyatakan siapa yang MENJAMIN, bukan sekadar tombol', () => {
  /* Tak ada verifikasi otomatis di jalur ini — yang menjamin identitasnya
     adalah manusia yang menekan tombol. Kalau itu tak dikatakan, ia akan
     ditekan sebagai formalitas. */
  assert.ok(/KAMU YANG MENJAMIN INI ORANGNYA/.test(UI));
  assert.ok(/DICATAT DI AUDIT/.test(UI), 'UI tak menyebut bahwa penerbitannya berjejak');
});
