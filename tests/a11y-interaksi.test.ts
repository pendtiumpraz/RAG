import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/**
 * AKSESIBILITAS INTERAKSI — label, dialog, dan kontrol yang bisa dijangkau.
 *
 * Semua cacat yang dijaga di sini TIDAK TERLIHAT di layar. Label yang terputus
 * dari inputnya tampak sempurna; dialog tanpa jebakan fokus tampak sempurna;
 * `<a onClick>` tanpa href tampak persis seperti tautan. Yang membedakan hanya
 * bisa-tidaknya sesuatu dipakai tanpa tetikus atau tanpa melihat — dan itu tak
 * pernah muncul di tinjauan kode maupun tangkapan layar.
 */

const BERKAS = execSync('git ls-files "src/app/**/*.tsx"', { encoding: 'utf8' })
  .trim().split('\n').filter(Boolean);
const SUMBER = BERKAS.map((f) => [f, readFileSync(f, 'utf8')] as const);
const UI = readFileSync('src/app/_components/ui.tsx', 'utf8');

/* ── label ───────────────────────────────────────────────────────────── */

test('tak ada <label> yang terputus dari kontrolnya', () => {
  /* `<div className="field"><label>Nama</label><input/></div>` — label sebagai
     SAUDARA input, tanpa htmlFor dan tanpa membungkusnya. Pembaca layar
     mengumumkan "kotak isian, kosong" tanpa menyebut ini kotak apa, dan
     mengeklik labelnya tak memindahkan fokus. Dulu ada 89 di aplikasi ini. */
  const buruk: string[] = [];
  for (const [f, s] of SUMBER) {
    // `<label>` polos: tanpa atribut sama sekali → tak mungkin punya htmlFor,
    // dan bentuk ini di basis kode ini selalu berarti label yang menganggur.
    for (const m of s.matchAll(/<label>/g)) {
      buruk.push(`${f}:${s.slice(0, m.index).split('\n').length}`);
    }
  }
  assert.deepEqual(buruk, [], `label tanpa asosiasi:\n  ${buruk.join('\n  ')}`);
});

test('Field menghubungkan label ke kontrol lewat id unik per instans', () => {
  /* id yang ditulis tangan akan kembar begitu satu komponen form muncul dua
     kali di satu halaman (dua drawer, dua kartu) — dan label yang menunjuk
     kontrol yang salah adalah bug aksesibilitas BARU yang dibuat oleh
     perbaikan aksesibilitas. */
  const fn = UI.slice(UI.indexOf('export function Field('), UI.indexOf('export function Drawer('));
  assert.ok(/const id = useId\(\)/.test(fn), 'Field tak memakai useId');
  assert.ok(/<label htmlFor=\{id\}>/.test(fn), 'label tak menunjuk id kontrolnya');
  assert.ok(/cloneElement\([\s\S]*?\{ id \}\)/.test(fn), 'id tak disuntikkan ke kontrolnya');
  /* Hanya elemen PERTAMA yang menerima id. Beberapa field menaruh petunjuk di
     bawah kontrolnya; menyuntikkan id ke semuanya membuat beberapa elemen
     berbagi id yang sama. */
  assert.ok(/if \(sudah \|\| !isValidElement\(c\)\) return c;/.test(fn),
    'id disuntikkan ke lebih dari satu anak');
});

test('label yang bukan untuk satu kontrol memakai span, bukan <label htmlFor>', () => {
  /* <label htmlFor> yang menunjuk elemen non-form adalah HTML tak sah, dan
     pembaca layar akan mengumumkan label untuk sesuatu yang tak bisa diisi. */
  const knowledge = readFileSync('src/app/(app)/knowledge/page.tsx', 'utf8');
  assert.ok(/<span className="field-label">Akun \{provider\}<\/span>/.test(knowledge));
  const css = readFileSync('src/app/nalar-ds.css', 'utf8');
  assert.ok(/\.field > label, \.field > \.field-label\{/.test(css),
    'field-label tak mendapat gaya yang sama dengan label');
});

/* ── dialog ──────────────────────────────────────────────────────────── */

test('tak ada lagi drawer yang mengaku dialog tanpa perilakunya', () => {
  /* role="dialog" + aria-modal="true" tanpa Escape/jebakan fokus LEBIH buruk
     daripada tak menuliskannya: teknologi bantu memercayai deklarasi itu,
     memberi tahu penggunanya "isinya terkurung", lalu penggunanya berpindah
     entah ke mana tanpa cara kembali. */
  const buruk: string[] = [];
  for (const [f, s] of SUMBER) {
    if (f.endsWith('_components/ui.tsx')) continue;   // definisinya sendiri
    if (!/aria-modal="true"/.test(s)) continue;
    // Menuliskannya sendiri boleh — asal perilakunya ikut dipasang.
    if (!/useDialogFokus\(/.test(s)) buruk.push(f);
  }
  assert.deepEqual(buruk, [],
    `aria-modal ditulis tanpa useDialogFokus:\n  ${buruk.join('\n  ')}`);
});

test('useDialogFokus menangani Escape, mengurung Tab, dan mengembalikan fokus', () => {
  const fn = UI.slice(UI.indexOf('export function useDialogFokus('), UI.indexOf('export function Drawer('));
  assert.ok(/e\.key === 'Escape'/.test(fn), 'Escape tak menutup drawer');
  assert.ok(/e\.key !== 'Tab'/.test(fn), 'Tab tak dikurung — fokus keluar ke halaman di belakang');
  assert.ok(/awal\.focus\(\)/.test(fn) && /akhir\.focus\(\)/.test(fn), 'putaran fokus tak lengkap');
  assert.ok(/sebelumnya\?\.focus\?\.\(\)/.test(fn),
    'fokus tak dikembalikan — pengguna papan ketik harus menelusuri halaman dari awal');
  assert.ok(/bisaFokus\(\)\[0\]\?\.focus\(\)/.test(fn), 'fokus tak dipindahkan ke dalam drawer');
});

test('efek dialog TIDAK bergantung pada onClose', () => {
  /* Hampir semua pemanggil mengirim fungsi anonim yang baru tiap render.
     Menjadikannya dependensi memasang ulang efek tiap ketikan, dan pemasangan
     ulang memindahkan fokus kembali ke kolom pertama di tengah orang
     mengetik — bug yang terasa seperti papan ketik rusak. */
  const fn = UI.slice(UI.indexOf('export function useDialogFokus('), UI.indexOf('export function Drawer('));
  const efek = fn.slice(fn.indexOf('useEffect('));
  assert.ok(/\}, \[\]\);/.test(efek), 'efek dialog punya dependensi — fokus akan melompat saat mengetik');
  assert.ok(/const tutup = useRef\(onClose\)/.test(fn), 'onClose tak disimpan di ref');
});

/* ── kontrol yang bisa dijangkau ─────────────────────────────────────── */

test('tak ada <a onClick> tanpa href', () => {
  /* Tampak persis seperti tautan, tapi tak bisa dijangkau Tab, tak punya
     peran tombol, dan Enter tak melakukan apa pun — aksi yang hanya ada bagi
     pengguna tetikus. */
  const buruk: string[] = [];
  for (const [f, s] of SUMBER) {
    for (const m of s.matchAll(/<a\s+onClick=/g)) {
      buruk.push(`${f}:${s.slice(0, m.index).split('\n').length}`);
    }
  }
  assert.deepEqual(buruk, [], `tautan palsu:\n  ${buruk.join('\n  ')}`);
});

test('setiap <img> punya atribut alt', () => {
  /* alt yang HILANG berbeda dari alt="" — yang pertama membuat pembaca layar
     membacakan nama berkasnya, yang kedua menyatakannya hiasan dengan sadar. */
  const buruk: string[] = [];
  for (const [f, s] of SUMBER) {
    for (const m of s.matchAll(/<img\b([\s\S]*?)\/>/g)) {
      if (!/\balt=/.test(m[1])) buruk.push(`${f}:${s.slice(0, m.index).split('\n').length}`);
    }
  }
  assert.deepEqual(buruk, [], `gambar tanpa alt:\n  ${buruk.join('\n  ')}`);
});

test('penanda fokus terlihat, dan outline tak dimatikan tanpa gantinya', () => {
  const css = readFileSync('src/app/nalar-ds.css', 'utf8');
  assert.ok(/:focus-visible\{ outline:2px solid/.test(css), 'tak ada penanda fokus');
  // `outline:none` hanya boleh pada :focus (bukan :focus-visible), karena
  // penggantinya ada di :focus-visible.
  assert.ok(!/:focus-visible\{[^}]*outline:none/.test(css),
    'outline dimatikan pada :focus-visible — fokus jadi tak terlihat sama sekali');
});

test('Drawer memakai hook itu, bukan menyalin logikanya', () => {
  /* Dua salinan perilaku dialog akan menyimpang, dan yang menyimpang adalah
     yang jarang dibuka — persis yang paling sulit ketahuan rusak. */
  const fn = UI.slice(UI.indexOf('export function Drawer('));
  assert.ok(/useDialogFokus\(onClose\)/.test(fn), 'Drawer tak memakai useDialogFokus');
  assert.ok(!/addEventListener/.test(fn), 'Drawer menyalin logika dialog alih-alih memakai hooknya');
});
