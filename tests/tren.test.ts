import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { isiHariKosong, ringkasTren, tinggiBatang, MIN_HARI_TREN } from '../src/modules/usage/tren';

/**
 * TREN PEMAKAIAN — grafik yang salah tetap tergambar rapi.
 *
 * Tak satu pun kegagalan di bawah ini melempar. Semuanya menghasilkan grafik
 * yang terlihat wajar dan menceritakan hal yang tidak terjadi — dan grafik di
 * dashboard adalah hal yang paling jarang diperiksa ulang orang.
 */

const T = Date.parse('2026-07-31T10:00:00.000Z');

test('hari TANPA data diisi nol, bukan dihilangkan', () => {
  /* `group by day` di server tak mengembalikan hari tanpa aktivitas. Kalau
     deretnya digambar apa adanya, tiga hari sibuk yang tersebar sepanjang
     sebulan tampak seperti tiga hari berturut-turut — grafiknya menceritakan
     pertumbuhan yang tak pernah terjadi. */
  const t = isiHariKosong([
    { day: '2026-07-01', messages: 5 },
    { day: '2026-07-31', messages: 9 },
  ], 31, T);
  assert.equal(t.length, 31, 'panjang deret tak sama dengan jendela');
  assert.equal(t[0].hari, '2026-07-01');
  assert.equal(t[30].hari, '2026-07-31');
  assert.equal(t[0].pesan, 5);
  assert.equal(t[30].pesan, 9);
  // Semua di antaranya nol, bukan hilang.
  assert.equal(t.slice(1, 30).filter((x) => x.pesan !== 0).length, 0);
});

test('deret selalu sepanjang jendela dan berakhir HARI INI', () => {
  /* Sumbu waktu yang ikut menyusut saat data sedikit membuat dua tangkapan
     layar tak bisa dibandingkan — dan orang membandingkannya. */
  assert.equal(isiHariKosong([], 30, T).length, 30);
  assert.equal(isiHariKosong([], 7, T)[6].hari, '2026-07-31');
  assert.equal(isiHariKosong([], 1, T).length, 1);
  assert.throws(() => isiHariKosong([], 0, T), /minimal 1/);
});

test('urutan menaik, dan tanggal di luar jendela diabaikan', () => {
  const t = isiHariKosong([
    { day: '2020-01-01', messages: 999 },   // jauh di luar jendela
    { day: '2026-07-30', messages: 3 },
  ], 7, T);
  assert.equal(t.reduce((a, x) => a + x.pesan, 0), 3, 'data di luar jendela ikut terhitung');
  for (let i = 1; i < t.length; i++) assert.ok(t[i].hari > t[i - 1].hari, 'urutan tidak menaik');
});

test('hari yang muncul dua kali DIJUMLAHKAN, bukan ditimpa', () => {
  /* Sumber yang mengirim satu hari lebih dari sekali tak boleh diam-diam
     kehilangan salah satunya — kehilangan itu tak meninggalkan jejak. */
  const t = isiHariKosong([
    { day: '2026-07-31', messages: 4 },
    { day: '2026-07-31', messages: 6 },
  ], 3, T);
  assert.equal(t[2].pesan, 10);
});

test('arah tren MENOLAK menjawab saat paruh awal kosong', () => {
  /* Tenant baru selalu punya paruh awal nol. Membaginya menghasilkan
     "naik tak terhingga" — bukan cuma angka jelek, tapi janji pertumbuhan
     kepada orang yang baru memakai produknya sehari. */
  const titik = isiHariKosong([{ day: '2026-07-31', messages: 50 }], 30, T);
  const r = ringkasTren(titik);
  assert.equal(r.arah, null, 'arah disebut padahal paruh awal kosong');
  assert.equal(r.persen, null);
  assert.ok(Number.isFinite(r.rerata), 'rerata bukan angka berhingga');
  assert.equal(r.total, 50);
});

test('null (belum bisa tahu) BERBEDA dari datar (sudah tahu, tak berubah)', () => {
  const pendek = ringkasTren(isiHariKosong(
    Array.from({ length: 5 }, (_, i) => ({ day: `2026-07-2${i + 3}`, messages: 10 })), 5, T));
  assert.equal(pendek.arah, null, `jendela ${MIN_HARI_TREN} hari ke bawah tak boleh menyebut arah`);

  const rata = ringkasTren(Array.from({ length: 30 }, (_, i) => ({ hari: `d${i}`, pesan: 10 })));
  assert.equal(rata.arah, 'datar');
  assert.equal(rata.persen, 0);
});

test('naik dan turun terbaca, dan derau kecil disebut datar', () => {
  const naik = ringkasTren([
    ...Array.from({ length: 15 }, (_, i) => ({ hari: `a${i}`, pesan: 10 })),
    ...Array.from({ length: 15 }, (_, i) => ({ hari: `b${i}`, pesan: 30 })),
  ]);
  assert.equal(naik.arah, 'naik');
  assert.equal(naik.persen, 200);

  const turun = ringkasTren([
    ...Array.from({ length: 15 }, (_, i) => ({ hari: `a${i}`, pesan: 40 })),
    ...Array.from({ length: 15 }, (_, i) => ({ hari: `b${i}`, pesan: 10 })),
  ]);
  assert.equal(turun.arah, 'turun');
  assert.equal(turun.persen, -75);

  // 5% bukan tren, itu derau.
  const derau = ringkasTren([
    ...Array.from({ length: 15 }, (_, i) => ({ hari: `a${i}`, pesan: 100 })),
    ...Array.from({ length: 15 }, (_, i) => ({ hari: `b${i}`, pesan: 105 })),
  ]);
  assert.equal(derau.arah, 'datar');
});

test('puncak null saat tak ada aktivitas — bukan hari pertama bernilai 0', () => {
  /* Menampilkan "tersibuk: 1 Juli (0 pesan)" adalah angka yang benar secara
     hitungan dan menyesatkan sepenuhnya. */
  assert.equal(ringkasTren(isiHariKosong([], 30, T)).puncak, null);
  const r = ringkasTren(isiHariKosong([{ day: '2026-07-15', messages: 2 }], 30, T));
  assert.equal(r.puncak?.hari, '2026-07-15');
});

test('hari kosong bertinggi NOL, bukan tinggi minimum', () => {
  /* Batang kecil yang selalu terlihat membuat jeda panjang tampak seperti
     aktivitas rendah yang berkelanjutan, padahal tak ada apa-apa di sana. */
  assert.equal(tinggiBatang(0, 100), 0);
  assert.equal(tinggiBatang(5, 0), 0);      // tak ada puncak → tak ada batang
  assert.equal(tinggiBatang(100, 100), 100);
  // Nilai kecil tapi bukan nol tetap terlihat.
  assert.ok(tinggiBatang(1, 10_000) >= 2);
  assert.ok(tinggiBatang(1, 10_000) <= 100);
});

test('dashboard MENGISI hari kosong sebelum menggambar', () => {
  /* Kalau komponen memetakan `bd.data.daily` langsung ke batang, seluruh
     penjagaan di atas jadi tak terpakai — dan tak ada tes yang gagal. */
  const src = readFileSync('src/app/(app)/dashboard/page.tsx', 'utf8');
  assert.ok(/isiHariKosong\(bd\.data\.daily/.test(src),
    'dashboard tak mengisi hari kosong sebelum menggambar');
  assert.ok(!/data\.daily\.map\(/.test(src),
    'dashboard menggambar langsung dari daily — hari kosong akan hilang');
  // Arah tren hanya boleh tampil bila memang bisa dikatakan.
  assert.ok(/ringkas\.arah &&/.test(src), 'arah tren ditampilkan tanpa memeriksa null');
});
