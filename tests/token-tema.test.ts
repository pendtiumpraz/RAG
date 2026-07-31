import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/**
 * TOKEN TEMA — variabel yang dipakai tapi tak pernah ada.
 *
 * Ini bentuk kegagalan mode gelap yang paling sering, dan yang paling sunyi.
 * `var(--tidak-ada)` TANPA fallback membuat seluruh deklarasinya tidak sah,
 * dan peramban membuangnya diam-diam: bukan galat, bukan peringatan, hanya
 * garis yang hilang atau huruf yang berubah. Dengan fallback lebih halus lagi
 * — nilainya tetap terpakai, tapi ia nilai TETAP yang tak ikut berganti tema,
 * jadi ia benar di satu tema dan salah di tema lain.
 *
 * Tiga cacat nyata ditemukan tes ini saat ditulis:
 *   • `var(--border)` di knowledge — tak pernah ada, tanpa fallback, sehingga
 *     garis putus-putus penanda "ada penjelasan" hilang di kedua tema.
 *   • `var(--surface-2, rgba(0,0,0,.04))` di TwoFactor — hitam transparan di
 *     atas panel GELAP; kotak kunci rahasia kehilangan latarnya.
 *   • `var(--font-sans)` di dataroom — namanya --font-ui, jadi teks slide
 *     kehilangan huruf brand sepenuhnya.
 */

const BERKAS = execSync('git ls-files "src/app/**/*.tsx" "src/app/**/*.css" "src/app/*.css"',
  { encoding: 'utf8' }).trim().split('\n').filter(Boolean);

const DS = readFileSync('src/app/nalar-ds.css', 'utf8');
const SHELL = readFileSync('src/app/(app)/shell.css', 'utf8');

/** Token yang didefinisikan design system — berlaku di seluruh aplikasi. */
const GLOBAL = new Set([...(DS + SHELL).matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));

/** Token yang didefinisikan/disetel di dalam satu berkas atau saudaranya. */
function lokal(f: string): Set<string> {
  const isi = readFileSync(f, 'utf8');
  const set = new Set([...isi.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
  // Berkas CSS sering dipasangkan dengan komponen yang menyetel tokennya
  // lewat `style={{ ['--x']: … }}` — keduanya satu unit.
  const saudara = BERKAS.filter((g) => g !== f
    && g.replace(/\.(tsx|css)$/, '') === f.replace(/\.(tsx|css)$/, '').replace(/\/[^/]+$/, (m) => m));
  for (const g of [...saudara, ...BERKAS.filter((g) => g.startsWith(f.replace(/\/[^/]+$/, '/')))]) {
    for (const m of readFileSync(g, 'utf8').matchAll(/\['(--[\w-]+)'/g)) set.add(m[1]);
    for (const m of readFileSync(g, 'utf8').matchAll(/(--[\w-]+)\s*:/g)) set.add(m[1]);
  }
  return set;
}

test('tak ada var(--x) tanpa fallback yang tokennya tak pernah didefinisikan', () => {
  /* Tanpa fallback, deklarasinya TIDAK SAH dan dibuang peramban — diam-diam.
     Yang hilang biasanya garis, latar, atau huruf: hal-hal yang tak membuat
     apa pun gagal, hanya membuat sesuatu terlihat "agak aneh". */
  const buruk: string[] = [];
  for (const f of BERKAS) {
    const isi = readFileSync(f, 'utf8');
    const diberkas = lokal(f);
    for (const m of isi.matchAll(/var\((--[\w-]+)\s*(,?)/g)) {
      const [, nama, koma] = m;
      if (koma === ',') continue;                    // punya fallback — dibahas uji berikutnya
      if (GLOBAL.has(nama) || diberkas.has(nama)) continue;
      buruk.push(`${f.replace('src/app/', '')}: var(${nama})`);
    }
  }
  assert.deepEqual(buruk, [], `token tak terdefinisi:\n  ${buruk.join('\n  ')}`);
});

test('fallback tak boleh berupa WARNA TETAP yang tak ikut berganti tema', () => {
  /* `var(--tidak-ada, rgba(0,0,0,.04))` tetap terpakai, dan justru itu
     masalahnya: nilainya tetap, jadi ia benar di satu tema dan salah di tema
     lain. Fallback yang sah adalah token LAIN (yang ikut berganti) atau nilai
     non-warna seperti daftar huruf. */
  const buruk: string[] = [];
  for (const f of BERKAS) {
    const isi = readFileSync(f, 'utf8');
    const diberkas = lokal(f);
    for (const m of isi.matchAll(/var\((--[\w-]+)\s*,\s*([^)]+)\)/g)) {
      const [, nama, fallback] = m;
      if (GLOBAL.has(nama) || diberkas.has(nama)) continue;  // tokennya ada; fallback tak terpakai
      if (!/#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\(/.test(fallback)) continue;   // bukan warna
      buruk.push(`${f.replace('src/app/', '')}: var(${nama}, ${fallback.trim()})`);
    }
  }
  assert.deepEqual(buruk, [],
    `warna tetap menyamar jadi token tema:\n  ${buruk.join('\n  ')}`);
});

test('nama token huruf memang yang dipakai design system', () => {
  /* --font-sans tak pernah ada; namanya --font-ui. Kekeliruan nama tak
     menghasilkan galat apa pun, hanya huruf yang berubah jadi bawaan
     peramban — dan itu paling terlihat justru di slide yang diekspor. */
  for (const t of ['--font-ui', '--font-display', '--font-mono']) {
    assert.ok(GLOBAL.has(t), `token huruf hilang dari design system: ${t}`);
  }
  const semua = BERKAS.map((f) => readFileSync(f, 'utf8')).join('\n');
  assert.ok(!/--font-sans/.test(semua), '--font-sans dipakai lagi; namanya --font-ui');
});

test('kedua tema mendefinisikan token yang SAMA', () => {
  /* Token yang hanya ada di :root akan memakai nilai TERANG saat tema gelap
     aktif — sering tak terlihat sampai seseorang membuka halaman itu di
     malam hari. */
  const ambil = (pemilih: string) => {
    const i = DS.indexOf(pemilih);
    const buka = DS.indexOf('{', i);
    const tutup = DS.indexOf('}', buka);
    return new Set([...DS.slice(buka, tutup).matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
  };
  const terang = ambil(':root');
  const gelap = ambil('[data-theme="dark"]');

  /* Token yang SENGAJA tak ditimpa: nilainya memang sama di kedua tema
     (jarak, radius, huruf, durasi) atau ia turunan dari token lain yang
     sudah ditimpa. Yang diperiksa hanya WARNA SEMANTIK. */
  const wajibDitimpa = ['--bg', '--panel', '--card', '--line', '--ink', '--muted',
    '--faint', '--on-signal', '--good', '--warn', '--danger', '--overlay'];
  const hilang = wajibDitimpa.filter((t) => terang.has(t) && !gelap.has(t));
  assert.deepEqual(hilang, [],
    `token warna tak ditimpa di tema gelap:\n  ${hilang.join('\n  ')}`);
});

test('kuitansi TETAP putih di tema gelap — dan itu disengaja', () => {
  /* Satu-satunya tempat warna tetap memang benar: dokumen yang DICETAK.
     Yang tercetak harus sama dengan yang disepakati, apa pun tema perangkat
     yang membukanya. Uji ini ada supaya pengecualian itu tetap disengaja,
     bukan terbawa jadi kebiasaan. */
  const css = readFileSync('src/app/(app)/kuitansi/[id]/kuitansi.css', 'utf8');
  assert.ok(/\[data-theme="dark"\] \.kw\{ background:#fff; color:#0F172A; \}/.test(css),
    'kuitansi ikut gelap — hasil cetaknya jadi berbeda dari yang dilihat');
});
