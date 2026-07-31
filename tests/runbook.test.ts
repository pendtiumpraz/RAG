import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * RUNBOOK CADANGAN & PEMULIHAN, dan pemeriksa selisihnya.
 *
 * Dokumen pemulihan punya bentuk kegagalan yang khas: ia benar saat ditulis,
 * lalu perintah yang dirujuknya berganti nama, dan yang menemukan akibatnya
 * adalah orang yang sedang panik. Karena itu setiap perintah di dalamnya
 * diperiksa memang ada.
 *
 * Yang dijaga lebih keras lagi adalah SIFAT pemeriksanya. Versi pertama
 * dr-verify mencocokkan nama tabel/indeks/kebijakan dengan isi berkas repo,
 * dan melaporkan ENAM selisih yang keenamnya PALSU — dua UNIQUE constraint
 * bernama otomatis oleh Drizzle, dan empat kebijakan yang dibuat migrasi 0017
 * lewat FOREACH + format() sehingga namanya tak pernah muncul sebagai teks.
 * Pemeriksa yang berisik lebih buruk daripada tak ada: orang belajar
 * mengabaikannya, lalu selisih sungguhan bersembunyi di antara deranya.
 */

const DOC = readFileSync('docs/RUNBOOK.md', 'utf8');
/* Spasi dirapatkan sebelum mencari kalimat: Markdown mematahkan baris di
   ~80 kolom, jadi kalimat yang dicari hampir tak pernah utuh dalam satu
   baris — dan uji yang mengabaikan itu gagal karena tata letak, bukan
   karena isinya salah. */
const RATA = DOC.replace(/\s+/g, ' ');
const SKRIP = readFileSync('scripts/dr-verify.ts', 'utf8');
const PKG = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> };
const PATOKAN = JSON.parse(readFileSync('docs/dr-baseline.json', 'utf8')) as Record<string, string[]>;

test('setiap perintah npm yang disebut runbook memang ada', () => {
  const disebut = [...DOC.matchAll(/npm run ([\w:-]+)/g)].map((m) => m[1]);
  assert.ok(disebut.length >= 5, `runbook hanya menyebut ${disebut.length} perintah`);
  const hilang = [...new Set(disebut)].filter((s) => !PKG.scripts[s]);
  assert.deepEqual(hilang, [], `perintah tak ada di package.json: ${hilang.join(', ')}`);
});

test('pemeriksa membandingkan PATOKAN, bukan mencocokkan teks repo', () => {
  /* Pencocokan teks tak bisa memahami SQL dinamis maupun nama yang dibuat
     ORM. Patokan yang di-commit tak punya masalah itu: perubahan yang
     disengaja terlihat di diff, yang tak disengaja jadi kegagalan skrip. */
  assert.ok(/docs\/dr-baseline\.json/.test(SKRIP), 'skrip tak memakai berkas patokan');
  assert.ok(!/schema\.ts.*includes|berkas\.includes/.test(SKRIP),
    'skrip kembali mencocokkan nama dengan isi berkas repo');
  assert.ok(/--tulis/.test(SKRIP), 'tak ada cara memperbarui patokan secara sadar');
});

test('indeks penopang CONSTRAINT sengaja dilewati', () => {
  /* Ia lahir dari `.unique()`/primary key di schema.ts, namanya dibuat
     Drizzle, dan db:push selalu membuatnya kembali. Memasukkannya cuma
     menambah baris yang tak bisa ditindaklanjuti siapa pun — dan itulah dua
     dari enam positif palsu versi pertama. */
  assert.ok(/from pg_constraint c where c\.conname = i\.indexname/.test(SKRIP),
    'indeks constraint ikut dibandingkan — positif palsu akan kembali');
});

test('patokan memuat kelima dimensi yang menentukan pemulihan', () => {
  /* Tabel saja tak cukup: indeks yang hilang membuat produksi melambat tanpa
     galat, dan kebijakan RLS yang hilang mematikan isolasi tenant tanpa
     gejala apa pun. */
  for (const k of ['tabel', 'indeks', 'kebijakan', 'ekstensi', 'rlsAktif']) {
    assert.ok(Array.isArray(PATOKAN[k]), `patokan tak memuat ${k}`);
    assert.ok(PATOKAN[k].length > 0, `patokan ${k} kosong`);
  }
  // RLS aktif dicatat TERPISAH dari kebijakannya: kebijakan yang ada tapi
  // RLS-nya mati tak menahan apa pun.
  assert.ok(PATOKAN.rlsAktif.length >= 20, 'jumlah tabel ber-RLS mencurigakan rendah');
  assert.ok(PATOKAN.ekstensi.includes('vector'), 'pgvector tak tercatat di patokan');
});

test('skrip HANYA membaca', () => {
  /* Skrip pemulihan yang bisa menulis ke produksi adalah risiko yang lebih
     besar daripada masalah yang dipecahkannya. Satu-satunya penulisannya
     adalah berkas patokan di repo. */
  for (const berbahaya of [/\bdrop\b/i, /\bdelete\s+from\b/i, /\btruncate\b/i, /\balter\s+table\b/i, /\bcreate\s+(table|policy|index)\b/i]) {
    assert.ok(!berbahaya.test(SKRIP), `skrip memuat perintah yang mengubah basis data: ${berbahaya}`);
  }
  assert.equal((SKRIP.match(/writeFileSync\(/g) ?? []).length, 1, 'skrip menulis lebih dari berkas patokan');
});

test('runbook menuliskan yang BELUM pernah diuji', () => {
  /* Runbook yang menyembunyikan bagian ini justru paling berbahaya: ia dibaca
     sebagai jaminan, dan jaminannya baru diuji saat sudah terlambat. */
  assert.ok(/BELUM pernah diuji/i.test(DOC), 'runbook tak menyebut batas pengujiannya');
  assert.ok(/belum pernah dicoba bukan pemulihan/i.test(RATA),
    'runbook tak menyatakan bahwa prosedurnya belum pernah dijalankan');
  assert.ok(/CREDENTIALS_ENCRYPTION_KEY/.test(DOC),
    'runbook tak menyebut rahasia yang hilangnya tak bisa dipulihkan cadangan mana pun');
});

test('runbook memperingatkan db:push pada basis data berisi', () => {
  /* Perintah itu sudah tiga kali merusak produksi di proyek ini. Runbook yang
     menuliskannya tanpa peringatan mengundang kejadian keempat, justru saat
     orang sedang panik dan mencari perintah apa pun yang terlihat menolong. */
  assert.ok(/TIDAK BOLEH dijalankan pada basis data produksi/i.test(DOC));
  assert.ok(/db:migrate/.test(DOC), 'runbook tak menyebut jalan pemulihannya');
});

test('runbook menyebut soft delete SEBELUM PITR', () => {
  /* Hampir semua "data hilang" di produk ini sebenarnya deleted_at terisi.
     Menempuh PITR untuk sesuatu yang bisa dipulihkan lewat satu klik adalah
     risiko yang tak perlu diambil. */
  /* Dibandingkan terhadap ISI bagian, bukan terhadap daftar isi di atas —
     judul yang sama muncul dua kali, dan indexOf menemukan yang di daftar
     isi lebih dulu. */
  const isi = DOC.slice(DOC.indexOf('## 2 · Pulihkan'));
  const iSoft = isi.indexOf('Soft delete lebih dulu');
  const iBangun = isi.indexOf('## 3 ·');
  assert.ok(iSoft > 0, 'runbook tak menyebut soft delete');
  assert.ok(iSoft < iBangun, 'soft delete disebut setelah prosedur yang lebih berisiko');
  assert.ok(/trashed/.test(DOC) && /restore/.test(DOC), 'runbook tak menyebut endpoint pemulihannya');
});
