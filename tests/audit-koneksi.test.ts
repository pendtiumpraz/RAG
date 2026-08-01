import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { pindai } from '../scripts/audit-koneksi.mjs';

/**
 * TAK ADA YANG BOLEH MENGAMBIL KONEKSI KEDUA DI DALAM TRANSAKSI.
 *
 * Di Vercel kolam koneksi dipatok `max: 1`. Selama sebuah transaksi terbuka,
 * ia MEMEGANG satu-satunya koneksi. Apa pun di dalamnya yang meminta koneksi
 * lagi — dan DITUNGGU — menunggu koneksi yang takkan pernah dilepas sampai
 * dirinya sendiri selesai. Permintaannya MENGGANTUNG tanpa ujung: bukan
 * galat, bukan lambat, tapi diam selamanya.
 *
 * DUA KEJADIAN NYATA, DUA BENTUK BERBEDA:
 *   1 Agu 2026 — dispatch() di dalam withTenant() pada tambah/hapus/pulihkan
 *   chatbot. Handlernya memanggil fanout(), yang membuka transaksi kedua.
 *   2 Agu 2026 — audit() di dalam withTenant() pada ubah peran anggota,
 *   keluarkan anggota, buat koneksi SSO, dan dua tulis backlog. audit()
 *   membuka withTenant sendiri (guardrails L5).
 *
 * Yang kedua ditemukan HANYA setelah pemindainya diperbaiki: `audit` diimpor,
 * dan simbol di titik panggil adalah ALIAS yang deklarasinya cuma baris
 * `import` — bukan badan fungsinya. Sebelum resolusi alias dipasang,
 * pemindainya melaporkan "0 temuan" dengan penuh percaya diri sementara lima
 * kebuntuan duduk di jalur CRUD.
 *
 * Itu sebabnya berkas ini berisi KONTROL, bukan cuma pemindaian: angka nol
 * dari alat yang tak pernah dibuktikan menggigit tidak berarti apa pun.
 */

test('tak ada yang mengambil koneksi kedua di dalam transaksi', () => {
  const h = pindai();
  assert.ok(h.situs.length > 100, `hanya ${h.situs.length} badan transaksi terpindai — penelusurannya rusak`);
  assert.deepEqual(h.buntu.map((t: { di: string; dalam: string }) => `${t.di} → ${t.dalam}`), [],
    'Ada yang meminta koneksi kedua DI DALAM transaksi dan menunggunya. Di Vercel '
    + '(kolam max:1) permintaan itu MENGGANTUNG tanpa ujung. Pindahkan ke LUAR transaksi.');
});

test('tak ada I/O eksternal yang menahan koneksi di dalam transaksi', () => {
  /* Bukan kebuntuan, tapi sebuah fetch yang lambat menahan SATU-SATUNYA
     koneksi selama seluruh perjalanan HTTP-nya — dan kalau lawannya tak
     menjawab, lambda mati membawa transaksi yang belum commit. */
  const h = pindai();
  assert.deepEqual(h.io.map((t: { di: string; dalam: string }) => `${t.di} → ${t.dalam}`), []);
});

/* ── kontrol: buktikan pemindainya menggigit ──────────────────────────── */

test('KONTROL — bentuk 1 Agu (dispatch di dalam transaksi) terdeteksi', () => {
  const h = pindai({ kontrol: 'dispatch' });
  assert.equal(h.buntu.length, 1, 'bentuk yang persis jadi bug pertama tidak terdeteksi');
  assert.match(h.buntu[0].dalam, /dispatch/);
});

test('KONTROL — bentuk 2 Agu (fungsi DIIMPOR yang buka transaksi) terdeteksi', () => {
  /* Inilah yang lolos sampai getAliasedSymbol dipasang. Tanpa kontrol ini,
     regresi yang sama kembali diam-diam dan pemindainya tetap menjawab nol. */
  const h = pindai({ kontrol: 'lintasModul' });
  assert.equal(h.buntu.length, 1, 'panggilan lintas-modul tak terlihat — resolusi alias mati lagi');
  assert.match(h.buntu[0].dalam, /audit/);
});

test('KONTROL — fetch di dalam transaksi terdeteksi', () => {
  const h = pindai({ kontrol: 'fetch' });
  assert.equal(h.io.length, 1);
});

test('KONTROL NEGATIF — bentuk yang BENAR tidak ditandai', () => {
  /* Pemindai yang menandai kode benar akan dimatikan orang dalam seminggu,
     dan matinya permanen. */
  const h = pindai({ kontrol: 'benar' });
  assert.deepEqual(h.buntu, []);
  assert.deepEqual(h.io, []);
});

/* ── sebab hulunya, supaya alasannya tak hilang ───────────────────────── */

test('kolam koneksi memang 1 di Vercel — itu yang membuatnya buntu', () => {
  const db = readFileSync('src/modules/core/db/index.ts', 'utf8');
  assert.ok(/max: process\.env\.VERCEL \? 1 : 10/.test(db),
    'kolam koneksi berubah — periksa ulang apakah kebuntuan ini masih mungkin');
});

test('audit() MEMANG membuka transaksinya sendiri', () => {
  /* Kalau suatu hari audit menerima `tx`, larangan memanggilnya di dalam
     transaksi kehilangan alasannya — dan aturan tanpa alasan adalah aturan
     yang dilanggar orang berikutnya. */
  const g = readFileSync('src/modules/core/guardrails.ts', 'utf8');
  const blok = g.slice(g.indexOf('export async function audit('));
  assert.ok(/withTenant\(/.test(blok.slice(0, 600)),
    'audit tak lagi membuka transaksi — tinjau ulang larangan di berkas ini');
});

test('fanout MEMANG membuka transaksi sendiri — itu sebab dispatch dilarang', () => {
  const wh = readFileSync('src/modules/integrations/webhook.service.ts', 'utf8');
  const i = wh.indexOf('async fanout(');
  assert.ok(/withTenant\(/.test(wh.slice(i, i + 500)),
    'fanout tak lagi menyentuh basis data — tinjau ulang larangan dispatch-dalam-transaksi');
});
