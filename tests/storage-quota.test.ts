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

test('kuota Pro masuk akal terhadap atap Neon', async () => {
  const { PLAN_LIMITS, INDEX_BYTES_PER_CHUNK } = await load();
  // Neon berhenti di 16 CU / 64 GB RAM. Kalau satu penyewa Pro saja sudah
  // memakan sebagian besar atapnya, angkanya salah — bukan kuota, melainkan
  // janji yang tak bisa ditepati.
  const atapPotongan = (64 * 1e9) / INDEX_BYTES_PER_CHUNK;
  const muat = atapPotongan / PLAN_LIMITS.pro.maxChunks;
  assert.ok(muat >= 100,
    `hanya ${Math.round(muat)} penyewa Pro yang muat di Neon terbesar — kuotanya terlalu longgar`);
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
  assert.equal(Math.round(pro / CHUNKS_PER_DOC), 20_000);
  assert.ok(pro * BYTES_PER_CHUNK > 1e9 && pro * BYTES_PER_CHUNK < 3e9,
    'perkiraan ukuran basis data Pro di luar rentang yang masuk akal');
});
