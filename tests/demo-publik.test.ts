import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  PESAN_DEMO_HABIS, periodeDemo, persenTerpakai, putusanDemo,
} from '../src/modules/core/demo';

/**
 * DEMO PUBLIK DI LANDING.
 *
 * Tiap jawaban demo dibayar dengan token yang tak pernah jadi pendapatan, dan
 * pengunjungnya anonim — tak ada yang bisa ditagih, diperingatkan, atau
 * dibatasi selain oleh angkanya. Karena itu yang dijaga di sini bukan "demo
 * bisa menjawab" (jalur bahagia yang kerusakannya langsung terlihat)
 * melainkan setiap cara remnya berhenti mengerem tanpa ada yang tahu.
 */

/* ── rem ─────────────────────────────────────────────────────────────── */

test('NOL berarti MATI TOTAL, bukan tanpa batas', () => {
  /* "Matikan demo" adalah cara paling wajar orang menuliskannya, dan
     kebalikannya — nol berarti tanpa batas — akan membuka keran lebar-lebar
     tepat saat seseorang bermaksud menutupnya. */
  const p = putusanDemo({ chatbotId: 'bot', terpakai: 0, batas: 0 });
  assert.equal(p.boleh, false);
  assert.equal(p.keadaan, 'kuota-habis');
});

test('demo mati saat kuota tercapai, bukan saat terlampaui', () => {
  assert.equal(putusanDemo({ chatbotId: 'b', terpakai: 999, batas: 1000 }).boleh, true);
  assert.equal(putusanDemo({ chatbotId: 'b', terpakai: 1000, batas: 1000 }).boleh, false);
  assert.equal(putusanDemo({ chatbotId: 'b', terpakai: 1200, batas: 1000 }).boleh, false);
});

test('tanpa chatbot demo = mati, dan itu keadaan AWALNYA', () => {
  /* Landing tak boleh menampilkan demo sebelum ada manusia yang menunjuk
     chatbotnya: menebaknya berarti memajang isi knowledge base pelanggan
     pertama yang kebetulan ditemukan query. */
  const p = putusanDemo({ chatbotId: null, terpakai: 0, batas: 1000 });
  assert.equal(p.keadaan, 'mati');
  assert.equal(p.boleh, false);
});

test('angka ngawur dijepit, tidak meledak', () => {
  assert.equal(putusanDemo({ chatbotId: 'b', terpakai: -5, batas: 10 }).terpakai, 0);
  assert.equal(putusanDemo({ chatbotId: 'b', terpakai: 1.9, batas: 10.9 }).batas, 10);
  assert.equal(putusanDemo({ chatbotId: 'b', terpakai: 0, batas: -1 }).boleh, false);
});

test('persentase tak pernah NaN, bahkan saat batasnya nol', () => {
  /* NaN di layar terbaca sebagai kerusakan, bukan sebagai keadaan yang
     disengaja — dan yang melihatnya akan mencari bug yang tak ada. */
  assert.equal(persenTerpakai(0, 0), 100);
  assert.equal(persenTerpakai(500, 1000), 50);
  assert.equal(persenTerpakai(2000, 1000), 100);
  assert.ok(Number.isFinite(persenTerpakai(1, 0)));
});

test('periode ikut bulan UTC, berpadding', () => {
  assert.equal(periodeDemo(new Date(Date.UTC(2026, 0, 31))), '2026-01');
  assert.equal(periodeDemo(new Date(Date.UTC(2026, 11, 1))), '2026-12');
});

/* ── pesannya ────────────────────────────────────────────────────────── */

test('pesan habis TIDAK menyebut angka kuotanya', () => {
  /* Pengunjung tak bisa berbuat apa-apa dengan angka itu, sementara
     menyebutkannya memberi tahu penyerang persis berapa permintaan yang
     diperlukan untuk mematikan demo bulan berikutnya. */
  assert.ok(!/\d/.test(PESAN_DEMO_HABIS), `pesan memuat angka: ${PESAN_DEMO_HABIS}`);
});

test('pesan habis menawarkan JALAN KELUAR, bukan cuma menutup pintu', () => {
  /* Orang yang tertarik justru datang di saat yang salah, dan pintu buntu
     mengubah minat jadi kepergian. */
  assert.match(PESAN_DEMO_HABIS, /akun gratis/i);
  assert.ok(PESAN_DEMO_HABIS.length > 80, 'terlalu singkat untuk menjelaskan apa pun');
});

/* ── penegakan di jalur chat ─────────────────────────────────────────── */

const ROUTE = readFileSync('src/app/api/chat/[chatbotId]/route.ts', 'utf8');
const SVC = readFileSync('src/modules/core/demo.service.ts', 'utf8');

test('demo memakai remnya SENDIRI, menggantikan kuota tenant', () => {
  /* Chatbot demo dititipkan di sebuah tenant, dan kuota tenant itu bukan
     ukuran yang tepat: kalau ia paket gratis, demonya mati di pesan
     kesepuluh; kalau ia enterprise, remnya 50x lebih longgar dari yang
     dimaksudkan. */
  assert.ok(/const demo = await demoService\.putusan\(bot\.id, bot\.tenant_id\)/.test(ROUTE));
  assert.ok(/if \(!demo && usage\.messages >= usage\.limits\.messagesPerMonth\)/.test(ROUTE),
    'kuota tenant masih ikut membatasi demo — dua rem yang saling menimpa');
});

test('penolakan demo dijawab 429 dengan kode tersendiri, tanpa Retry-After', () => {
  /* Kuota bulanan tak pulih dalam hitungan detik; header yang menjanjikan
     sebaliknya membuat klien mencoba ulang sepanjang sisa bulan. */
  const blok = ROUTE.slice(ROUTE.indexOf('if (demo && !demo.boleh)'), ROUTE.indexOf("if (!demo && usage.messages"));
  assert.ok(/kode: 'demo'/.test(blok), 'widget tak bisa membedakan demo dari kuota pelanggan');
  assert.ok(/status: 429/.test(blok));
  /* Dicari bentuk HEADER-nya (berkutip), bukan katanya: komentar di blok itu
     memang menyebut "Retry-After sengaja tak dikirim", dan uji yang mencari
     katanya akan gagal justru karena kode itu MENJELASKAN dirinya. Uji yang
     dikalahkan komentarnya sendiri melatih orang menghapus komentar. */
  assert.ok(!/'Retry-After'/.test(blok), 'header Retry-After dikirim untuk kuota bulanan');
});

test('rem diperiksa SEBELUM model dipanggil', () => {
  /* Kalau sesudah, tiap penolakan tetap membakar token — dan yang paling
     banyak menghasilkan penolakan justru bulan-bulan saat demonya ramai. */
  const iDemo = ROUTE.indexOf('demoService.putusan');
  const iModel = ROUTE.indexOf('chatTurn(');
  assert.ok(iDemo > 0 && iDemo < iModel, 'rem diperiksa setelah model dipanggil');
});

/* ── penghitungnya ───────────────────────────────────────────────────── */

test('pemakaian dihitung dari messages, BUKAN penghitung terpisah', () => {
  /* Penghitung bisa menyimpang — dari percakapan yang dihapus, dari migrasi,
     dari galat di tengah giliran — dan penghitung yang menyimpang pada REM
     berarti remnya berhenti mengerem tanpa ada yang tahu. */
  assert.ok(/count\(\$\{messages\.id\}\)::int/.test(SVC) || /count\(/.test(SVC));
  assert.ok(/from\(messages\)/.test(SVC), 'tidak menghitung dari tabel messages');
  assert.ok(!/demo_usage|demoCounter/.test(SVC), 'memakai penghitung terpisah yang bisa menyimpang');
});

test('hanya pesan PENGUNJUNG yang dihitung', () => {
  /* Satu giliran menghasilkan dua baris (pertanyaan + jawaban); menghitung
     keduanya membuat batas 1.000 diam-diam jadi 500. */
  assert.ok(/eq\(messages\.role, 'user'\)/.test(SVC), 'jawaban ikut dihitung — batasnya jadi separuh');
});

test('bawaan 1.000 diulang di kode, tidak diandalkan dari kolom', () => {
  /* Baris platform_settings yang lahir sebelum migrasi 0044 punya NULL, dan
     NULL yang diperlakukan "tanpa batas" adalah kebalikan persis dari rem
     yang diminta. */
  assert.ok(/rows\[0\]\?\.batas \?\? 1000/.test(SVC), 'NULL bisa jatuh jadi tanpa batas');
});

test('cache pemakaian pendek dan dilupakan saat pengaturan berubah', () => {
  /* Cache panjang membuat rem terlambat; cache yang tak dilupakan membuat
     angka lama menyesatkan tepat sesudah remnya diubah — dan itu justru saat
     orang paling memperhatikannya. */
  assert.ok(/UMUR_CACHE_MS = 30_000/.test(SVC), 'umur cache berubah — periksa apakah rem masih berarti');
  assert.ok(/lupakanCache/.test(SVC));
  const admin = readFileSync('src/app/api/admin/demo/route.ts', 'utf8');
  assert.ok(/demoService\.lupakanCache\(\)/.test(admin), 'mengubah rem tak melupakan cache');
});

/* ── yang dilihat pengunjung ─────────────────────────────────────────── */

test('endpoint publik TIDAK membocorkan sisa kuota', () => {
  /* Sisa kuota memberi tahu penyerang persis berapa permintaan lagi yang
     diperlukan untuk mematikan demo. */
  const pub = readFileSync('src/app/api/demo/route.ts', 'utf8');
  const balasan = pub.match(/NextResponse\.json\(\s*[\s\S]{0,220}?\)/g) ?? [];
  const teks = balasan.join('\n');
  assert.ok(!/terpakai|batas|tenantId|keadaan/.test(teks), `balasan publik membocorkan: ${teks}`);
  assert.ok(/publicKey/.test(teks), 'kunci publik tak dikirim — landing tak bisa memasang widget');
});

test('demo yang mati menjawab aktif:false, bukan kunci publiknya', () => {
  /* Mengirim kunci sambil bilang "tak boleh" akan membuat landing memasang
     widget yang setiap pertanyaannya ditolak — dan itu terbaca sebagai
     produk rusak, bukan sebagai demo yang sedang istirahat. */
  const pub = readFileSync('src/app/api/demo/route.ts', 'utf8');
  assert.ok(/status\.boleh\s*\n?\s*\?\s*\{ aktif: true, publicKey/.test(pub)
    || /\? \{ aktif: true, publicKey: bot\.publicKey \}/.test(pub),
    'kunci publik dikirim walau demo sedang mati');
});
