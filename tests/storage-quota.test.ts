import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env.DATABASE_URL ??= 'postgres://x:y@localhost:5432/z';
process.env.CREDENTIALS_ENCRYPTION_KEY ??= '0'.repeat(64);

const load = () => import('../src/modules/core/limits');
const KS = readFileSync('src/modules/knowledge/knowledge.service.ts', 'utf8');
const KBS = readFileSync('src/modules/knowledge/knowledge-base.service.ts', 'utf8');
const SYNC = readFileSync('src/modules/knowledge/sync.service.ts', 'utf8');

test('setiap plan punya kuota penyimpanan', async () => {
  const { PLAN_LIMITS } = await load();
  for (const [nama, l] of Object.entries(PLAN_LIMITS)) {
    assert.ok(typeof l.maxChunks === 'number', `plan ${nama} tak punya maxChunks`);
    assert.ok(typeof l.maxKnowledgeBases === 'number', `plan ${nama} tak punya maxKnowledgeBases`);
    assert.ok(l.maxChunks > 0, `plan ${nama} berkuota nol`);
  }
});

test('kuota naik seiring paket, dan onprem tanpa batas', async () => {
  const { PLAN_LIMITS } = await load();
  assert.ok(PLAN_LIMITS.free.maxChunks < PLAN_LIMITS.pro.maxChunks);
  assert.ok(PLAN_LIMITS.pro.maxChunks < PLAN_LIMITS.enterprise.maxChunks);
  // On-premise berjalan di server MILIK PELANGGAN. Memaksakan kuota buatan di
  // atas perangkat yang sudah mereka bayar hanya terasa mengada-ada.
  assert.equal(PLAN_LIMITS.onprem.maxChunks, Infinity);
  assert.equal(PLAN_LIMITS.onprem.maxKnowledgeBases, Infinity);
});

test('enterprise SaaS tetap berhingga', async () => {
  const { PLAN_LIMITS } = await load();
  // Pada SaaS, penyimpanan tanpa batas berarti platform menanggung biaya yang
  // tak bisa diperkirakan. Angkanya boleh dinaikkan lewat negosiasi; yang tak
  // boleh adalah tak ada angkanya sama sekali.
  assert.notEqual(PLAN_LIMITS.enterprise.maxChunks, Infinity,
    'enterprise tanpa batas — biaya penyimpanan jadi tak terduga');
});

test('kuota SaaS tetap kecil — sasarannya chatbot landing page, bukan arsip', async () => {
  const { PLAN_LIMITS, BYTES_PER_CHUNK, INDEX_BYTES_PER_CHUNK } = await load();
  const perTenant = (p: string) =>
    PLAN_LIMITS[p].maxChunks * (BYTES_PER_CHUNK + INDEX_BYTES_PER_CHUNK);

  // Sasaran produk SaaS ini adalah chatbot yang ditanam di landing page:
  // profil perusahaan, katalog, daftar harga, FAQ. Itu puluhan dokumen, bukan
  // arsip. Kuota yang jauh melebihi kebutuhan bukan kemurahan hati — ia
  // mengundang pemakaian yang tak pernah jadi pendapatan, dengan biaya yang
  // ditanggung platform. Yang butuh lebih dari ini adalah pelanggan
  // ON-PREMISE, dan di sana batasnya server mereka sendiri.
  assert.ok(perTenant('free') <= 25e6, `Free memakan ${Math.round(perTenant('free') / 1e6)} MB — terlalu besar untuk paket gratis`);
  assert.ok(perTenant('pro') <= 300e6, `Pro memakan ${Math.round(perTenant('pro') / 1e6)} MB — terlalu besar`);
  assert.ok(perTenant('enterprise') <= 3e9, `Enterprise memakan ${Math.round(perTenant('enterprise') / 1e9)} GB — terlalu besar untuk SaaS`);

  // Dan tetap harus muat banyak penyewa di satu basis data.
  const atapPotongan = (64 * 1e9) / INDEX_BYTES_PER_CHUNK;
  assert.ok(atapPotongan / PLAN_LIMITS.pro.maxChunks >= 1_000,
    'kurang dari 1.000 penyewa Pro yang muat di Neon terbesar — kuotanya terlalu longgar');
});

test('HANYA on-premise yang tanpa batas', async () => {
  const { PLAN_LIMITS } = await load();
  for (const p of ['free', 'pro', 'enterprise']) {
    assert.notEqual(PLAN_LIMITS[p].maxChunks, Infinity, `${p} tanpa batas penyimpanan`);
    assert.notEqual(PLAN_LIMITS[p].maxKnowledgeBases, Infinity, `${p} tanpa batas knowledge base`);
  }
  assert.equal(PLAN_LIMITS.onprem.maxChunks, Infinity);
  assert.equal(PLAN_LIMITS.onprem.maxKnowledgeBases, Infinity);
});

test('kuota ditegakkan di ingest(), bukan hanya di rute', () => {
  // ingest() adalah satu-satunya jalur yang dilewati SEMUA cara dokumen masuk:
  // sync, unggahan manual, konektor URL, dan API publik. Kuota yang hanya
  // dijaga satu rute adalah kuota yang punya pintu belakang.
  assert.ok(/await assertChunkQuota\(tenantId, chunks\.length\)/.test(KS),
    'ingest tak memeriksa kuota');
  assert.ok(/knowledgeService\.storageUsage/.test(KBS),
    'pembuatan knowledge base tak memeriksa kuota');
});

test('kuota diperiksa SETELAH dedup dan SEBELUM embed', () => {
  const iDedupe = KS.indexOf('const hash = fingerprintable(input.text)');
  const iQuota = KS.indexOf('await assertChunkQuota');
  const iEmbed = KS.indexOf('const vectors = await embed(');
  // Berkas kembar tak boleh ikut menghabiskan jatah — ia tak menambah satu
  // baris pun. Dan memeriksa setelah embed berarti membayar bagian termahal
  // lalu membuang hasilnya.
  assert.ok(iDedupe > 0 && iQuota > iDedupe, 'kuota diperiksa sebelum dedup — kembar ikut menghabiskan jatah');
  assert.ok(iEmbed > iQuota, 'kuota diperiksa setelah embed — biaya termahal terlanjur dibayar');
});

test('operator platform tak pernah dibatasi', () => {
  // Sejalan dengan seluruh kuota lain: workspace operator bukan pelanggan.
  assert.ok(/if \(isPlatform\) return;/.test(KS), 'operator platform ikut terkena kuota');
});

test('kuota habis MENGHENTIKAN sync, bukan dihitung sebagai gagal', () => {
  // Berkas berikutnya pasti gagal juga. Meneruskan loop hanya membuang
  // unduhan dan menghasilkan laporan berisi ratusan "gagal" yang
  // menyembunyikan sebab tunggalnya.
  assert.ok(/if \(err instanceof QuotaError\)/.test(SYNC), 'sync tak mengenali QuotaError');
  assert.ok(/quotaStop = err\.message;[\s\S]{0,200}break;/.test(SYNC),
    'sync tak berhenti saat kuota habis');
  assert.ok(/quotaExceeded: quotaStop/.test(SYNC), 'kuota habis tak dilaporkan ke pengguna');
});

test('QuotaError terpisah dari ValidationError', () => {
  // Rute perlu membedakan "jatahmu habis" (402, perlu upgrade) dari
  // "permintaanmu salah" (422). Menyamakannya membuat pemilik data mengira
  // berkasnya rusak.
  assert.ok(/export class QuotaError extends Error/.test(KS));
  const route = readFileSync('src/app/api/knowledge-bases/route.ts', 'utf8');
  assert.ok(/QuotaError.*status: 402/s.test(route), 'rute tak memetakan kuota ke 402');
});

test('terjemahan kuota ke satuan manusia konsisten', async () => {
  const { PLAN_LIMITS, CHUNKS_PER_DOC, BYTES_PER_CHUNK } = await load();
  // Angka yang dipakai UI & kalkulator harus turun dari konstanta yang sama,
  // bukan diketik ulang — kalau tidak, dua layar menyebut angka berbeda untuk
  // paket yang sama.
  const pro = PLAN_LIMITS.pro.maxChunks;
  // Terjemahannya dihitung, bukan diketik: kalau kuotanya diubah, angka di UI
  // dan kalkulator ikut sendiri dan tak ada dua layar yang berselisih.
  assert.equal(Math.round(pro / CHUNKS_PER_DOC), pro / 10);
  assert.ok(pro * BYTES_PER_CHUNK > 10e6 && pro * BYTES_PER_CHUNK < 300e6,
    'perkiraan ukuran basis data Pro di luar rentang yang masuk akal untuk chatbot landing page');
});

/* ── slide tak boleh tertinggal dari kode ──────────────────────────── */

test('slide batas langganan MEMBACA kuota, bukan menuliskannya mati', async () => {
  const { readFileSync } = await import('node:fs');
  const s = readFileSync('src/app/(app)/dataroom/scenes-limits.tsx', 'utf8');
  // Ini akar masalah yang sungguh terjadi: baris knowledge base & dokumen
  // ditulis mati sebagai "tanpa batas", lalu kuotanya benar-benar dipasang —
  // dan slide itu berbohong tanpa ada yang menyadarinya. Slide yang mengutip
  // konstanta tak bisa tertinggal dari kodenya.
  assert.ok(!/f: \(\) => 'tanpa batas'/.test(s),
    'ada baris tabel yang menuliskan batas secara mati, bukan membaca PLAN_LIMITS');
  for (const k of ['maxKnowledgeBases', 'maxChunks', 'maxChatbots', 'maxMembers', 'messagesPerMonth']) {
    assert.ok(s.includes(`PLAN_LIMITS[p].${k}`), `slide tak membaca ${k}`);
  }
});

test('tak ada slide yang masih menyebut kuota penyimpanan belum ada', async () => {
  const { readFileSync } = await import('node:fs');
  for (const f of [
    'src/app/(app)/dataroom/scenes-limits.tsx',
    'src/app/(app)/dataroom/scene-text.ts',
    'src/app/(app)/dataroom/decks.ts',
  ]) {
    const s = readFileSync(f, 'utf8');
    assert.ok(!/BELUM punya kuota|belum dibatasi|Yang BELUM dibatasi/i.test(s),
      `${f} masih menyatakan kuota penyimpanan belum ada — padahal sudah ditegakkan`);
  }
});
