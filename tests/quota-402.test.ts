import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Penolakan kuota harus MENYEBUT sebab + jalan keluar → HTTP 402, bukan 422
 * "permintaanmu salah" dan bukan 500 diam. Kuota yang menolak tanpa menjelaskan
 * dibaca sebagai produk rusak. Uji ini source-text (pola tes lain di repo):
 * murah, tak menyentuh DB, dan menjaga pemetaan status tak diam-diam berbalik.
 */

const read = (p: string) => readFileSync(p, 'utf8');

test('QuotaError satu kelas kanonis di modul usage, di-re-export knowledge', () => {
  const usage = read('src/modules/usage/usage.service.ts');
  const knowledge = read('src/modules/knowledge/knowledge.service.ts');
  // Satu definisi — supaya `instanceof` lintas modul tak meleset.
  assert.ok(/export class QuotaError extends Error/.test(usage), 'QuotaError tak didefinisikan di usage');
  assert.ok(/readonly used: number, readonly limit: number/.test(usage), 'QuotaError tak membawa used/limit');
  assert.ok(/export \{ QuotaError \}/.test(knowledge), 'knowledge tak lagi re-export QuotaError');
  assert.ok(!/class QuotaError/.test(knowledge), 'knowledge mendefinisikan ulang QuotaError (dua kelas)');
});

test('batas chatbot & anggota melempar QuotaError (bukan ValidationError)', () => {
  const chatbot = read('src/modules/chatbot/chatbot.service.ts');
  const invite = read('src/modules/auth/invitation.service.ts');
  assert.ok(/maxChatbots\)[\s\S]{0,200}throw new QuotaError/.test(chatbot),
    'kuota chatbot tak dilempar sebagai QuotaError');
  assert.ok(/maxMembers\)[\s\S]{0,200}throw new QuotaError/.test(invite),
    'kuota anggota tak dilempar sebagai QuotaError');
});

test('rute memetakan QuotaError → 402 dengan used/limit', () => {
  for (const p of [
    'src/app/api/chatbots/route.ts',
    'src/app/api/team/invitations/route.ts',
    'src/app/api/v1/_guard.ts',
  ]) {
    const src = read(p);
    assert.ok(/instanceof QuotaError[\s\S]{0,160}status: 402/.test(src), `${p} tak memetakan QuotaError ke 402`);
    assert.ok(/quota: \{ used: e\.used, limit: e\.limit \}/.test(src), `${p} tak melampirkan angka kuota`);
  }
});

test('GET plan-quotas tak mati oleh drift skema — select sempit + jatuh ke default', () => {
  const route = read('src/app/api/admin/plan-quotas/route.ts');
  // `select()` polos membaca SETIAP kolom platform_settings; satu kolom yang
  // tertinggal di DB membuat GET 500 walau kuota tak butuh kolom itu.
  assert.ok(!/db\.select\(\)\.from\(platformSettings\)/.test(route), 'masih select() semua kolom');
  assert.ok(/db\.select\(KOLOM\)/.test(route), 'select tak dipersempit ke kolom yang dipakai');
  assert.ok(/catch[\s\S]{0,200}overrides = \{\}|overrides: Record[\s\S]{0,400}catch/.test(route),
    'GET tak jatuh ke default saat DB bermasalah');
});
