import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  AA_BESAR, AA_TEKS, bacaToken, bacaWarna, bulat, luminansi, rasio, rasioWarna, resolusi,
} from '../src/modules/core/kontras';
import { PASANGAN } from '../src/modules/core/kontras-pasangan';

/**
 * KONTRAS WCAG AA — dijaga tes, bukan dicatat di komentar.
 *
 * Sebelum ini rasio kontras ditulis sebagai komentar di nalar-ds.css
 * ("Slate 400 · 3.2:1 deco/icon"). Komentar tak ikut berubah saat warnanya
 * diubah, jadi ia berhenti benar tanpa memberi tanda apa pun — dan ternyata
 * memang sudah tak benar: --faint dipakai .microlabel sebagai TEKS 10px,
 * yang menuntut 4,5:1, bukan 3:1 milik hiasan.
 */

const CSS = readFileSync('src/app/nalar-ds.css', 'utf8');

function tokenTema(gelap: boolean): Record<string, string> {
  const dasar = bacaToken(CSS, ':root');
  return gelap ? { ...dasar, ...bacaToken(CSS, '[data-theme="dark"]') } : dasar;
}

/* ── rumusnya sendiri ────────────────────────────────────────────────── */

test('rasio kontras cocok dengan nilai rujukan WCAG', () => {
  // Hitam/putih adalah nilai maksimum yang didefinisikan spesifikasi.
  assert.equal(bulat(rasioWarna('#000000', '#FFFFFF')), 21);
  assert.equal(bulat(rasioWarna('#FFFFFF', '#FFFFFF')), 1);
  // Urutan argumen tak boleh berpengaruh — kalau berpengaruh, separuh
  // pasangan akan diperiksa terbalik dan lolos tanpa alasan.
  assert.equal(rasioWarna('#777777', '#FFFFFF'), rasioWarna('#FFFFFF', '#777777'));
  // Nilai yang sering dipakai sebagai patokan alat audit.
  assert.equal(bulat(rasioWarna('#767676', '#FFFFFF')), 4.5);
  assert.equal(bulat(rasioWarna('#949494', '#FFFFFF')), 3);
});

test('luminansi memakai koreksi gamma, bukan rata-rata linear', () => {
  /* Rata-rata linear (r+g+b)/3 memberi angka yang mirip untuk abu-abu dan
     sangat salah untuk warna jenuh — biru akan tampak jauh lebih terang
     dari yang dilihat mata, dan seluruh warna signal lolos palsu. */
  assert.ok(Math.abs(luminansi({ r: 255, g: 255, b: 255 }) - 1) < 1e-9);
  assert.equal(luminansi({ r: 0, g: 0, b: 0 }), 0);
  /* Urutan bobot kanal: hijau > merah > biru, dengan hijau ≈ 9,9× biru
     (0,7152 / 0,0722). Rata-rata linear akan membuat ketiganya sama. */
  const h = luminansi({ r: 0, g: 255, b: 0 });
  const m = luminansi({ r: 255, g: 0, b: 0 });
  const b = luminansi({ r: 0, g: 0, b: 255 });
  assert.ok(h > m && m > b, 'bobot kanal tak sesuai sRGB');
  assert.equal(Math.round((h / b) * 10) / 10, 9.9);
});

test('warna tak terbaca MELEMPAR, tidak dianggap hitam', () => {
  /* Memulangkan hitam diam-diam membuat warna salah tulis lolos sebagai
     kontras sempurna — kebalikan persis dari guna modul ini. */
  assert.equal(bacaWarna('bukan-warna'), null);
  assert.equal(bacaWarna('#12345'), null);
  assert.equal(bacaWarna('rgb(300, 0, 0)'), null);
  assert.throws(() => rasioWarna('salah', '#FFF'), /tak terbaca/);
  assert.throws(() => rasioWarna('#FFF', 'salah'), /tak terbaca/);
  // Bentuk yang sah tetap terbaca.
  assert.deepEqual(bacaWarna('#fff'), { r: 255, g: 255, b: 255 });
  assert.deepEqual(bacaWarna('rgb(15, 23, 42)'), { r: 15, g: 23, b: 42 });
});

/* ── pembaca token ───────────────────────────────────────────────────── */

test('token yang didahului KOMENTAR tetap terbaca', () => {
  /* Cacat ini nyata dan sempat lolos: di nalar-ds.css komentar ditulis
     SETELAH titik koma, jadi ia jatuh di awal segmen berikutnya. Pembaca
     yang membersihkan komentar belakangan melewatkan token itu, dan
     melaporkannya sebagai "tak bisa dihitung" — kegagalan yang terlihat
     seperti pengecualian yang disengaja, bukan seperti pembaca yang rusak. */
  const t = tokenTema(false);
  for (const nama of ['--muted', '--faint', '--signal', '--good', '--danger', '--bg']) {
    assert.ok(t[nama], `token hilang dari hasil baca: ${nama}`);
  }
  assert.throws(() => bacaToken(CSS, ':tidak-ada'), /tak ditemukan/);
});

test('rantai var() diselesaikan; color-mix TIDAK ditebak', () => {
  const t = tokenTema(false);
  // --signal → var(--wl-signal) → #2563EB
  assert.equal(resolusi(t, '--signal'), t['--wl-signal']);
  assert.ok(bacaWarna(resolusi(t, '--signal')!));
  /* color-mix bergantung pada latar yang ditumpuknya. Memperlakukannya
     sebagai warna padat akan melaporkan kontras yang tak pernah terjadi di
     layar, jadi ia dikembalikan null — dilewati secara terbuka, bukan
     ditebak. */
  assert.equal(resolusi(t, '--tint-signal'), null);
  assert.equal(resolusi(t, '--token-yang-tak-ada'), null);
});

/* ── penjagaan yang sebenarnya ───────────────────────────────────────── */

for (const [nama, gelap] of [['TERANG', false], ['GELAP', true]] as const) {
  test(`semua pasangan warna lulus WCAG AA — tema ${nama}`, () => {
    const t = tokenTema(gelap);
    const gagal: string[] = [];
    for (const p of PASANGAN) {
      const depan = resolusi(t, p.depan);
      const belakang = resolusi(t, p.belakang);
      // Pasangan yang tak bisa dihitung adalah KESALAHAN daftar, bukan izin
      // untuk melewatinya — kalau tidak, menghapus warna dari token akan
      // membuat pasangannya berhenti diperiksa tanpa satu tes pun gagal.
      assert.ok(depan, `${p.depan} tak menyelesaikan ke warna literal (tema ${nama})`);
      assert.ok(belakang, `${p.belakang} tak menyelesaikan ke warna literal (tema ${nama})`);

      const r = bulat(rasioWarna(depan, belakang));
      const min = p.besar ? AA_BESAR : AA_TEKS;
      if (r < min) gagal.push(`${p.depan} / ${p.belakang} = ${r}:1 (min ${min}) — ${p.pakai}`);
    }
    assert.deepEqual(gagal, [], `kontras di bawah AA pada tema ${nama}:\n  ${gagal.join('\n  ')}`);
  });
}

test('.microlabel tetap memakai --faint — daftar pasangan ikut kalau ini berubah', () => {
  /* Ambang 4,5:1 untuk --faint dipilih KARENA ia dipakai sebagai teks di
     .microlabel. Kalau kelas itu pindah ke token lain, alasannya hilang dan
     daftar pasangannya perlu ditinjau — bukan dibiarkan menjaga hal yang
     sudah tak ada. */
  assert.ok(/\.microlabel\{[^}]*color:var\(--faint\)/.test(CSS),
    '.microlabel tak lagi memakai --faint; tinjau kontras-pasangan.ts');
  assert.ok(/\.led\{[^}]*background:var\(--good-mark\)/.test(CSS),
    '.led tak lagi memakai --good-mark; tinjau ambang 3:1-nya');
});

test('token pembawa rasio di komentar tak lagi mengklaim angka usang', () => {
  /* Komentar yang menyebut rasio akan berhenti benar begitu warnanya diubah,
     dan tak ada yang memberi tahu. Yang boleh tinggal hanyalah angka yang
     memang sedang dijaga tes di atas. */
  const usang = ['3.2:1', '3.4:1', 'Slate 400 · 3.2'];
  for (const u of usang) {
    assert.ok(!CSS.includes(u), `komentar kontras usang masih ada: ${u}`);
  }
});
