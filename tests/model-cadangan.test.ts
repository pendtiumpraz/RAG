import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

process.env.DATABASE_URL ??= 'postgres://x:y@localhost:5432/z';
process.env.CREDENTIALS_ENCRYPTION_KEY ??= '0'.repeat(64);

/**
 * MODEL CADANGAN — satu setelan, dua tugas.
 *
 * Sebelum kartu ini, "fallback" model hanya ada sebagai literal
 * `'claude-sonnet-5'` di tiga berkas, dan ia praktis tak pernah menolong: ia
 * cuma menyala bila tenant belum memilih model sama sekali — padahal kolomnya
 * punya default, jadi keadaan itu nyaris tak pernah terjadi. Yang benar-benar
 * dibutuhkan adalah FAILOVER: model aktif menolak (kuota habis, 429, penyedia
 * mati) lalu ada yang menggantikan. Sejak model gratis dipakai di produksi,
 * itu bukan kemungkinan melainkan jadwal.
 *
 * Yang dikunci di sini adalah syarat-syarat yang membuat mekanismenya benar,
 * bukan sekadar keberadaannya.
 */

const CHAT = readFileSync('src/modules/chat/chat.service.ts', 'utf8');
const PS = readFileSync('src/modules/payments/platform-settings.service.ts', 'utf8');
const RUTE = readFileSync('src/app/api/admin/llm-fallback/route.ts', 'utf8');
const MIGRASI = readFileSync('migrations/0054_fallback_llm_model.sql', 'utf8');

test('nama model cadangan tak lagi tersebar sebagai literal', async () => {
  for (const p of [
    'src/modules/chat/chat.service.ts',
    'src/modules/memory/memory-agent.service.ts',
    'src/modules/memory/recategorize.service.ts',
  ]) {
    const isi = readFileSync(p, 'utf8');
    assert.doesNotMatch(isi, /activeLlmModel \?\? 'claude-sonnet-5'/,
      `${p} masih mengunci model cadangan di kode — ganti dengan platformSettingsService.modelCadangan()`);
    assert.match(isi, /modelCadangan\(\)/, `${p} tak memakai model cadangan platform`);
  }
});

test('failover HANYA sebelum ada delta yang terkirim', () => {
  /* Begitu potongan jawaban sudah sampai ke peramban, mengulang dengan model
     lain menyambung dua jawaban berbeda di tengah kalimat — hasil tempelan itu
     lebih membingungkan daripada satu galat yang jujur. */
  assert.match(CHAT, /deltaDiterima > 0 \|\| cadangan === llmModel\) throw err;/,
    'syarat failover hilang — jawaban bisa tersambung dari dua model');
  assert.match(CHAT, /deltaDiterima\+\+/, 'delta tak dihitung, jadi syarat di atas tak pernah benar');
});

test('failover tak menyembunyikan galat aslinya bila cadangan tak bisa dipakai', () => {
  assert.match(CHAT, /if \(!provCad\) throw err;/,
    'cadangan tak dikenal katalog harus melempar galat ASLI, bukan galat baru yang menyesatkan');
  assert.match(CHAT, /if \(!keyCad && provCad !== 'selfhosted'\) throw err;/,
    'cadangan tanpa kunci provider harus melempar galat asli');
});

test('pergantian model meninggalkan jejak', () => {
  /* Chat yang tiba-tiba dijawab model lain — dan ditagih ke akun lain — harus
     bisa ditelusuri, kalau tidak biaya yang membengkak tak punya penjelasan. */
  assert.match(CHAT, /console\.warn\(`\[chat\] model aktif/, 'pergantian model tak dicatat di log');
  assert.match(CHAT, /model: modelTerpakai/, 'audit mencatat model yang DIMINTA, bukan yang benar-benar menjawab');
  assert.match(CHAT, /modelCadangan: true, modelDiminta: llmModel/, 'audit tak menandai bahwa cadangan dipakai');
});

test('setelan platform: null berarti bawaan, bukan kosong', () => {
  assert.match(PS, /fallbackLlmModel: string \| null;/, 'bidang fallbackLlmModel hilang dari PlatformConfig');
  assert.match(PS, /input\.fallbackLlmModel !== undefined/,
    'dicek truthiness — null (kembali ke bawaan) jadi tak bisa disimpan');
  assert.match(PS, /export const MODEL_CADANGAN_BAWAAN/, 'bawaan terakhir tak dinyatakan');
});

test('cadangan divalidasi ke katalog sebelum disimpan', () => {
  /* Cadangan yang salah ketik tak menimbulkan galat apa pun hari ini — ia diam
     sampai model utama gagal, lalu ikut gagal. */
  assert.match(RUTE, /listLlmModels\(\)\)\.some\(\(m\) => m\.id === nilai\)/,
    'model cadangan disimpan tanpa dicocokkan ke katalog');
});

test('migrasi menambah kolom secara idempoten (bukan db:push)', () => {
  assert.match(MIGRASI, /add column if not exists fallback_llm_model text/i,
    'migrasi tak idempoten — menjalankannya dua kali akan gagal');
});
