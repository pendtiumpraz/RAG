import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  AMBIL_BAWAAN, AMBIL_MAKS, batasiAmbil, halaman, tafsirSejak,
} from '../src/modules/chat/ekspor';

/**
 * EKSPOR PERCAKAPAN LEWAT API v1.
 *
 * Endpoint ini akan dipakai penarik BERKALA — cron milik pelanggan yang
 * berjalan tanpa ditonton siapa pun. Bentuk kegagalan yang berbahaya di sini
 * karena itu bukan "galat", melainkan "berhasil tapi salah": arsip yang
 * berhenti di tengah tanpa penanda, atau unduhan ulang seluruh riwayat tiap
 * jam karena satu parameter salah ketik. Keduanya senyap, dan keduanya baru
 * ketahuan berbulan kemudian saat datanya dibutuhkan.
 */

/* ── penyaring waktu ─────────────────────────────────────────────────── */

test('tanggal NGAWUR melempar, tidak diam-diam jadi "tanpa penyaring"', () => {
  /* Inilah bentuk kegagalan yang paling mahal di kartu ini. Kalau tanggal tak
     terbaca dianggap null, penarik berkala yang salah format akan mengunduh
     ULANG seluruh riwayat setiap kali dijalankan — berhasil, senyap, dan
     tagihannya naik tanpa sebab yang kelihatan. */
  for (const buruk of ['kemarin', '2026-13-45', 'null', '???']) {
    assert.throws(() => tafsirSejak(buruk), RangeError, `"${buruk}" lolos sebagai tanggal`);
  }
});

test('tanpa parameter = null, dan itu BEDA dari tanggal ngawur', () => {
  assert.equal(tafsirSejak(null), null);
  assert.equal(tafsirSejak(''), null);
  assert.equal(tafsirSejak('2026-07-31T00:00:00.000Z')?.toISOString(), '2026-07-31T00:00:00.000Z');
});

/* ── batas halaman ───────────────────────────────────────────────────── */

test('batas dibulatkan ke rentang sah, bukan ditolak', () => {
  /* Penarik berkala yang mati karena salah ketik satu parameter jauh lebih
     merepotkan daripada penarik yang menerima 200 saat meminta 999. */
  assert.equal(batasiAmbil(null), AMBIL_BAWAAN);
  assert.equal(batasiAmbil('abc'), AMBIL_BAWAAN);
  assert.equal(batasiAmbil('0'), AMBIL_BAWAAN);
  assert.equal(batasiAmbil('-5'), AMBIL_BAWAAN);
  assert.equal(batasiAmbil('999999'), AMBIL_MAKS);
  assert.equal(batasiAmbil('10'), 10);
  assert.equal(batasiAmbil('10.9'), 10, 'pecahan tak dibulatkan ke bawah');
});

test('batas atas benar-benar mengikat — satu permintaan tak bisa menarik semuanya', () => {
  /* Tanpa atap, "limit=100000" menarik seluruh riwayat tenant ke memori
     lambda sekaligus, dan di Vercel itu berakhir sebagai kegagalan yang
     sebabnya tak muncul di log mana pun. */
  assert.ok(AMBIL_MAKS <= 200);
  assert.ok(AMBIL_BAWAAN < AMBIL_MAKS);
});

/* ── kejujuran soal keterpotongan ────────────────────────────────────── */

const baris = (n: number) => Array.from({ length: n }, (_, i) => ({
  id: `c${i}`, updatedAt: new Date(Date.UTC(2026, 6, 31, 0, 0, i)),
}));

test('halaman penuh MENANDAI bahwa masih ada sisa', () => {
  /* Tanpa penanda, batas halaman terlihat persis seperti "data habis" — dan
     arsip pelanggan berhenti di tengah tanpa satu pun galat. */
  const h = halaman(baris(11), 10);
  assert.equal(h.items.length, 10, 'baris pengintip ikut terkirim');
  assert.equal(h.adaLagi, true);
  assert.equal(h.berikutnya, '2026-07-31T00:00:09.000Z');
});

test('halaman terakhir tidak berpura-pura masih ada sisa', () => {
  const h = halaman(baris(7), 10);
  assert.equal(h.items.length, 7);
  assert.equal(h.adaLagi, false);
  assert.equal(h.berikutnya, null, 'kursor diberikan padahal sudah habis — penarik akan berputar');
});

test('kursor = waktu baris TERAKHIR YANG DIKIRIM, bukan waktu sekarang', () => {
  /* Memakai waktu sekarang akan melompati baris yang tersimpan sementara
     halaman ini sedang disusun — lubang yang hanya muncul di bawah beban,
     dan hanya terlihat sebagai percakapan yang "hilang". */
  const h = halaman(baris(11), 10);
  assert.equal(h.berikutnya, new Date(h.items[9].updatedAt).toISOString());
  assert.notEqual(h.berikutnya, new Date(baris(11)[10].updatedAt).toISOString(),
    'kursor memakai baris pengintip — satu percakapan akan terlewat tiap halaman');
});

test('halaman kosong tidak mengembalikan kursor', () => {
  const h = halaman([], 10);
  assert.deepEqual(h, { items: [], adaLagi: false, berikutnya: null });
});

/* ── rutenya ─────────────────────────────────────────────────────────── */

const LIST = readFileSync('src/app/api/v1/conversations/route.ts', 'utf8');
const SATU = readFileSync('src/app/api/v1/conversations/[id]/route.ts', 'utf8');
const KUERI = readFileSync('src/modules/chat/ekspor.ts', 'utf8');

test('kedua rute lewat apiRoute + withTenant, bukan query telanjang', () => {
  /* apiRoute yang terlewat berarti riwayat percakapan seluruh tenant terbuka
     tanpa autentikasi apa pun; withTenant yang terlewat berarti RLS tak
     dipasang dan satu kunci API bisa membaca percakapan tenant lain. */
  for (const [nama, src] of [['daftar', LIST], ['satu', SATU]] as const) {
    /* Generiknya memuat `>` di dalamnya (Promise<{…}>), jadi pola yang
       berhenti pada `>` pertama akan gagal justru pada rute yang bergenerik —
       dan uji yang gagal karena polanya sendiri melatih orang mengendurkan
       uji, bukan memperbaiki kode. */
    assert.ok(/export const GET = apiRoute[\s\S]{0,120}?\('read'/.test(src),
      `${nama}: tak dibungkus apiRoute scope read`);
    assert.ok(/withTenant\(caller\.tenantId/.test(src), `${nama}: tak lewat withTenant`);
  }
  /* Penyaring soft delete daftar ikut PINDAH bersama kuerinya ke
     chat/ekspor.ts — supaya SQL-nya bisa diperiksa `.toSQL()` tanpa basis
     data. Yang dijaga tetap sama; hanya berkasnya yang berbeda. */
  assert.ok(/isNull\(conversations\.deletedAt\)/.test(KUERI), 'daftar tak menyaring soft delete');
  assert.ok(/isNull\(/.test(SATU), 'transkrip tak menyaring soft delete');
});

test('paginasi berbasis WAKTU, bukan offset', () => {
  /* Dengan offset, baris bergeser di antara dua permintaan karena percakapan
     baru terus lahir: penarik melewatkan sebagian dan menggandakan sebagian
     lain, tanpa pernah tahu. */
  assert.ok(!/\.offset\(/.test(KUERI), 'memakai offset — baris akan bergeser antar permintaan');
  assert.ok(/asc\(conversations\.updatedAt\)/.test(KUERI),
    'urutan menurun membuat kursor menunjuk baris terbaru dan sisa riwayat tak terjangkau');
  assert.ok(/limit\(opsi\.batas \+ 1\)/.test(KUERI), 'tak meminta baris pengintip — adaLagi tak bisa jujur');
});

test('tanggal ngawur dijawab 400, bukan diabaikan', () => {
  assert.ok(/tafsirSejak\(/.test(LIST));
  assert.ok(/status: 400/.test(LIST), 'galat tanggal tak dijawab 400');
});

test('percakapan tenant lain dijawab 404, bukan 403', () => {
  /* Membedakan "tak ada" dari "bukan milikmu" membuat endpoint ini bisa
     dipakai memastikan sebuah id percakapan itu nyata. */
  assert.ok(/status: 404/.test(SATU));
  assert.ok(!/status: 403/.test(SATU));
});

test('transkrip menyertakan citations — arsip tanpa rujukan tak bisa diaudit', () => {
  /* "Kenapa ia menjawab begitu" selalu ditanyakan berbulan kemudian, saat
     tak ada lagi yang bisa merekonstruksi dokumen sumbernya. */
  assert.ok(/citations: messages\.citations/.test(SATU));
  assert.ok(/blocks: messages\.blocks/.test(SATU));
  assert.ok(/orderBy\(asc\(messages\.createdAt\)\)/.test(SATU), 'pesan tak terurut waktu');
});
