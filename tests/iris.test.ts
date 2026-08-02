import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

import { irisAntara, irisAturanCss, irisBlok } from './_iris';

/**
 * TES YANG MEMBACA KODE TIDAK BOLEH MENGIRIS JENDELA KARAKTER TETAP.
 *
 * Banyak tes di sini menegakkan aturan struktural dengan membaca berkas sumber
 * dan mencocokkan pola "di sekitar" sebuah penanda. Membatasi "di sekitar"
 * dengan menghitung karakter rusak secara diam-diam, ke DUA arah:
 *
 *   terlalu pendek → yang dicari terdorong keluar, tes GAGAL pada kode benar
 *   terlalu panjang → polanya ditemukan di fungsi lain, tes LULUS pada kode salah
 *
 * Dan jendelanya bergeser karena hal yang bahkan bukan kode. `divisi.test.ts`
 * menaruh `repo.countActive` di posisi 882 dari 900: lulus dengan akhiran baris
 * LF, gagal begitu berkasnya ditulis ulang dengan CRLF — satu byte per baris
 * sudah cukup. Ketahuan tanpa sengaja saat `git checkout` menormalkan akhiran
 * baris di tengah pekerjaan lain.
 *
 * Berkas ini menjaga dua hal: helper irisannya benar-benar bekerja (kontrol
 * positif DAN negatif), dan polanya tak diam-diam kembali.
 */

/* ── helper-nya sendiri ───────────────────────────────────────────────── */

const CONTOH = `
export const svc = {
  async create(tenantId: string) {
    const x = repo.countActive(tx, tenantId);
    return x;
  },

  async update(tenantId: string) {
    const y = this.list(tenantId);
    return y;
  },
};
`;

test('irisBlok berhenti di batas fungsi berikutnya', () => {
  const blok = irisBlok(CONTOH, 'async create(');
  assert.ok(/repo\.countActive/.test(blok), 'isi fungsinya sendiri hilang');
  assert.ok(!/this\.list/.test(blok),
    'irisan menembus ke fungsi berikutnya — asersi positif akan lolos terlalu mudah');
});

test('percabangan di dalam badan fungsi BUKAN batas', () => {
  /* `  if (x) return;` di badan fungsi tingkat atas berbentuk persis seperti
     `  namaMetode(` di dalam objek. Tanpa pengecualian kata kunci, irisannya
     berhenti di percabangan PERTAMA dan tesnya menuduh kode yang sudah benar —
     kejadian nyata saat helper ini dipakai memeriksa `mungkinRerank`. */
  const src = [
    'async function f(a: number) {',
    '  if (!a) return null;',
    '  for (const x of []) void x;',
    '  return hasilAkhir(a);',
    '}',
    '',
    'function g() { return 1; }',
  ].join('\n');
  const blok = irisBlok(src, 'async function f(');
  assert.ok(/hasilAkhir/.test(blok), 'irisan berhenti di percabangan pertama');
  assert.ok(!/function g\(\)/.test(blok), 'irisan menembus ke fungsi berikutnya');
});

test('irisBlok MELEMPAR bila batasnya tak dikenali', () => {
  /* Bentuk kegagalan yang paling berbahaya bukan "melempar", melainkan
     "mengembalikan sisa berkas" — asersi positif lalu menemukan polanya di
     mana saja dan tesnya berhenti menjaga apa pun tanpa satu pun tanda. */
  assert.throws(() => irisBlok('cuma teks biasa tanpa struktur', 'cuma'),
    /batas blok tak ditemukan/);
});

test('irisBlok MELEMPAR bila penandanya tak ada — bukan diam-diam kosong', () => {
  assert.throws(() => irisBlok(CONTOH, 'async tidakAda('), /penanda tak ditemukan/);
});

test('irisAntara dibatasi dua penanda eksplisit', () => {
  const blok = irisAntara(CONTOH, 'async create(', 'async update(');
  assert.ok(/repo\.countActive/.test(blok));
  assert.ok(!/this\.list/.test(blok));
});

test('irisAturanCss mengambil satu aturan utuh, tidak lebih', () => {
  const css = '.a{ color:red; }\n.b{ max-height:280px; overflow-y:auto; }\n.c{ color:blue; }';
  const blok = irisAturanCss(css, '.b{');
  assert.ok(/max-height:280px/.test(blok) && /overflow-y:auto/.test(blok));
  assert.ok(!/color:blue/.test(blok), 'irisan menembus ke aturan berikutnya');
});

/* ── polanya tak boleh kembali ────────────────────────────────────────── */

/**
 * Jendela tetap yang diterapkan pada TEKS SUMBER.
 *
 * Sengaja tidak melarang `.slice(i, i + n)` secara buta: memotong array atau
 * string data jadi blok berukuran tetap adalah hal yang sah dan sering benar
 * (mis. memecah payload jadi blok 7 byte di core.test.ts). Yang dilarang
 * adalah pola itu pada pembacaan kode sumber. Penanda `/* iris-bebas *​/`
 * menyediakan jalan keluar yang HARUS ditulis sadar.
 */
const POLA = /\.slice\(\s*([a-zA-Z_$][\w$]*)\s*,\s*\1\s*\+\s*\d[\d_]*\s*\)/g;

test('tak ada tes yang mengiris jendela karakter tetap dari kode sumber', () => {
  const temuan: string[] = [];
  for (const f of readdirSync('tests').filter((x) => x.endsWith('.ts'))) {
    const isi = readFileSync(`tests/${f}`, 'utf8');
    const baris = isi.split('\n');
    baris.forEach((b, i) => {
      POLA.lastIndex = 0;
      if (!POLA.test(b)) return;
      if (b.includes('iris-bebas')) return;                 // dikecualikan sadar
      /* Hanya berarti bila yang diiris adalah teks sumber. Variabel hasil
         readFileSync di berkas ini selalu huruf besar semua atau berakhiran
         yang jelas; alih-alih menebak namanya, kecualikan yang jelas-jelas
         memproses data biner/array. */
      if (/payload|buffer|bytes|chunkArr|\bbuf\b/i.test(b)) return;
      temuan.push(`tests/${f}:${i + 1}  ${b.trim()}`);
    });
  }
  assert.deepEqual(temuan, [],
    'Jendela karakter tetap dipakai untuk mengiris kode sumber. Pakai irisBlok/'
    + 'irisAntara/irisAturanCss dari tests/_iris.ts — atau tulis /* iris-bebas *'
    + '/ pada barisnya bila memang bukan kode sumber.\n' + temuan.join('\n'));
});

test('pemindainya MENGGIGIT bentuk yang dilarang', () => {
  /* Nol temuan dari pemindai yang tak pernah dibuktikan menggigit tidak
     berarti apa pun — pelajaran yang sudah dibayar beberapa kali di repo ini. */
  POLA.lastIndex = 0;
  assert.ok(POLA.test('  const blok = SVC.slice(i, i + 900);'));   // iris-bebas: contoh
  POLA.lastIndex = 0;
  assert.ok(POLA.test('assert.ok(/x/.test(route.slice(iCek, iCek + 300)));'));   // iris-bebas: contoh
  POLA.lastIndex = 0;
  assert.ok(!POLA.test('const blok = SVC.slice(i, j);'), 'irisan antar-penanda ikut ditandai');
  POLA.lastIndex = 0;
  assert.ok(!POLA.test('const blok = SVC.slice(a, b + 900);'), 'variabel berbeda ikut ditandai');
});
