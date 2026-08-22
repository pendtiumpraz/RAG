import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env.DATABASE_URL ??= 'postgres://x:y@localhost:5432/z';
process.env.CREDENTIALS_ENCRYPTION_KEY ??= '0'.repeat(64);

/**
 * RANTAI PEMICU MEMORY AGENT — tiga jalan masuk, bukan satu.
 *
 * Bug live (laporan Bos Galih, 2026-08-21): KB "SOP" terisi 8 potongan lewat
 * unggahan manual, chatbot "hr" ter-assign ke KB itu, kunci LLM ada, model
 * aktif — tapi memory chatbot-nya KOSONG. Sebabnya rantai otomatisnya cuma
 * dipasang di SATU tempat, `runSync()`, dan dijaga pula oleh
 * `if (ingested || updated || removed)`:
 *
 *   • rute unggah meng-ingest sendiri, tak pernah memicu agen;
 *   • menekan Sync sesudahnya tak menolong — berkasnya sudah masuk, jadi
 *     delta-nya `unchanged: 1` dan penjaga itu melewatkan rantainya;
 *   • meng-assign KB ke chatbot juga tak memicu apa pun, sehingga chatbot
 *     baru yang mewarisi KB berisi ratusan dokumen lama tetap kosong.
 *
 * Ketiganya tak bisa diuji dengan mengeksekusi rute (butuh sesi + DB nyata),
 * jadi — seperti sync-upload-kind.test.ts — yang dikunci adalah BENTUK
 * sumbernya: pemicunya harus ADA di ketiga jalur.
 */

const UPLOAD = readFileSync('src/app/api/knowledge-bases/[id]/upload/route.ts', 'utf8');
const KB = readFileSync('src/modules/knowledge/knowledge-base.service.ts', 'utf8');
const SYNC = readFileSync('src/modules/knowledge/sync.service.ts', 'utf8');
const RUN = readFileSync('src/app/api/memory/run/route.ts', 'utf8');

test('rute unggah memicu Memory Agent untuk chatbot pemakai KB', () => {
  assert.match(UPLOAD, /assignedChatbots\(/,
    'rute unggah tak mencari chatbot pemakai KB — memory-nya tak akan pernah terisi');
  assert.match(UPLOAD, /memoryAgent\.enqueueRun\(/,
    'rute unggah tak memicu Memory Agent sama sekali');
});

test('assignment KB → chatbot memicu Memory Agent untuk yang BARU', () => {
  const mulai = KB.indexOf('async setAssignments(');
  assert.ok(mulai >= 0, 'setAssignments() tak ditemukan');
  const blok = KB.slice(mulai, KB.indexOf('assignedChatbots(', mulai));
  assert.match(blok, /memoryAgent\.enqueueRun\(/,
    'assign KB ke chatbot tak memicu Memory Agent — chatbot baru mewarisi KB tapi memory-nya kosong');
});

test('rantai lama di runSync tetap ada (jangan hilang saat menambah yang baru)', () => {
  assert.match(SYNC, /memoryAgent\.enqueueRun\(/,
    'rantai memory di runSync() hilang — sync Drive/SharePoint berhenti memetakan memory');
});

test('run memory punya anggaran waktu yang cukup untuk KB sungguhan', () => {
  const m = RUN.match(/export const maxDuration = (\d+)/);
  assert.ok(m, 'maxDuration rute /api/memory/run tak dinyatakan');
  assert.ok(Number(m![1]) >= 300,
    `maxDuration ${m![1]}s terlalu pendek: catatan baru disimpan di L4 setelah SEMUA dokumen `
    + 'selesai di-distill, jadi lambda yang mati di tengah menyisakan NOL catatan');
});
