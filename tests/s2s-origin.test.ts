import { test } from 'node:test';
import assert from 'node:assert/strict';

// Env di-set sebelum import (pola tes lain). _master hanya butuh ini agar
// modul yang di-wire tidak meledak saat di-import.
process.env.CREDENTIALS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
process.env.DATABASE_URL = 'postgres://u:p@localhost:5432/db';
process.env.NALAR_MASTER_KEY = 'x'.repeat(40);

/* Whitelist DOMAIN provisioning S2S — mairasales.com + subdomain saja. */
test('originAllowed: whitelist mairasales.com', async () => {
  const { NextRequest } = await import('next/server');
  const { originAllowed } = await import('../src/app/api/v1/_master');
  const withOrigin = (o?: string) =>
    originAllowed(new NextRequest('https://nalar.example/api/v1/tenants',
      { headers: o ? { origin: o } : {} }));

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
      { headers: { referer: 'https://app.mairasales.com/dash' } })), true);
});
