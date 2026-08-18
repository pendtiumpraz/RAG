import { test } from 'node:test';
import assert from 'node:assert/strict';

// Env harus di-set SEBELUM modul yang membacanya di-import (dynamic import).
process.env.CREDENTIALS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
process.env.DATABASE_URL = 'postgres://u:p@localhost:5432/db'; // dummy, tak connect

/* qrisChannelActive = penentu "QRIS aktif" murni dari daftar payment-channel
 * TriPay. Tak menyentuh jaringan; endpoint live hanya diuji manual. */

test('qris: channel QRIS active:true → true', async () => {
  const { qrisChannelActive } = await import('../src/modules/payments/payment.service');
  assert.equal(qrisChannelActive([
    { group: 'Virtual Account', code: 'BRIVA', name: 'BRI VA', active: true },
    { group: 'E-Wallet', code: 'QRIS', name: 'QRIS by ShopeePay', active: true },
  ]), true);
});

test('qris: variasi kode (QRISC) tetap dikenali', async () => {
  const { qrisChannelActive } = await import('../src/modules/payments/payment.service');
  assert.equal(qrisChannelActive([{ code: 'QRISC', name: 'QRIS Custom', active: true }]), true);
});

test('qris: QRIS ada tapi active:false → false', async () => {
  const { qrisChannelActive } = await import('../src/modules/payments/payment.service');
  assert.equal(qrisChannelActive([{ code: 'QRIS', name: 'QRIS', active: false }]), false);
});

test('qris: tak ada QRIS di daftar → false', async () => {
  const { qrisChannelActive } = await import('../src/modules/payments/payment.service');
  assert.equal(qrisChannelActive([{ code: 'BRIVA', name: 'BRI VA', active: true }]), false);
});

test('qris: input bukan array → false (tak lempar)', async () => {
  const { qrisChannelActive } = await import('../src/modules/payments/payment.service');
  assert.equal(qrisChannelActive(null), false);
  assert.equal(qrisChannelActive(undefined), false);
  assert.equal(qrisChannelActive({}), false);
});
