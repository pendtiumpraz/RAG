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
  // Kelas kanonisnya kini di modul usage (satu kelas dipakai lintas modul agar
  // `instanceof` tak meleset); knowledge me-re-export-nya untuk pemanggil lama.
  const usage = readFileSync('src/modules/usage/usage.service.ts', 'utf8');
  assert.ok(/export class QuotaError extends Error/.test(usage), 'QuotaError bukan kelas tersendiri');
  assert.ok(/export \{ QuotaError \}/.test(KS), 'knowledge tak lagi mengekspor QuotaError');
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
  // Batas atasnya saja yang dijaga: kuota kecil adalah keputusan bisnis yang
  // sah (Free sengaja dibuat tanggung), sedangkan kuota BESAR pada SaaS
  // adalah biaya yang tak bisa diperkirakan.
  assert.ok(pro * BYTES_PER_CHUNK < 300e6,
    'kuota Pro terlalu besar untuk chatbot landing page');
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
  for (const k of ['maxKnowledgeBases', 'maxChunks', 'maxChatbots', 'maxMembers', 'messagesPerMonth', 'storageBytes']) {
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

/* ── blob/BYOB utk unggahan manual (kartu a-upload-blob-storage) ──────── */

const ROUTE = readFileSync('src/app/api/knowledge-bases/[id]/upload/route.ts', 'utf8');
const KSVC = readFileSync('src/modules/knowledge/knowledge.service.ts', 'utf8');
const STORE = readFileSync('src/modules/storage/storage.service.ts', 'utf8');
const S3 = readFileSync('src/modules/connections/s3.ts', 'utf8');

test('setiap plan punya kuota blob storageBytes, dan onprem tanpa batas', async () => {
  const { PLAN_LIMITS } = await load();
  for (const [nama, l] of Object.entries(PLAN_LIMITS)) {
    assert.ok(typeof l.storageBytes === 'number', `plan ${nama} tak punya storageBytes`);
  }
  // Sesuai kuota lain: naik seiring paket, "onprem" tanpa batas, SaaS berhingga.
  assert.ok(PLAN_LIMITS.free.storageBytes < PLAN_LIMITS.pro.storageBytes);
  assert.ok(PLAN_LIMITS.pro.storageBytes < PLAN_LIMITS.enterprise.storageBytes);
  assert.equal(PLAN_LIMITS.onprem.storageBytes, Infinity);
  for (const p of ['free', 'pro', 'enterprise']) {
    assert.notEqual(PLAN_LIMITS[p].storageBytes, Infinity, `${p} blob tanpa batas`);
  }
});

test('HANYA Drive/SharePoint yang tidak pernah menulis ke blob — tak dihitung kuota', async () => {
  // Bos Galih: "sing nyimpen nang blob cuma sing upload aja." Drive/SharePoint
  // (serta konektor lain) TIDAK boleh memanggil rutin simpan blob/BYOB.
  assert.ok(!/simpanBerkasUpload/.test(SYNC),
    'sync service memanggil simpanBerkasUpload — Drive/SharePoint malah menulis ke blob');
  // Kuota blob hanya ditegakkan di rute unggahan MANUAL, bukan di ingest()
  // (yang dilewati SEMUA jalur termasuk sync). Kalau ada di ingest(), sync
  // ikut dibatasi / file Drive ikut dihitung — yang dilarang.
  assert.ok(!/assertStorageBlobQuota\([^)]*chunks/.test(KSVC),
    'kuota blob ditegakkan di ingest() — malah membatasi Drive/SharePoint');
  assert.ok(/assertStorageBlobQuota/.test(KSVC),
    'tidak ada penegakan kuota blob sama sekali');
});

test('rute unggahan MANUAL menyimpan orisinal ke blob/BYOB dan memeriksa kuota', () => {
  assert.ok(/simpanBerkasUpload/.test(ROUTE), 'rute tak menyimpan berkas orisinal ke blob');
  assert.ok(/assertStorageBlobQuota/.test(ROUTE), 'rute tak memeriksa kuota blob');
  assert.ok(/uploadedFileService\.simpan/.test(ROUTE), 'rute tak mencatat jejak berkas orisinal');
  // Quota habis → 402 (bukan 500 atau sekadar "skip" berkas).
  assert.ok(/QuotaError/.test(ROUTE));
  assert.ok(/status: 402/.test(ROUTE), 'kuota blob tak dipetakan ke 402');
});

test('pilihTargetTulis: BYOB user dulu, lalu blob platform (bawaan)', () => {
  assert.ok(/decryptForAccess/.test(STORE), 'pemilihan koneksi eksplisit hilang');
  assert.ok(/isDefault, true/.test(STORE), 'BYOB default tak dipilih');
  assert.ok(/penyedia\('platform'\)/.test(STORE), 'jatuh ke blob platform tidak ada');
});

test('adapter menyediakan simpan (put) — blob + S3 SigV4 PUT', () => {
  const AD = readFileSync('src/modules/storage/adapter.ts', 'utf8');
  const PLAT = readFileSync('src/modules/storage/adapters/platform.ts', 'utf8');
  const SF = readFileSync('src/modules/storage/adapters/s3-family.ts', 'utf8');
  const GCS = readFileSync('src/modules/storage/adapters/gcs.ts', 'utf8');
  const AZ = readFileSync('src/modules/storage/adapters/azure.ts', 'utf8');
  assert.ok(/simpan\?\(kred: KredensialStorage/.test(AD), 'kontrak adapter tak ada metode simpan');
  assert.ok(/@vercel\/blob/.test(PLAT), 'blob platform tak memakai @vercel/blob');
  assert.ok(/tandatanganiPut/.test(S3), 'SigV4 PUT tak ditambahkan');
  assert.ok(/simpanObjek/.test(SF), 'adapter S3 tak memakai simpanObjek');
  assert.ok(/async simpan\(kred, c\)/.test(GCS) && /tokenTulis/.test(GCS), 'adapter GCS tak punya simpan');
  assert.ok(/async simpan\(kred, c\)/.test(AZ), 'adapter Azure tak punya simpan');
});

test('pelacakan pemakaian memakai tabel uploaded_files (soft delete)', () => {
  const UFS = readFileSync('src/modules/knowledge/uploaded-file.service.ts', 'utf8');
  const MIG = readFileSync('migrations/0052_uploaded_files.sql', 'utf8');
  assert.ok(/create table if not exists uploaded_files/.test(MIG), 'migrasi uploaded_files hilang');
  assert.ok(/sum\(size_bytes\)/.test(UFS), 'usageBytes tak menjumlahkan ukuran');
  assert.ok(/isNull\(uploadedFiles\.deletedAt\)/.test(UFS), 'usageBytes tak memfilter soft-delete');
  assert.ok(/deletedAt: new Date/.test(UFS), 'penggantian nama sama tak soft-delete baris lama');
});

