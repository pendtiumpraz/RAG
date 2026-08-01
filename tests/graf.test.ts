import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { lingkaran, perChatbot, susunGraf } from '../src/modules/knowledge/graf';

/**
 * GRAF PENGETAHUAN.
 *
 * Bentuk kegagalan yang paling berbahaya di sebuah graf bukan "gambarnya
 * jelek" — melainkan GARIS YANG TAK PERNAH ADA. Orang mempercayai peta justru
 * karena ia digambar, dan hubungan yang disimpulkan keliru akan dipakai
 * mengambil keputusan ("KB ini cuma dipakai satu chatbot, aman kuhapus").
 */

const bot = (id: string) => ({ id, nama: `Bot ${id}` });
const kb = (id: string, potongan = 10) => ({ id, nama: `KB ${id}`, potongan });

/* ── tata letak ──────────────────────────────────────────────────────── */

test('lingkaran dimulai dari ATAS, bukan dari kanan', () => {
  /* Mata membaca lingkaran dari puncaknya; simpul pertama yang mendarat di
     sisi kanan membuat urutannya terasa acak walau sebenarnya tidak. */
  const t = lingkaran(4, 100, { x: 0, y: 0 });
  assert.ok(Math.abs(t[0].x) < 1e-9, `simpul pertama tak di puncak: ${JSON.stringify(t[0])}`);
  assert.ok(t[0].y < 0, 'simpul pertama tidak di atas pusat');
});

test('satu simpul ditaruh di TENGAH, bukan di tepi', () => {
  /* Titik tunggal di pinggir lingkaran kosong terbaca sebagai kesalahan
     gambar, bukan sebagai satu-satunya simpul yang ada. */
  assert.deepEqual(lingkaran(1, 100, { x: 50, y: 60 }), [{ x: 50, y: 60 }]);
  assert.deepEqual(lingkaran(0, 100, { x: 0, y: 0 }), []);
});

test('simpul tersebar merata dan berjarak sama dari pusat', () => {
  const p = { x: 200, y: 200 };
  const t = lingkaran(6, 80, p);
  for (const q of t) {
    const r = Math.hypot(q.x - p.x, q.y - p.y);
    assert.ok(Math.abs(r - 80) < 1e-9, `jari-jari meleset: ${r}`);
  }
  assert.equal(new Set(t.map((q) => `${q.x.toFixed(3)},${q.y.toFixed(3)}`)).size, 6, 'ada simpul bertumpuk');
});

/* ── inti: tak boleh ada garis yang tak pernah ada ───────────────────── */

test('sisi yang menunjuk simpul TAK DIKENAL dibuang', () => {
  /* Tanpa FK (Rule #2), baris assignment bisa menunjuk chatbot atau KB yang
     sudah di-soft-delete. Menggambarnya menghasilkan garis berujung di
     kehampaan — dan, lebih buruk, membuat "dipakai bersama" terhitung lebih
     banyak daripada kenyataannya. */
  const g = susunGraf({
    chatbot: [bot('a')], kb: [kb('k1')],
    sisi: [
      { chatbotId: 'a', kbId: 'k1' },
      { chatbotId: 'hantu', kbId: 'k1' },
      { chatbotId: 'a', kbId: 'kb-hantu' },
    ],
    lebar: 900, tinggi: 600,
  });
  assert.deepEqual(g.sisi, [{ chatbotId: 'a', kbId: 'k1' }]);
  assert.equal(g.berbagi.size, 0, 'sisi hantu membuat KB terhitung dipakai bersama');
});

test('"berbagi" = KB yang dipakai LEBIH DARI SATU chatbot', () => {
  const g = susunGraf({
    chatbot: [bot('a'), bot('b'), bot('c')],
    kb: [kb('bersama'), kb('sendiri')],
    sisi: [
      { chatbotId: 'a', kbId: 'bersama' },
      { chatbotId: 'b', kbId: 'bersama' },
      { chatbotId: 'c', kbId: 'sendiri' },
    ],
    lebar: 900, tinggi: 600,
  });
  assert.deepEqual([...g.berbagi], ['bersama']);
});

test('sisi KEMBAR tidak membuat satu chatbot terhitung dua', () => {
  /* Baris assignment ganda bisa lahir dari penyimpanan berulang. Kalau
     dihitung sebagai dua chatbot, KB yang cuma dipakai SATU chatbot akan
     ditandai "dipakai bersama" — dan orang jadi takut menyuntingnya. */
  const g = susunGraf({
    chatbot: [bot('a')], kb: [kb('k')],
    sisi: [{ chatbotId: 'a', kbId: 'k' }, { chatbotId: 'a', kbId: 'k' }],
    lebar: 900, tinggi: 600,
  });
  assert.equal(g.berbagi.size, 0, 'sisi kembar terhitung dua chatbot berbeda');
});

/* ── yang yatim: justru ini yang paling perlu terlihat ───────────────── */

test('chatbot tanpa KB dan KB tanpa chatbot dikenali', () => {
  /* Keduanya biasanya kesalahan pemasangan: chatbot tanpa pengetahuan
     menjawab "tidak ada di dokumen" untuk segalanya, dan KB tanpa chatbot tak
     pernah dibaca siapa pun — tapi tetap memakan kuota penyimpanan. */
  const g = susunGraf({
    chatbot: [bot('pakai'), bot('kosong')],
    kb: [kb('dipakai'), kb('nganggur')],
    sisi: [{ chatbotId: 'pakai', kbId: 'dipakai' }],
    lebar: 900, tinggi: 600,
  });
  assert.deepEqual([...g.chatbotYatim], ['kosong']);
  assert.deepEqual([...g.kbYatim], ['nganggur']);
});

/* ── mode per chatbot ────────────────────────────────────────────────── */

test('chatbot TANPA KB tetap muncul, dengan daftar kosong', () => {
  /* Membuangnya menyembunyikan persis kasus yang paling perlu dilihat. */
  const hasil = perChatbot({
    chatbot: [bot('a'), bot('kosong')], kb: [kb('k')],
    sisi: [{ chatbotId: 'a', kbId: 'k' }],
  });
  assert.equal(hasil.length, 2);
  assert.deepEqual(hasil.find((h) => h.chatbot.id === 'kosong')?.kb, []);
  assert.equal(hasil.find((h) => h.chatbot.id === 'a')?.kb.length, 1);
});

test('KB yang tak dikenal tak muncul di kelompok mana pun', () => {
  const hasil = perChatbot({
    chatbot: [bot('a')], kb: [], sisi: [{ chatbotId: 'a', kbId: 'hantu' }],
  });
  assert.deepEqual(hasil[0].kb, []);
});

/* ── penyaringan divisi ──────────────────────────────────────────────── */

test('graf DISARING divisi — bukan jalan memutar melihat semua chatbot', () => {
  /* Tanpa ini, graf jadi cara termudah melihat seluruh chatbot tenant lengkap
     dengan nama dan pengetahuannya — tepat setelah divisi dibangun untuk
     mencegah itu. */
  const route = readFileSync('src/app/api/graf/route.ts', 'utf8');
  assert.ok(/divisionService\.aktor\(user\)/.test(route), 'graf tak menyaring divisi');
  assert.ok(/chatbotService\.list\(user\.tenantId, aktor\)/.test(route),
    'daftar chatbot tidak lewat jalur yang menyaring divisi');
  assert.ok(/idBoleh\.has\(s\.chatbotId\)/.test(route),
    'sisi milik chatbot terlarang ikut terkirim — jumlahnya tetap bisa dihitung dari situ');
});

test('graf tak MENYIMPULKAN hubungan, hanya membaca assignment', () => {
  const route = readFileSync('src/app/api/graf/route.ts', 'utf8');
  assert.ok(/from\(chatbotKnowledgeBases\)/.test(route));
  // Tak ada pencocokan berdasarkan nama, kemiripan, atau tebakan apa pun.
  assert.ok(!/ilike|similar|levenshtein/i.test(route), 'ada hubungan yang ditebak, bukan dibaca');
});

test('SVG digambar tanpa pustaka graf', () => {
  /* Peta puluhan simpul tak menuntut mesin tata letak, dan menambah pustaka
     berarti menambah berat halaman untuk sesuatu yang bisa dihitung dengan
     sinus-kosinus. */
  const page = readFileSync('src/app/(app)/graf/page.tsx', 'utf8');
  assert.ok(/<svg/.test(page));
  assert.ok(!/d3|cytoscape|vis-network|react-flow/i.test(page), 'memakai pustaka graf');
  // Garis digambar SEBELUM simpul, kalau tidak ia memotong label.
  assert.ok(page.indexOf('<line') < page.indexOf('<circle'), 'garis digambar di atas simpul');
});
