import { test } from 'node:test';
import assert from 'node:assert/strict';

// Env harus di-set SEBELUM modul yang membacanya di-import (dynamic import).
process.env.CREDENTIALS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
process.env.DATABASE_URL = 'postgres://u:p@localhost:5432/db'; // dummy, tak connect

/* normalizeTripay = satu-satunya tempat migrasi flat→per-env hidup.
 * Empat kasus: bentuk baru nested, dua bentuk lama flat (prod & sandbox),
 * dan parsial (satu env terisi → env lain kosong). */

test('tripay: bentuk baru nested → dua env terbaca terpisah', async () => {
  const { normalizeTripay } = await import('../src/modules/payments/payment-gateway.service');
  const n = normalizeTripay(
    { sandbox: { apiKey: 'sa', privateKey: 'sp' }, production: { apiKey: 'pa', privateKey: 'pp' } },
    { activeEnv: 'production', envs: { sandbox: { merchantCode: 'SM', proxyUrl: 'sx' }, production: { merchantCode: 'PM', proxyUrl: 'px' } } },
  );
  assert.equal(n.activeEnv, 'production');
  assert.deepEqual(n.envs.sandbox, { apiKey: 'sa', privateKey: 'sp', merchantCode: 'SM', proxyUrl: 'sx' });
  assert.deepEqual(n.envs.production, { apiKey: 'pa', privateKey: 'pp', merchantCode: 'PM', proxyUrl: 'px' });
});

test('tripay: legacy flat + sandbox:false → semua masuk production', async () => {
  const { normalizeTripay } = await import('../src/modules/payments/payment-gateway.service');
  const n = normalizeTripay(
    { apiKey: 'A', privateKey: 'B' },
    { merchantCode: 'M', proxyUrl: 'http://p', sandbox: false },
  );
  assert.equal(n.activeEnv, 'production');
  assert.deepEqual(n.envs.production, { apiKey: 'A', privateKey: 'B', merchantCode: 'M', proxyUrl: 'http://p' });
  assert.deepEqual(n.envs.sandbox, {}); // sandbox kosong, tak mewarisi kredensial production
});

test('tripay: legacy flat + sandbox:true → semua masuk sandbox', async () => {
  const { normalizeTripay } = await import('../src/modules/payments/payment-gateway.service');
  const n = normalizeTripay(
    { apiKey: 'A', privateKey: 'B' },
    { merchantCode: 'M', proxyUrl: 'http://p', sandbox: true },
  );
  assert.equal(n.activeEnv, 'sandbox');
  assert.deepEqual(n.envs.sandbox, { apiKey: 'A', privateKey: 'B', merchantCode: 'M', proxyUrl: 'http://p' });
  assert.deepEqual(n.envs.production, {});
});

test('tripay: parsial (hanya production terisi) → sandbox tetap kosong', async () => {
  const { normalizeTripay } = await import('../src/modules/payments/payment-gateway.service');
  const n = normalizeTripay(
    { sandbox: {}, production: { apiKey: 'pa', privateKey: 'pp' } },
    { activeEnv: 'production', envs: { sandbox: { merchantCode: '', proxyUrl: '' }, production: { merchantCode: 'PM', proxyUrl: '' } } },
  );
  assert.equal(n.envs.production.apiKey, 'pa');
  assert.equal(n.envs.sandbox.apiKey, undefined);
  assert.equal(n.envs.sandbox.privateKey, undefined);
});

test('tripay: kosong/undefined → default production, dua env kosong', async () => {
  const { normalizeTripay } = await import('../src/modules/payments/payment-gateway.service');
  const n = normalizeTripay(null, null);
  assert.equal(n.activeEnv, 'production');
  assert.deepEqual(n.envs.sandbox, {});
  assert.deepEqual(n.envs.production, {});
});
