import { test } from 'node:test';
import assert from 'node:assert/strict';

// Env di-set sebelum import (pola tes lain). _master hanya butuh ini agar
// modul yang di-wire tidak meledak saat di-import.
process.env.CREDENTIALS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
process.env.DATABASE_URL = 'postgres://u:p@localhost:5432/db';
process.env.NALAR_MASTER_KEY = 'x'.repeat(40);

/* Whitelist DOMAIN provisioning S2S — daftar domain kini di-inject (dari DB),
   originAllowed dibuat MURNI supaya bisa diuji tanpa DB. */
test('originAllowed: whitelist mairasales.com', async () => {
  const { NextRequest } = await import('next/server');
  const { originAllowed } = await import('../src/app/api/v1/_master');
  const ALLOWED = ['mairasales.com'];
  const withOrigin = (o?: string) =>
    originAllowed(new NextRequest('https://nalar.example/api/v1/tenants',
      { headers: o ? { origin: o } : {} }), ALLOWED);

  // Origin kosong (S2S server Maira) → diizinkan, dikawal token master.
  assert.equal(withOrigin(undefined), true);
  // Domain & subdomain sah.
  assert.equal(withOrigin('https://mairasales.com'), true);
  assert.equal(withOrigin('https://app.mairasales.com'), true);
  assert.equal(withOrigin('https://admin.mairasales.com'), true);
  // Serangan look-alike & domain lain → tolak.
  assert.equal(withOrigin('https://evilmairasales.com'), false);
  assert.equal(withOrigin('https://mairasales.com.evil.com'), false);
  assert.equal(withOrigin('https://example.com'), false);
  // Referer sebagai fallback saat Origin absen.
  assert.equal(
    originAllowed(new NextRequest('https://nalar.example/api/v1/tenants',
      { headers: { referer: 'https://app.mairasales.com/dash' } }), ALLOWED), true);

  // Daftar KOSONG (S2S-only): peramban ditolak, S2S tanpa Origin tetap lolos.
  assert.equal(originAllowed(new NextRequest('https://nalar.example/api/v1/tenants',
    { headers: { origin: 'https://mairasales.com' } }), []), false);
  assert.equal(originAllowed(new NextRequest('https://nalar.example/api/v1/tenants',
    { headers: {} }), []), true);

  // Beberapa domain di-whitelist sekaligus.
  assert.equal(originAllowed(new NextRequest('https://nalar.example/api/v1/tenants',
    { headers: { origin: 'https://foo.com' } }), ['mairasales.com', 'foo.com']), true);
});

/* TES KONEKSI master key (superadmin) — hanya status, tak pernah bocorkan nilai. */
test('masterKeyStatus: ter-set & panjang >= MIN_KEY_LEN', async () => {
  const { masterKeyStatus, MIN_KEY_LEN } = await import('../src/app/api/v1/_master');
  const orig = process.env.NALAR_MASTER_KEY;
  try {
    process.env.NALAR_MASTER_KEY = 'x'.repeat(MIN_KEY_LEN);
    assert.deepEqual(masterKeyStatus(), { configured: true, lengthOk: true });
    process.env.NALAR_MASTER_KEY = 'x'.repeat(MIN_KEY_LEN - 1);
    assert.deepEqual(masterKeyStatus(), { configured: true, lengthOk: false });
    process.env.NALAR_MASTER_KEY = '';
    assert.deepEqual(masterKeyStatus(), { configured: false, lengthOk: false });
  } finally { process.env.NALAR_MASTER_KEY = orig; }
});

/* Normalisasi input domain dari UI superadmin. */
test('normalizeS2sDomain: bersihkan & tolak yang tak sah', async () => {
  const { normalizeS2sDomain } = await import('../src/app/api/v1/_master');
  assert.equal(normalizeS2sDomain('mairasales.com'), 'mairasales.com');
  assert.equal(normalizeS2sDomain('  MairaSales.COM '), 'mairasales.com');
  assert.equal(normalizeS2sDomain('https://mairasales.com/apa/pun'), 'mairasales.com');
  assert.equal(normalizeS2sDomain('http://app.foo.co.id'), 'app.foo.co.id');
  // Tak sah → null.
  assert.equal(normalizeS2sDomain(''), null);
  assert.equal(normalizeS2sDomain('localhost'), null);
  assert.equal(normalizeS2sDomain('127.0.0.1'), null);
  assert.equal(normalizeS2sDomain('nodot'), null);
});
