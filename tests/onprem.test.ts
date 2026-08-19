import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { BYTES_PER_CHUNK, CHUNKS_PER_DOC, INDEX_BYTES_PER_CHUNK } from '../src/modules/core/limits';

/**
 * INSTALASI ON-PREMISE.
 *
 * Panduan instalasi punya bentuk kegagalan yang tak pernah membuat apa pun
 * gagal di sini: ia benar saat ditulis, lalu berkas yang dirujuknya berubah.
 * Yang menemukan akibatnya adalah tim IT pelanggan, di server mereka, tanpa
 * kita di ruangan yang sama.
 *
 * Yang dijaga: perintah yang disebut panduan memang ada, variabel yang
 * disebutnya memang ada, dan susunan Docker-nya memang menghasilkan pemasangan
 * yang bekerja — bukan sekadar menyala.
 */

const DOC = readFileSync('docs/ONPREM.md', 'utf8');
const COMPOSE = readFileSync('docker-compose.yml', 'utf8');
const DOCKERFILE = readFileSync('Dockerfile', 'utf8');
const PKG = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> };
const ENVX = readFileSync('.env.example', 'utf8');

test('aplikasi TIDAK tersambung sebagai pemilik basis data', () => {
  /* Postgres MELEWATI seluruh kebijakan RLS untuk pemilik tabel — diam-diam,
     tanpa galat, tanpa jejak di log. Susunan lama menyambungkan aplikasi
     sebagai `rag` (pemilik), sehingga setiap kebijakan isolasi yang dipasang
     migrasi 0001 tak berlaku sama sekali. Aplikasinya tetap berjalan normal;
     itulah yang membuatnya berbahaya. */
  const blokApp = COMPOSE.slice(COMPOSE.indexOf('\n  app:'));
  const dburl = blokApp.match(/^\s+DATABASE_URL:\s*(\S+)/m);
  assert.ok(dburl, 'layanan app tak menyetel DATABASE_URL');
  assert.ok(dburl![1].startsWith('postgres://nalar_app:'),
    `aplikasi tersambung sebagai pemilik — RLS tak berlaku: ${dburl![1]}`);
});

test('ada langkah yang benar-benar MENYIAPKAN basis data', () => {
  /* Tanpa ini, `docker compose up` menyalakan aplikasi di atas basis data
     kosong: menyala, terlihat sehat, dan tak bisa dipakai sama sekali. */
  assert.ok(/^\s{2}setup:/m.test(COMPOSE), 'tak ada layanan penyiapan basis data');
  for (const perintah of ['db:push', 'db:migrate', 'db:setup-role']) {
    assert.ok(COMPOSE.includes(perintah), `layanan setup tak menjalankan ${perintah}`);
  }
  // Urutannya menentukan: grant hanya berlaku untuk tabel yang sudah ada.
  const iPush = COMPOSE.indexOf('db:push');
  const iMigrate = COMPOSE.indexOf('db:migrate');
  const iRole = COMPOSE.indexOf('db:setup-role');
  assert.ok(iPush < iMigrate && iMigrate < iRole, 'urutan penyiapan basis data salah');
  // Aplikasi harus MENUNGGU penyiapan selesai, bukan berlomba dengannya.
  assert.ok(/condition: service_completed_successfully/.test(COMPOSE),
    'app tak menunggu setup selesai');
});

test('image runtime memuat berkas yang dibutuhkan penyiapan', () => {
  /* Cacat aslinya: image hanya menyalin .next, node_modules, public, dan
     package.json. `npm run db:migrate` butuh src/, `db:setup-role` butuh
     scripts/, dan `db:push` butuh drizzle.config.ts — jadi ketiganya
     MUSTAHIL dijalankan dari dalam kontainer, dan tak ada jalan memperbaiki
     pemasangan yang rusak dari dalam. */
  for (const berkas of ['./migrations', './scripts', './src', './drizzle.config.ts', './tsconfig.json']) {
    assert.ok(DOCKERFILE.includes(`COPY --from=build /app/${berkas.replace('./', '')} ${berkas}`),
      `image runtime tak memuat ${berkas}`);
  }
});

test('setiap perintah npm yang disebut panduan memang ada', () => {
  /* Panduan menyebutnya dalam dua bentuk: `npm run db:push` di blok perintah,
     dan `db:push` berkutip miring di prosa. Keduanya diperiksa — bentuk yang
     kedua justru yang lebih sering ditulis, dan melewatkannya membuat uji ini
     lulus tanpa memeriksa apa pun. */
  const disebut = [
    ...[...DOC.matchAll(/npm run ([\w:-]+)/g)].map((m) => m[1]),
    ...[...DOC.matchAll(/`(db:[\w-]+)`/g)].map((m) => m[1]),
  ];
  assert.ok(disebut.length >= 3, `panduan hanya menyebut ${disebut.length} perintah`);
  const hilang = [...new Set(disebut)].filter((s) => !PKG.scripts[s]);
  assert.deepEqual(hilang, [], `perintah tak ada di package.json: ${hilang.join(', ')}`);
});

test('setiap variabel env yang WAJIB diubah memang dikenal .env.example', () => {
  /* Panduan yang menyuruh mengisi variabel yang tak dibaca kode akan membuat
     orang mengira pemasangannya sudah diamankan padahal belum. */
  for (const v of ['NEXTAUTH_SECRET', 'CREDENTIALS_ENCRYPTION_KEY', 'NEXTAUTH_URL', 'DEPLOYMENT_MODE']) {
    assert.ok(DOC.includes(v), `panduan tak menyebut ${v}`);
    assert.ok(new RegExp(`^${v}=`, 'm').test(ENVX), `${v} tak ada di .env.example`);
  }
  // APP_PW dipakai compose dan skrip peran; keduanya harus sepakat namanya.
  assert.ok(DOC.includes('APP_PW') && COMPOSE.includes('APP_PW'));
  assert.ok(readFileSync('scripts/create-app-role.mjs', 'utf8').includes('APP_PW'),
    'skrip peran tak membaca APP_PW');
});

test('angka disk di panduan sepadan dengan konstanta terukur', () => {
  /* Angka kapasitas yang diketik tangan akan berhenti benar begitu ukuran
     baris berubah — dan yang memakainya sedang memutuskan membeli disk. */
  assert.ok(DOC.includes(BYTES_PER_CHUNK.toLocaleString('id-ID')),
    `panduan tak memakai BYTES_PER_CHUNK (${BYTES_PER_CHUNK})`);
  assert.ok(DOC.includes(INDEX_BYTES_PER_CHUNK.toLocaleString('id-ID')),
    `panduan tak memakai INDEX_BYTES_PER_CHUNK (${INDEX_BYTES_PER_CHUNK})`);
  assert.ok(DOC.includes(`**${CHUNKS_PER_DOC} potongan**`),
    `panduan tak memakai CHUNKS_PER_DOC (${CHUNKS_PER_DOC})`);
  // Dan hasil hitungannya harus benar, bukan sekadar menyebut bahannya.
  const mb = Math.round((100_000 * (BYTES_PER_CHUNK + INDEX_BYTES_PER_CHUNK)) / 1e6);
  assert.ok(DOC.includes(`${mb} MB`), `hasil hitungan disk meleset; seharusnya ±${mb} MB`);
});

test('panduan menuliskan apa yang BELUM ada, bukan hanya yang ada', () => {
  /* Tim IT yang menemukan sendiri bahwa lisensi/HTTPS/cadangan belum ada
     akan menyimpulkan produknya belum siap. Yang menuliskannya di muka
     menyimpulkan hal yang berbeda tentang produk yang sama. */
  /* Dulu asersi ini menuntut kalimat "mekanisme lisensi belum ada", karena
     memang belum ada. Sejak kartu a-license-key, kuncinya SUDAH diperiksa —
     yang sengaja tidak ada adalah PENEGAKANNYA. Bedanya bukan main-main bagi
     yang membaca: "belum ada lisensi" terbaca sebagai produk yang belum siap
     dijual, sementara "tidak menegakkan" adalah keputusan rancangan yang
     harus dinyatakan justru supaya tim IT tak mengira layanannya akan mati
     sendiri lalu mematikannya lebih dulu untuk berjaga-jaga. */
  assert.ok(/Penegakan lisensi.{0,60}sengaja tidak ada/s.test(DOC),
    'panduan tak menyatakan bahwa lisensi TIDAK ditegakkan');
  assert.ok(/tidak ada satu pun fitur\s*\n?\s*yang dimatikan/i.test(DOC),
    'panduan tak menjamin bahwa lisensi kedaluwarsa tak mematikan apa pun');
  assert.ok(/HTTPS/.test(DOC), 'panduan tak menyebut HTTPS belum ditangani');
  /* Dulu asersi ini menuntut panduan menyebut KARTU `a-runbook`, karena saat
     itu cadangan memang belum tertulis di mana pun dan yang bisa dijanjikan
     hanyalah "sedang dikerjakan". Sejak RUNBOOK.md ada dan panduan ini punya
     prosedur pg_dump sendiri (§7a), menunjuk nomor kartu justru lebih buruk:
     ia mengirim pembacanya ke papan backlog alih-alih ke perintah yang harus
     ia ketik. Yang dijaga tetap sama — bahwa cadangan TIDAK didiamkan. */
  assert.ok(/RUNBOOK\.md/.test(DOC), 'panduan tak menunjuk prosedur pemulihan');
  assert.ok(/pg_dump/.test(DOC), 'panduan tak memberi cara mencadangkan on-premise');
  assert.ok(/CREDENTIALS_ENCRYPTION_KEY/.test(DOC),
    'panduan tak memperingatkan kunci enkripsi TIDAK ikut di dalam dump');
});

test('panduan memberi cara MEMBUKTIKAN isolasi menyala', () => {
  /* Kegagalan RLS tak menimbulkan gejala apa pun: aplikasi berjalan normal,
     jawaban benar, log sama. Satu-satunya cara tahu adalah memeriksanya. */
  assert.ok(/rolbypassrls/.test(DOC), 'panduan tak mengajarkan cara memeriksa RLS');
  assert.ok(/pg_policies/.test(DOC), 'panduan tak mengajarkan cara menghitung kebijakan');
  assert.ok(/printenv DATABASE_URL/.test(DOC), 'panduan tak memeriksa peran yang dipakai aplikasi');
});

test('dataroom menyebut lingkungannya STAGING, bukan produksi', () => {
  /* Dikoreksi pemilik produk 3 Agu 2026: nalar.sainskerta.net adalah STAGING
     Vercel, bukan pemasangan pelanggan. Dataroom yang menyebutnya "produksi"
     membuat pembacanya menyimpulkan lebih banyak daripada yang dibuktikan —
     terutama soal perilaku di bawah beban, yang justru pertanyaan pertama
     pembeli enterprise. Yang menanggung akibat salah paham itu bukan yang
     menulis halamannya. */
  const bukti = readFileSync('src/app/(app)/dataroom/BuktiFitur.tsx', 'utf8');
  assert.ok(/Ini lingkungan staging<\/b>, bukan pemasangan pelanggan/.test(bukti),
    'tab Bukti Fitur tak menyebut bahwa lingkungannya staging');
  assert.ok(/TIDAK dibuktikan: perilakunya di bawah beban/.test(bukti),
    'batas bukti tak dinyatakan — pembaca menyimpulkan lebih dari yang ada');

  const assess = readFileSync('src/app/(app)/dataroom/assessment.ts', 'utf8');
  assert.ok(!/screenshot produksi/.test(assess), 'assessment masih mengklaim screenshot produksi');
  assert.ok(/staging/i.test(assess), 'assessment tak menyebut lingkungan sebenarnya');
});
