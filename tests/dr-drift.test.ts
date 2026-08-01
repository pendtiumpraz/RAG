import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

/**
 * PENDETEKSI HANYUT DR — membedakan migrasi ter-commit dari perubahan liar.
 *
 * Bentuk kegagalan yang dijaga di sini BUKAN "alarm palsu bikin berisik".
 * Berisik cuma gejala. Yang berbahaya: kalau tiap migrasi sah memicu
 * gelombang alarm, menyegarkan patokan jadi refleks — dan hanyutan sungguhan
 * ikut disetujui tanpa pernah dibaca. Alat yang selalu berbunyi sama saja
 * dengan alat yang tak pernah berbunyi.
 *
 * Karena itu dua sisi diuji terpisah, dan yang kedua lebih penting: bahwa
 * "terjelaskan" tidak menelan segalanya.
 */

/* Diimpor dari src/, BUKAN dari scripts/dr-verify.ts: skrip itu membuka
   koneksi Postgres saat diimpor, jadi mengujinya lewat sana akan menuntut
   basis data hidup untuk memeriksa dua fungsi yang tak menyentuh DB sama
   sekali. Uji yang mahal dijalankan adalah uji yang berhenti dijalankan. */
import { dijelaskanMigrasi, teksMigrasi } from '../src/modules/core/dr-drift';

const MIGRASI = teksMigrasi();

test('objek dari migrasi ter-commit dikenali TERJELASKAN', () => {
  /* Ketujuhnya nyata: migrasi 0040 masuk, lalu dr:verify melaporkannya
     sebagai tujuh hanyutan menakutkan yang semuanya sah. */
  for (const nama of [
    'divisions', 'idx_divisions_tenant', 'uq_divisions_tenant_name',
    'idx_users_division', 'idx_chatbots_division',
  ]) {
    assert.equal(dijelaskanMigrasi(nama, MIGRASI), true, `${nama} tak dikenali dari migrasi`);
  }
});

test('kebijakan dicocokkan lewat SEGMEN TERAKHIR, bukan "tabel.kebijakan" utuh', () => {
  /* Kebijakan dicatat sebagai tabel.kebijakan, tapi migrasinya menulis nama
     kebijakannya saja. Menyamakan keduanya membuat SETIAP kebijakan baru
     tampak liar — dan kebijakan RLS justru jenis objek yang paling sering
     ditambahkan, jadi kesalahan ini akan berulang di hampir tiap migrasi. */
  assert.equal(dijelaskanMigrasi('divisions.divisions_tenant_isolation', MIGRASI), true);
  assert.ok(!MIGRASI.includes('divisions.divisions_tenant_isolation'),
    'bentuk bertitik ternyata ada di migrasi — uji ini tak lagi membuktikan apa pun');
});

test('objek yang TAK disebut migrasi mana pun tetap LIAR', () => {
  /* Inti alatnya. Kalau sisi ini rusak, skripnya berhenti mendeteksi
     satu-satunya hal yang ia ada untuk mendeteksi: indeks yang dibuat manual
     lewat psql, kebijakan yang tak pernah masuk migrasi, kolom dari db:push. */
  for (const nama of [
    'idx_dibuat_manual_lewat_psql', 'users.kebijakan_darurat_2026',
    'tabel_percobaan', 'zzz_indeks_liar',
  ]) {
    assert.equal(dijelaskanMigrasi(nama, MIGRASI), false, `${nama} keliru dianggap terjelaskan`);
  }
});

test('pencocokan memakai BATAS KATA — objek liar tak bisa menumpang nama lain', () => {
  /* Dengan `includes`, indeks liar bernama `divisions_bocor` akan cocok pada
     kata `divisions` di migrasi 0040 dan lolos sebagai "terjelaskan". Persis
     bentuk kegagalan yang paling mahal: alat tampak bekerja, diam pada hal
     yang seharusnya diteriakkannya. */
  const teks = 'create table divisions (id uuid);';
  assert.equal(dijelaskanMigrasi('divisions', teks), true);
  assert.equal(dijelaskanMigrasi('divisions_bocor', teks), false, 'awalan ikut cocok');
  assert.equal(dijelaskanMigrasi('xdivisions', teks), false, 'akhiran ikut cocok');
  // Nama kosong (mis. kunci yang berakhir titik) TIDAK boleh cocok dengan apa pun.
  assert.equal(dijelaskanMigrasi('tabel.', teks), false);
  assert.equal(dijelaskanMigrasi('', teks), false);
});

test('nama berkarakter regex tidak meledak dan tidak jadi pola liar', () => {
  /* Nama objek Postgres boleh dikutip dan memuat titik/kurung. Tanpa
     pelolosan, `idx.*` akan berubah jadi pola yang cocok dengan apa saja —
     satu nama aneh cukup untuk membuat SELURUH pemeriksaan diam. */
  const teks = 'create index idx_aman on t (a);';
  assert.equal(dijelaskanMigrasi('idx.*', teks), false);
  assert.equal(dijelaskanMigrasi('a+b', teks), false);
});

test('HILANG tak pernah bisa dijelaskan migrasi', () => {
  /* Migrasi bisa menjelaskan kelahiran objek, tak pernah ketiadaannya — tak
     ada berkas yang membuktikan sesuatu memang seharusnya lenyap. Kalau
     cabang `hilang` ikut disaring dijelaskanMigrasi, indeks yang di-DROP
     db:push justru akan dibungkam oleh migrasi yang dulu membuatnya. */
  const src = readFileSync('scripts/dr-verify.ts', 'utf8');
  const blok = src.slice(src.indexOf('for (const x of d.hilang)'), src.indexOf('for (const x of d.baru)'));
  assert.ok(!/dijelaskanMigrasi/.test(blok),
    'cabang HILANG ikut disaring migrasi — objek yang dihapus akan dibungkam');
  assert.ok(/liar\+\+/.test(blok), 'HILANG tak lagi dihitung sebagai liar');
});

test('menyegarkan patokan DITOLAK selama masih ada hanyutan liar', () => {
  /* Menyegarkan patokan saat ada selisih liar adalah cara paling rapi
     menghapus bukti: selisihnya berhenti dilaporkan tanpa pernah menjadi
     bisa dipulihkan. Itu justru kebiasaan yang hendak dicegah kartu ini. */
  const src = readFileSync('scripts/dr-verify.ts', 'utf8');
  assert.ok(/MENOLAK menulis patokan/.test(src), 'penjagaan --tulis hilang');
  assert.ok(/--paksa/.test(src), 'tak ada jalan keluar sadar untuk kasus yang memang disengaja');
  const iTolak = src.indexOf('if (tulis && existsSync(BASELINE)');
  const iTulis = src.indexOf('writeFileSync(BASELINE');
  assert.ok(iTolak > 0 && iTolak < iTulis, 'penjagaan berjalan SETELAH patokan ditimpa');
});

test('exit code hanya dinaikkan oleh yang LIAR, bukan yang terjelaskan', () => {
  /* Kalau yang terjelaskan ikut menggagalkan, tak ada yang berubah dari
     versi lama selain kata-katanya — dan CI tetap merah tiap migrasi. */
  const src = readFileSync('scripts/dr-verify.ts', 'utf8');
  const blok = src.slice(src.indexOf('if (liar === 0)'));
  assert.ok(/process\.exitCode = 1;/.test(blok));
  assert.ok(!/terjelaskan\.length[\s\S]{0,120}process\.exitCode = 1/.test(blok),
    'objek terjelaskan ikut menggagalkan pemeriksaan');
});

test('patokan yang di-commit sudah menyertakan migrasi terakhir', () => {
  /* Patokan yang tertinggal membuat pembaca berikutnya menghadapi dera yang
     sama, dan pelajaran kartu ini hilang bersamanya. */
  const patokan = JSON.parse(readFileSync('docs/dr-baseline.json', 'utf8')) as
    { tabel: string[]; indeks: string[]; kebijakan: string[]; rlsAktif: string[] };
  const terakhir = readdirSync('migrations').filter((f) => f.endsWith('.sql')).sort().at(-1)!;
  assert.equal(terakhir, '0045_saklar_konektor.sql', 'ada migrasi lebih baru — patokan perlu disegarkan');
  assert.ok(patokan.tabel.includes('divisions'));
  assert.ok(patokan.tabel.includes('rate_buckets'));
  assert.ok(patokan.indeks.includes('idx_conversations_chatbot_started'),
    'indeks penghitung demo belum masuk patokan');
  assert.ok(patokan.rlsAktif.includes('sso_connections'),
    'sso_connections tanpa RLS aktif — koneksi IdP tenant lain ikut terbaca');
  assert.ok(patokan.indeks.includes('idx_chatbots_visitor_secret'),
    'indeks identitas pengunjung belum masuk patokan');
  assert.ok(!patokan.rlsAktif.includes('rate_buckets'),
    'rate_buckets ber-RLS padahal tanpa tenant_id — kebijakan yang tak menjaga apa pun');
  assert.ok(patokan.rlsAktif.includes('divisions'), 'divisions tercatat tanpa RLS aktif');
  assert.ok(patokan.kebijakan.includes('divisions.divisions_tenant_isolation'));
  for (const i of ['idx_divisions_tenant', 'uq_divisions_tenant_name', 'idx_users_division', 'idx_chatbots_division']) {
    assert.ok(patokan.indeks.includes(i), `indeks ${i} belum masuk patokan`);
  }
});
