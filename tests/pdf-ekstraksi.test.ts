import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Stub env sebelum import modul (pola sama seperti tes lain yang butuh sync.service).
process.env.DATABASE_URL ??= 'postgres://x:y@localhost:5432/z';
process.env.CREDENTIALS_ENCRYPTION_KEY ??= '0'.repeat(64);

const load = () => import('../src/modules/knowledge/sync.service');
const FIXTURE = 'tests/fixtures/proposal-ukm-semarang-ragaya.pdf';

test('extractText membaca lapisan teks PDF 1.7 (regresi pdf-parse v2)', async () => {
  const { extractText } = await load();
  const buf = readFileSync(FIXTURE);
  const text = await extractText('proposal-ukm-semarang-ragaya.pdf', buf, 'application/pdf');
  assert.ok(text !== null, 'PDF berlapis teks tidak boleh dianggap hasil pindai (null)');
  assert.ok(text!.length > 1000, `teks terlalu pendek (${text?.length ?? 0} char)`);
  assert.match(text!, /Semarang/, 'isi PDF tidak terbaca sebagaimana mestinya');
});
