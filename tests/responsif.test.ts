import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/**
 * RESPONSIF LAYAR SEMPIT.
 *
 * Kegagalan di sini punya bentuk yang khas: halaman jadi LEBIH LEBAR dari
 * layarnya, seluruh badan halaman bisa digeser ke samping, dan tiap kali
 * pengguna menggulir ke bawah ia menemukan isinya bergeser. Di desktop tak
 * satu pun dari ini terlihat, dan tak ada gerbang yang gagal karenanya.
 */

const TSX = execSync('git ls-files "src/app/**/*.tsx"', { encoding: 'utf8' })
  .trim().split('\n').filter(Boolean).map((f) => [f, readFileSync(f, 'utf8')] as const);
const SHELL = readFileSync('src/app/(app)/shell.css', 'utf8');
const DS = readFileSync('src/app/nalar-ds.css', 'utf8');

test('setiap tabel punya wadah gulir sendiri', () => {
  /* Tabel adalah satu-satunya elemen di aplikasi ini yang lebarnya ditentukan
     ISINYA, bukan wadahnya. Tanpa .table-wrap, tabel enam kolom mendorong
     seluruh halaman melebihi lebar layar — dan yang tergeser bukan hanya
     tabelnya, tapi semua yang ada di halaman itu. */
  const buruk: string[] = [];
  for (const [f, s] of TSX) {
    for (const m of s.matchAll(/className="table"/g)) {
      // Wadahnya ditulis di baris yang sama atau tepat sebelumnya.
      const mulai = Math.max(0, (m.index ?? 0) - 220);
      if (!s.slice(mulai, m.index).includes('table-wrap')) {
        buruk.push(`${f}:${s.slice(0, m.index).split('\n').length}`);
      }
    }
  }
  assert.deepEqual(buruk, [], `tabel tanpa wadah gulir:\n  ${buruk.join('\n  ')}`);
  assert.ok(/\.table-wrap\{ overflow-x:auto/.test(DS), '.table-wrap tak lagi menggulir');
});

test('ada titik henti PONSEL, bukan hanya tablet', () => {
  /* Sebelum kartu ini seluruh design system hanya punya satu @media, 920px.
     Layar 360px karenanya memakai tata letak yang sama dengan layar 900px. */
  const lebar = [...SHELL.matchAll(/@media \(max-width:(\d+)px\)/g)].map((m) => Number(m[1]));
  assert.ok(lebar.length >= 2, `hanya ${lebar.length} titik henti — ponsel tak tertangani`);
  assert.ok(Math.min(...lebar) <= 600,
    `titik henti tersempit ${Math.min(...lebar)}px — masih ukuran tablet, bukan ponsel`);
});

test('kartu statistik jadi SATU kolom di ponsel', () => {
  /* Dua kolom di 360px berarti 150px per kartu, dan angka 30px di dalamnya
     terpotong atau membungkus jadi dua baris yang tak terbaca. */
  const ponsel = SHELL.slice(SHELL.indexOf('@media (max-width:560px)'));
  assert.ok(ponsel.length > 0, 'blok ponsel hilang');
  assert.ok(/\.g4\{ grid-template-columns:1fr; \}/.test(ponsel),
    '.g4 masih lebih dari satu kolom di ponsel');
});

test('token panjang tanpa spasi bisa dipatahkan', () => {
  /* Kunci publik cb_live_…, API key, dan URL webhook tak punya tempat untuk
     dipatahkan. Ini satu-satunya luberan yang TAK tertolong wadah gulir,
     karena yang meluber adalah teks di dalam paragraf biasa. */
  assert.ok(/code, \.mono\{ overflow-wrap:anywhere; \}/.test(SHELL),
    'token panjang akan mendorong halaman melebihi lebar layar');
});

test('sasaran sentuh tak mengecil di ponsel', () => {
  /* 32px sudah di bawah anjuran, dan justru di ponsel orang menekannya
     dengan jari, bukan menunjuknya dengan tetikus. */
  const ponsel = SHELL.slice(SHELL.indexOf('@media (max-width:560px)'));
  assert.ok(/\.rowact \.icon-btn\{ width:40px; height:40px; \}/.test(ponsel),
    'tombol ikon baris tetap 32px di ponsel');
});

test('tak ada lebar TETAP yang melebihi layar ponsel', () => {
  /* Nilai px tetap di atas ~360 akan memaksa halaman melebar apa pun
     tata letaknya. Yang dipakai di sini harus relatif (%, vw, min(), fr)
     atau berada di dalam @media. */
  const buruk: string[] = [];
  for (const [nama, css] of [['shell.css', SHELL], ['nalar-ds.css', DS]] as const) {
    for (const m of css.matchAll(/(?<!max-|min-)width:(\d{3,})px/g)) {
      const px = Number(m[1]);
      if (px <= 360) continue;
      // Di dalam min()/clamp() nilainya cuma batas atas — itu aman.
      const sekitar = css.slice(Math.max(0, (m.index ?? 0) - 20), m.index);
      if (/min\(|clamp\(/.test(sekitar)) continue;
      buruk.push(`${nama}: ${m[0]}`);
    }
  }
  assert.deepEqual(buruk, [], `lebar tetap melebihi layar ponsel:\n  ${buruk.join('\n  ')}`);
});

test('sidebar tetap bisa dibuka di layar sempit', () => {
  /* Sidebar disembunyikan di bawah 920px; kalau tombol hamburger ikut
     tersembunyi, seluruh navigasi hilang dan aplikasinya jadi satu halaman
     tanpa jalan keluar. */
  assert.ok(/\.hamb\{ display:none; \}/.test(SHELL));
  assert.ok(/@media \(max-width:920px\)\{ \.hamb\{ display:grid; \} \}/.test(SHELL),
    'hamburger tak muncul saat sidebar disembunyikan');
});
