import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * SEMUA ALERT LEWAT SATU PINTU — SweetAlert2 bergaya platform.
 *
 * Dialog bawaan peramban (`confirm`/`alert`/`prompt`) tak bisa ditata sama
 * sekali: font sistem, tombol sistem, dan nama domain tercetak di judulnya.
 * Jadi tepat pada momen paling menegangkan — menghapus KB, mencabut kunci API,
 * memutar rahasia tanda tangan — produk ini berubah rupa jadi kotak abu-abu
 * asing, dan pada halaman white-label ia bahkan membocorkan bahwa yang di
 * baliknya bukan situs pemiliknya. Ia juga memblokir thread utama dan tak bisa
 * diuji.
 *
 * Semuanya sudah diganti (13 pemanggil + 1 di panel plugin). Tes ini menjaga
 * agar tak ada yang kembali diam-diam — satu `confirm()` baru di sebuah PR
 * takkan terlihat pada review, tapi akan terlihat di sini.
 */

const AKAR = 'src/app';
const KECUALI = new Set(['node_modules', '.next']);

function berkasUi(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (KECUALI.has(e)) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) berkasUi(p, out);
    else if (p.endsWith('.tsx') || p.endsWith('.ts')) out.push(p);
  }
  return out;
}

/* Pemanggilan telanjang `confirm(`/`alert(`/`prompt(` — dengan penjaga di
   depannya supaya `konfirmasi(`, `.alert(`, dan `swal.fire(` tak ikut kena. */
const TERLARANG = /(^|[^.\w$])(confirm|alert|prompt)\s*\(/;

test('tak ada dialog bawaan peramban di seluruh UI', () => {
  const pelanggar: string[] = [];
  for (const p of berkasUi(AKAR)) {
    const isi = readFileSync(p, 'utf8');
    isi.split(/\r?\n/).forEach((baris, i) => {
      if (baris.trimStart().startsWith('*') || baris.trimStart().startsWith('//')) return;
      if (TERLARANG.test(baris)) pelanggar.push(`${p}:${i + 1}  ${baris.trim().slice(0, 90)}`);
    });
  }
  assert.deepEqual(pelanggar, [],
    'pakai konfirmasi()/beritahu()/tanya() dari _components/alert, bukan dialog bawaan peramban:\n'
    + pelanggar.join('\n'));
});

test('toast platform memakai SweetAlert, bukan simpul buatan sendiri', () => {
  const ui = readFileSync('src/app/_components/ui.tsx', 'utf8');
  assert.match(ui, /toastPlatform/, 'ToastProvider tak lagi memakai toast platform');
  assert.doesNotMatch(ui, /className=\{?`?toast/,
    'masih ada simpul toast lama di ui.tsx — dua sistem toast berarti dua rupa yang pasti menyimpang');
});

test('dialog memakai tombol design system, bukan tombol bawaan SweetAlert', () => {
  const alert = readFileSync('src/app/_components/alert.tsx', 'utf8');
  assert.match(alert, /buttonsStyling:\s*false/,
    'tanpa buttonsStyling:false, SweetAlert menggambar tombolnya sendiri dan dialog menyimpang dari platform');
  assert.match(alert, /confirmButton:\s*'btn btn-primary'/, 'tombol utama harus memakai kelas .btn platform');
});

test('penataan dialog hanya memakai token, supaya ikut mode gelap & white-label', () => {
  const css = readFileSync('src/app/nalar-ds.css', 'utf8');
  const mulai = css.indexOf('.nalar-swal-wadah');
  assert.ok(mulai > 0, 'blok penataan dialog tak ditemukan di nalar-ds.css');
  const blok = css.slice(mulai, css.indexOf('@media (prefers-reduced-motion', mulai));
  /* Warna harfiah (#rrggbb / rgb()) akan membeku pada satu tema dan satu brand;
     token ikut berubah sendiri. */
  const harfiah = blok.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g) ?? [];
  assert.deepEqual(harfiah, [],
    `penataan dialog memakai warna harfiah: ${harfiah.join(', ')} — pakai var(--…) supaya ikut tema tenant`);
});
