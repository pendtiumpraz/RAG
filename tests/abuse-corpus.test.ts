import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

process.env.DATABASE_URL ??= 'postgres://x:y@localhost:5432/z';
process.env.CREDENTIALS_ENCRYPTION_KEY ??= '0'.repeat(64);

/**
 * KORPUS PENYALAHGUNAAN.
 *
 * Kartu a-moderation mengkhawatirkan hal yang ternyata SUDAH tertahan:
 * grounding ketat menolak 8 dari 8 permintaan di luar korpus (puisi, kode,
 * terjemahan, resep, nasihat saham) di kedua bahasa. Jadi lapis moderasi
 * konten tidak dibangun — menambahnya berarti menambah tempat baru untuk
 * salah tanpa mengurangi apa pun.
 *
 * Yang DIBANGUN adalah penjaganya: tanpa korpus ini, satu perubahan prompt
 * yang melonggarkan grounding akan membuka kembali seluruh paparan itu tanpa
 * satu pun galat — gejalanya cuma "chatbot pelanggan mulai menjawab hal-hal
 * di luar dokumen", dan tak seorang pun menghubungkannya dengan satu baris
 * prompt.
 */

const KORPUS = JSON.parse(readFileSync('eval/golden/penyalahgunaan.json', 'utf8'));

test('SELURUH pertanyaan penyalahgunaan berjawab-kosong', async () => {
  /* Ini yang membuat korpus ini otomatis bergerbang: pertanyaan dengan
     docRefs kosong yang DIJAWAB dihitung sebagai KARANGAN oleh eval, dan
     karangan sudah membuat `npm run eval:policy` keluar dengan kode 1.
     Tak perlu gerbang baru — yang perlu hanyalah korpusnya ada. */
  const { validasi } = await import('../src/modules/eval/golden');
  const h = validasi(KORPUS);
  for (const p of h.pertanyaan) {
    assert.equal(p.docRefs.length, 0,
      `"${p.id}" punya docRefs — pertanyaan penyalahgunaan harus SELALU berjawab-kosong, `
      + 'kalau tidak ia tak lagi menguji penolakan');
  }
});

test('mencakup beberapa BENTUK penyalahgunaan, bukan satu', async () => {
  /* Korpus yang seluruhnya "tuliskan puisi" hanya menguji satu bentuk. Yang
     dikhawatirkan kartunya adalah pemakaian kuota model pelanggan untuk
     keperluan lain — dan bentuknya bermacam: mengarang, memprogram,
     menerjemahkan, menasihati. */
  const q: string = KORPUS.pertanyaan.map((p: { q: string }) => p.q).join(' ').toLowerCase();
  for (const bentuk of ['puisi', 'python', 'terjemah', 'esai', 'javascript', 'stocks']) {
    assert.ok(q.includes(bentuk), `bentuk penyalahgunaan "${bentuk}" tak terwakili`);
  }
  assert.ok(KORPUS.pertanyaan.length >= 8, 'korpus terlalu kecil untuk disebut sistematis');
});

test('dwibahasa — penolakan tak boleh hanya bekerja dalam satu bahasa', async () => {
  const bahasa = new Set(KORPUS.pertanyaan.map((p: { bahasa?: string }) => p.bahasa));
  assert.ok(bahasa.has('id') && bahasa.has('en'),
    'korpus penyalahgunaan cuma satu bahasa — paparan di bahasa lain tak teruji');
});

test('korpus ini IKUT dijalankan gerbang eval bawaan', () => {
  /* `npm run eval:policy` tanpa --set menjalankan SELURUH berkas di
     eval/golden. Menaruh korpus di tempat lain berarti ia hanya jalan kalau
     seseorang ingat menyebutnya — dan penjaga yang harus diingat bukan
     penjaga. */
  const berkas = readdirSync('eval/golden').filter((f) => f.endsWith('.json'));
  assert.ok(berkas.includes('penyalahgunaan.json'),
    'korpus penyalahgunaan tak berada di eval/golden — ia tak akan ikut gerbang bawaan');
});

test('sisa risiko BIAYA dicatat, bukan dianggap ikut selesai', () => {
  /* Penolakan tetap menjalankan retrieval penuh, memanggil model penuh, dan
     dihitung satu pesan. Risiko ISI tertutup; risiko BIAYA tidak — dan
     menganggap keduanya selesai karena yang pertama terbukti adalah cara
     paling rapi menyembunyikan yang kedua. */
  const SEED = readFileSync('src/modules/core/backlog.service.ts', 'utf8');
  assert.ok(/'a-abuse-cost'/.test(SEED),
    'sisa risiko biaya tak dicatat sebagai kartu — ia akan hilang bersama tick ini');
  assert.ok(/usage_counters|dihitung satu pesan/.test(SEED),
    'kartu biaya tak menyebut MEKANISME yang membuatnya berbiaya');
});
