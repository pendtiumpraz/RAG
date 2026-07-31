import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * DISTILL YANG GAGAL DALAM DIAM.
 *
 * Tempat terakhir di jalur Memory yang bisa gagal tanpa meninggalkan jejak.
 * Bentuknya sama persis dengan bug "kategorikan semua" yang dilaporkan
 * pengguna: JSON.parse dibungkus `catch` yang mengisi nilai cadangan, lalu
 * dokumen tetap masuk graf tanpa kategori — dan tak ada satu angka pun yang
 * membedakan "model sudah menilai dan tak yakin" dari "model tak pernah
 * menjawab".
 *
 * Yang membuatnya mahal bukan kegagalannya, melainkan bahwa run yang seluruh
 * distill-nya gagal berakhir dengan status "done" yang sama persis dengan run
 * yang mulus.
 */

const AGENT = readFileSync('src/modules/memory/memory-agent.service.ts', 'utf8');
const JOBS = readFileSync('src/modules/core/jobs.ts', 'utf8');
const UI = readFileSync('src/app/(app)/memory/page.tsx', 'utf8');

test('kegagalan distill DIHITUNG, tak sekadar diberi nilai cadangan', () => {
  assert.ok(/let distillKosong = 0;/.test(AGENT), 'balasan kosong tak dihitung');
  assert.ok(/let distillCacat = 0;/.test(AGENT), 'balasan cacat tak dihitung');
  assert.ok(/if \(!distilled\.trim\(\)\) distillKosong\+\+;/.test(AGENT),
    'balasan kosong tak dikenali sebelum parsing');
  assert.ok(/if \(distilled\.trim\(\)\) distillCacat\+\+;/.test(AGENT),
    'kegagalan parsing tak dihitung di dalam catch');
});

test('KOSONG dibedakan dari CACAT — langkah lanjutannya berbeda', () => {
  /* Balasan kosong hampir selalu berarti anggaran token habis sebelum model
     sempat menulis: naikkan anggaran atau ganti model. Balasan cacat berarti
     model menulis sesuatu yang bukan JSON: perbaiki instruksinya. Satu angka
     gabungan membuat keduanya tak bisa ditindaklanjuti. */
  assert.notEqual(AGENT.indexOf('distillKosong'), AGENT.indexOf('distillCacat'));
  // Dan pembedaan itu sampai ke kalimat yang dibaca pengguna.
  assert.ok(/anggaran token mungkin kurang/.test(UI), 'UI tak menjelaskan sebab balasan kosong');
  assert.ok(/balasan model bukan JSON/.test(UI), 'UI tak menjelaskan sebab balasan cacat');
});

test('angkanya sampai ke audit, bukan berhenti di variabel lokal', () => {
  /* Tanpa ini, satu-satunya jejak run yang seluruh distill-nya gagal adalah
     "notes: N" yang terlihat persis sama dengan run yang berhasil — dan
     penelusuran keluhan berhenti di situ. */
  const blok = AGENT.slice(AGENT.indexOf("'memory.run', chatbotId"), AGENT.indexOf("'memory.run', chatbotId") + 400);
  assert.ok(/distillKosong, distillCacat,/.test(blok), 'audit memory.run tak membawa angka kegagalan');
});

test('run mengembalikan RINGKASAN, bukan sekadar selesai', () => {
  /* "done" saja tak cukup: run yang gagal pada tiap dokumen berakhir "done"
     persis seperti run yang mulus. */
  assert.ok(/Promise<RingkasRun>/.test(AGENT), 'pipeline tak mengembalikan ringkasan');
  assert.ok(/return runMemoryPipeline\(tenantId, chatbotId\);/.test(AGENT),
    'handler job membuang nilai kembalian pipeline');
  assert.ok(/export interface RingkasRun/.test(AGENT), 'bentuk ringkasan tak diekspor');
});

test('runner job menyimpan hasil handler', () => {
  /* Handler yang mengembalikan Promise<void> membuat kegagalan SEBAGIAN tak
     punya tempat untuk muncul sama sekali. */
  assert.ok(/type Handler = \(payload: unknown\) => Promise<unknown>;/.test(JOBS),
    'handler masih Promise<void> — hasil tak bisa dikembalikan');
  assert.ok(/hasil\?: unknown;/.test(JOBS), 'JobStatus tak punya tempat untuk hasil');
  assert.ok(/if \(hasil !== undefined\) status\.hasil = hasil;/.test(JOBS),
    'hasil handler tak disimpan ke status');
  // Handler yang tak mengembalikan apa pun tetap sah — perubahan ini aditif.
  assert.ok(/const hasil = await handler\(job\.payload\);/.test(JOBS));
});

test('UI MENUNGGU hasil, tak menyuruh pengguna menebak', () => {
  /* "Refresh sebentar lagi" benar hanya bila hasilnya pasti baik. Pada run
     yang gagal, pengguna menyegarkan halaman lalu menemukan dokumen tetap tak
     berkategori — tanpa satu pun keterangan kenapa. */
  assert.ok(/async function tungguRun/.test(UI), 'UI tak menunggu hasil run');
  assert.ok(!/Refresh sebentar lagi\.'\)/.test(UI), 'UI masih menyuruh menebak tanpa syarat');
  // Batas tunggu ada, dan lewatnya batas TIDAK dilaporkan sebagai kegagalan.
  assert.ok(/for \(let i = 0; i < 30; i\+\+\)/.test(UI), 'penungguan tanpa batas');
  assert.ok(/lebih lama dari biasa/.test(UI),
    'lewat batas tunggu dilaporkan sebagai gagal, padahal runnya mungkin masih jalan');
});

test('kegagalan distill TIDAK menjatuhkan dokumennya dari graf', () => {
  /* Dokumen yang hilang dari graf karena satu jawaban LLM cacat jauh lebih
     buruk daripada dokumen yang masuk tanpa kategori — yang kedua bisa
     dibereskan belakangan lewat "kategorikan semua". */
  assert.ok(/abstract = distilled\.slice\(0, 300\);/.test(AGENT),
    'nilai cadangan dihapus — dokumen bisa hilang saat distill gagal');
  const blokCatch = AGENT.slice(AGENT.indexOf('} catch {', AGENT.indexOf('const parsed = JSON.parse(distilled')));
  assert.ok(!/throw|continue/.test(blokCatch.slice(0, 200)),
    'kegagalan distill menghentikan pemrosesan dokumen itu');
});
