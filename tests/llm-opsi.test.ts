import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/**
 * completeChat — dua batas yang mudah tertukar, dan pernah tertukar.
 *
 * Bentuk lamanya `(modelId, messages, apiKey, maxChars, sampling)`. KEDUA
 * pemanggilnya menulis `completeChat(model, pesan, apiKey, 2000)` bermaksud
 * membatasi TOKEN — padahal posisi itu `maxChars`, pemotong panjang string di
 * sisi kita. Dua batas yang berbeda satuannya, satu posisi, tanpa nama.
 *
 * Akibatnya di recategorize terbukti nyata di produksi: batas token jatuh ke
 * bawaan 2.048, model bernalar menghabiskannya untuk berpikir, dan balasannya
 * KOSONG. Di memory-agent akibatnya belum pernah menyala — pada dokumen yang
 * diukur, balasannya 1.175–1.591 karakter, di bawah pemotong 2.000 — tapi
 * marginnya tipis dan kegagalannya akan diam persis seperti yang pertama.
 */

const LLM = readFileSync('src/modules/chat/llm/index.ts', 'utf8');
const SUMBER = execSync('git ls-files "src/**/*.ts" "scripts/*.ts"', { encoding: 'utf8' })
  .trim().split('\n').filter(Boolean).map((f) => [f, readFileSync(f, 'utf8')] as const);

test('argumen keempat adalah OBJEK BERNAMA, bukan angka berposisi', () => {
  /* Dengan objek bernama, kekeliruan yang sama tak bisa ditulis: `maxTokens`
     dan `maxChars` tak punya posisi untuk tertukar. */
  assert.ok(/opsi: OpsiCompletion = \{\}/.test(LLM), 'argumen keempat bukan objek bernama');
  assert.ok(!/maxChars = 8000,\n\s*sampling: Sampling/.test(LLM), 'bentuk berposisi lama masih ada');
  assert.ok(/export interface OpsiCompletion/.test(LLM), 'OpsiCompletion tak diekspor');
});

test('kedua batas dijelaskan SATUANNYA, bukan cuma namanya', () => {
  /* "maxChars" dan "maxTokens" terlihat sejenis bagi yang membaca cepat.
     Yang membedakan bukan namanya melainkan siapa yang menegakkannya: satu
     dipotong di sisi kita, satu dikirim ke model. */
  const blok = LLM.slice(LLM.indexOf('export interface OpsiCompletion'), LLM.indexOf('export async function completeChat'));
  assert.ok(/bukan batas model/.test(blok), 'maxChars tak dijelaskan sebagai batas sisi kita');
  assert.ok(/dikirim ke model/.test(blok), 'maxTokens tak dijelaskan sebagai batas model');
});

test('tak ada pemanggil yang mengirim ANGKA TELANJANG di posisi itu', () => {
  /* Ini bentuk kegagalan aslinya. Satu literal angka di posisi keempat
     adalah niat "batasi token" yang mendarat di tempat yang salah. */
  const buruk: string[] = [];
  for (const [f, s] of SUMBER) {
    for (const m of s.matchAll(/completeChat\([\s\S]{0,4000}?\]\s*,\s*\w+\s*,\s*([^)\s]+)/g)) {
      if (/^\d/.test(m[1])) buruk.push(`${f}: completeChat(..., ${m[1]})`);
    }
  }
  assert.deepEqual(buruk, [], `angka telanjang di posisi opsi:\n  ${buruk.join('\n  ')}`);
});

test('kedua pemanggil menyebut anggaran token SECARA EKSPLISIT', () => {
  /* Mengandalkan bawaan berarti anggarannya berubah diam-diam saat bawaan
     diubah — dan yang menemukan akibatnya adalah pengguna, bukan kita. */
  for (const f of ['src/modules/memory/recategorize.service.ts', 'src/modules/memory/memory-agent.service.ts']) {
    const s = readFileSync(f, 'utf8');
    assert.ok(/maxTokens: MAX_TOKEN_\w+/.test(s), `${f} tak menyebut anggaran token`);
    const m = s.match(/const MAX_TOKEN_\w+ = ([\d_]+);/);
    assert.ok(m, `${f} tak mendefinisikan anggarannya`);
    assert.ok(Number(m![1].replace(/_/g, '')) >= 4000,
      `${f}: anggaran ${m![1]} terlalu kecil — model bernalar memakai sebagian besarnya untuk berpikir`);
  }
});

test('maxChars tetap ada sebagai pengaman, dan bawaannya longgar', () => {
  /* Pengaman terhadap model yang mengoceh tanpa henti tetap perlu — yang
     salah bukan keberadaannya, melainkan dipakainya ia sebagai batas token.
     Bawaannya harus longgar supaya tak memotong jawaban yang sah. */
  const m = LLM.match(/const maxChars = opsi\.maxChars \?\? (\d+);/);
  assert.ok(m, 'pengaman panjang string hilang');
  assert.ok(Number(m![1]) >= 8000, `bawaan maxChars ${m![1]} terlalu ketat`);
});
