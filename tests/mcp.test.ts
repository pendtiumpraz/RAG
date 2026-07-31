import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  ALAT, KODE, VERSI_PROTOKOL, adalahNotifikasi, alatBerhasil, alatGagal,
  galat, hasil, keteranganServer, periksaAmplop, ringkasPencarian,
} from '../src/modules/integrations/mcp';

/**
 * MCP — protokol yang salahnya membuat agen mencoba ulang selamanya.
 *
 * Kegagalan di sini tak terlihat di layar mana pun: yang membacanya adalah
 * agen milik pelanggan, di mesin pelanggan, dan reaksinya terhadap balasan
 * yang salah bentuk adalah mengulang permintaan yang sama — tiap kali
 * memanggil kita lagi.
 */

const RUTE = readFileSync('src/app/api/v1/mcp/route.ts', 'utf8');

/* ── amplop ──────────────────────────────────────────────────────────── */

test('amplop yang sah diterima, yang tak sah DITOLAK dengan sebab', () => {
  assert.equal(periksaAmplop({ jsonrpc: '2.0', id: 1, method: 'ping' }), null);
  assert.equal(periksaAmplop({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
  assert.match(periksaAmplop({ jsonrpc: '1.0', id: 1, method: 'ping' })!, /jsonrpc/);
  assert.match(periksaAmplop({ jsonrpc: '2.0', id: 1 })!, /method/);
  assert.match(periksaAmplop({ jsonrpc: '2.0', id: {}, method: 'ping' })!, /id/);
  assert.match(periksaAmplop(null)!, /objek JSON-RPC/);
  assert.match(periksaAmplop('halo')!, /objek JSON-RPC/);
});

test('batch DITOLAK tegas, tidak didukung separuh', () => {
  /* MCP 2025-06-18 membuang dukungan batch. Menerima separuh lebih buruk
     daripada menolak: klien akan mengira batch-nya bekerja sampai satu
     permintaan hilang tanpa jejak, dan yang hilang tak pernah dilaporkan. */
  const p = periksaAmplop([{ jsonrpc: '2.0', id: 1, method: 'ping' }]);
  assert.match(p!, /Batch/);
});

test('NOTIFIKASI dibedakan dari permintaan', () => {
  /* Notifikasi tak boleh dibalas apa pun. Balasan yang tetap dikirim akan
     dibaca klien sebagai jawaban atas permintaan LAIN yang sedang menunggu,
     dan pasangan permintaan-jawaban bergeser sejak titik itu. */
  assert.equal(adalahNotifikasi({ method: 'notifications/initialized' } as never), true);
  assert.equal(adalahNotifikasi({ id: 1 }), false);
  // id: null adalah permintaan yang sah menurut JSON-RPC, BUKAN notifikasi.
  assert.equal(adalahNotifikasi({ id: null }), false);
  assert.equal(adalahNotifikasi({ id: 0 }), false, 'id 0 disangka notifikasi (jebakan falsy)');
  assert.equal(adalahNotifikasi({ id: '' }), false, 'id "" disangka notifikasi (jebakan falsy)');
});

test('rute tak membalas notifikasi, termasuk yang metodenya tak dikenal', () => {
  const iNotif = RUTE.indexOf('if (adalahNotifikasi(b))');
  const iSwitch = RUTE.indexOf('switch (b.method)');
  assert.ok(iNotif > 0 && iNotif < iSwitch,
    'notifikasi diperiksa setelah pemilihan metode — metode tak dikenal akan dibalas');
  assert.ok(/return new NextResponse\(null, \{ status: 202 \}\)/.test(RUTE),
    'notifikasi dibalas dengan badan, bukan 202 kosong');
});

/* ── galat protokol vs galat alat ────────────────────────────────────── */

test('galat ALAT adalah result, bukan error JSON-RPC', () => {
  /* Ini pembedaan yang paling sering tertukar. Galat protokol dibaca klien
     sebagai sambungan rusak dan memicu percobaan ulang yang takkan pernah
     berhasil; galat alat dibaca modelnya, lalu ia mencoba hal lain. */
  const g = alatGagal('Chatbot tidak ada.');
  assert.equal(g.isError, true);
  assert.equal(g.content[0].type, 'text');
  assert.ok(!('code' in g), 'galat alat membawa kode JSON-RPC');
  const b = alatBerhasil('ok');
  assert.equal(b.isError, false);
});

test('rute mengembalikan hasil() untuk tools/call, tak pernah galat()', () => {
  const blok = RUTE.slice(RUTE.indexOf("case 'tools/call'"), RUTE.indexOf('default:'));
  assert.ok(/hasil\(id, await panggilAlat/.test(blok), 'tools/call tak dibungkus result');
  const fn = RUTE.slice(RUTE.indexOf('async function panggilAlat'));
  assert.ok(!/galat\(/.test(fn), 'panggilAlat mengembalikan galat JSON-RPC untuk kegagalan alat');
  assert.ok(!/throw /.test(fn), 'panggilAlat melempar — kegagalan alat jadi galat protokol');
});

test('metode tak dikenal → -32601, bukan diam atau 500', () => {
  assert.equal(KODE.METODE_TAK_DIKENAL, -32_601);
  assert.equal(KODE.PARSE, -32_700);
  assert.equal(KODE.PERMINTAAN_TAK_SAH, -32_600);
  const g = galat(7, KODE.METODE_TAK_DIKENAL, 'x');
  assert.equal(g.jsonrpc, '2.0');
  assert.equal(g.id, 7);
  assert.equal(g.error!.code, -32_601);
  assert.ok(!('result' in g), 'balasan galat juga membawa result');
  const h = hasil(7, { a: 1 });
  assert.ok(!('error' in h), 'balasan hasil juga membawa error');
});

/* ── daftar alat ─────────────────────────────────────────────────────── */

test('setiap alat punya nama, penjelasan, dan skema masukan yang sah', () => {
  assert.ok(ALAT.length >= 2);
  for (const a of ALAT) {
    assert.match(a.name, /^[a-z_]+$/, `nama alat tak baku: ${a.name}`);
    assert.ok(a.description.length > 40, `penjelasan ${a.name} terlalu pendek untuk dipahami model`);
    assert.equal((a.inputSchema as { type: string }).type, 'object');
    assert.equal((a.inputSchema as { additionalProperties: boolean }).additionalProperties, false,
      `${a.name} menerima argumen tak dikenal diam-diam`);
  }
  const nama = ALAT.map((a) => a.name);
  assert.equal(new Set(nama).size, nama.length, 'ada nama alat kembar');
});

test('alat yang menjalankan LLM sengaja TIDAK ditawarkan', () => {
  /* Agen pemanggil sudah punya modelnya sendiri; yang tak dimilikinya adalah
     dokumen pelanggan. Menambah alat "tanya" membebankan biaya LLM ke sisi
     kami dan memotong kuota pesan pelanggan, tanpa menambah kemampuan yang
     belum ada. */
  /* Dicocokkan pada nama UTUH, bukan potongan: `daftar_chatbot` memuat
     "chat" tanpa menjalankan satu pun model. */
  const menjalankanLlm = ['tanya', 'jawab', 'chat', 'ask', 'generate', 'complete'];
  assert.deepEqual(ALAT.filter((a) => menjalankanLlm.includes(a.name)).map((a) => a.name), [],
    'ada alat yang menjalankan LLM di sisi kami');
  assert.ok(ALAT.some((a) => a.name === 'cari_dokumen'));
  assert.ok(ALAT.some((a) => a.name === 'daftar_chatbot'));
});

test('cari_dokumen menuntut chatbotId — pencarian tak boleh lintas seluruh KB', () => {
  /* Chatbot menentukan KB mana yang boleh dibaca (D11). Alat yang mencari
     tanpa chatbotId akan menembus seluruh basis pengetahuan tenant, dan itu
     melanggar pemisahan yang justru jadi alasan chatbot punya KB masing-
     masing. */
  const cari = ALAT.find((a) => a.name === 'cari_dokumen')!;
  const req = (cari.inputSchema as { required: string[] }).required;
  assert.ok(req.includes('chatbotId'), 'chatbotId tak wajib');
  assert.ok(req.includes('query'));
});

/* ── keterangan server ───────────────────────────────────────────────── */

test('initialize menjawab versi protokol dan HANYA kemampuan yang ada', () => {
  const s = keteranganServer();
  assert.equal(s.protocolVersion, VERSI_PROTOKOL);
  assert.ok(s.capabilities.tools, 'kemampuan tools tak diumumkan');
  /* Mengumumkan resources/prompts yang tak diimplementasikan membuat klien
     memanggilnya, lalu menerima -32601 pada kemampuan yang KITA janjikan. */
  assert.ok(!('resources' in s.capabilities), 'menjanjikan resources yang tak ada');
  assert.ok(!('prompts' in s.capabilities), 'menjanjikan prompts yang tak ada');
  assert.ok(s.serverInfo.name && s.serverInfo.version);
});

/* ── keluaran pencarian ──────────────────────────────────────────────── */

test('hasil kosong DIJELASKAN, bukan dikembalikan sebagai teks kosong', () => {
  /* Teks kosong akan dibaca model sebagai kegagalan alat yang tak jelas, dan
     ia akan mencoba ulang kueri yang sama. */
  const t = ringkasPencarian('npwp', []);
  assert.ok(t.includes('npwp'));
  assert.ok(/Tidak ada potongan/.test(t));
  assert.ok(t.length > 40);
});

test('tiap kutipan membawa judul dan skor', () => {
  /* Tanpa judul, model tak bisa merujuk sumbernya; tanpa skor, ia tak punya
     cara menakar mana yang meyakinkan. Keduanya hilang begitu hasilnya
     digabung jadi satu gumpalan teks. */
  const t = ringkasPencarian('kontrak', [
    { title: 'Perjanjian A', content: 'isi satu', score: 0.8123 },
    { title: null, content: 'isi dua', score: 0.4 },
  ]);
  assert.ok(t.includes('Perjanjian A'), 'judul hilang');
  assert.ok(t.includes('0.812'), 'skor hilang');
  assert.ok(t.includes('(tanpa judul)'), 'dokumen tanpa judul jadi baris kosong');
  assert.ok(t.includes('[1]') && t.includes('[2]'), 'kutipan tak bernomor');
});

/* ── penjagaan tenant ────────────────────────────────────────────────── */

test('seluruh akses data lewat withTenant, tak ada kueri lepas', () => {
  const fn = RUTE.slice(RUTE.indexOf('async function panggilAlat'));
  const kueri = (fn.match(/tx\.select/g) ?? []).length;
  const wrap = (fn.match(/withTenant\(tenantId/g) ?? []).length;
  assert.ok(kueri > 0, 'tak ada kueri sama sekali — bentuk berkas berubah');
  assert.equal(wrap, kueri, `${kueri} kueri tapi hanya ${wrap} withTenant`);
  assert.ok(!/\bdb\.select|\bdb\.execute/.test(fn), 'ada akses DB di luar konteks tenant');
});

test('MCP memakai cakupan chat, bukan read', () => {
  /* Pencarian semantik memuat embedding kueri, dan itu pekerjaan berbiaya.
     Menyamakannya dengan /api/v1/search mencegah kunci "baca saja" diam-diam
     membuka jalur yang lebih mahal. */
  assert.ok(/apiRoute\('chat'/.test(RUTE), 'MCP terbuka untuk kunci read');
});
