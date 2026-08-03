import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * AUDIT KOMPONEN DI BUILD TERPASANG (kartu a-komponen-audit).
 *
 * Pada 2 Agu 2026 dropdown listbox — yang sudah ditulis ulang, dites unit, dan
 * dipakai di 27 titik — ternyata MENUTUP SENDIRI begitu dibuka. Hanya di build
 * terpasang; tidak di dev. Satu-satunya alasan ia ketahuan adalah kebetulan
 * ada yang mengekliknya di staging.
 *
 * Yang ditutup kartu itu bukan bugnya (itu sudah), melainkan CARA
 * MENEMUKANNYA. Berkas ini menjaga alat penemunya tetap tajam — dan ironinya
 * disadari: tes unit tak bisa membuktikan komponen bekerja di tata letak
 * nyata, jadi yang bisa dilakukan di sini hanyalah memastikan yang BISA
 * membuktikannya tak diam-diam dilemahkan.
 */

const ADEGAN = readFileSync('scripts/tur-adegan.mts', 'utf8');
/* Diiris dari TAHAN_MS, bukan dari `adeganKomponen`: helper langkahBertahan()
   berdiri di antara keduanya dan justru memuat pesan gagalnya. Irisan yang
   mulai terlalu bawah membuat asersi mencari teks di tempat yang salah lalu
   melaporkan komponen yang tak bersalah. */
const BLOK = ADEGAN.slice(ADEGAN.indexOf('const TAHAN_MS ='),
  ADEGAN.indexOf('export const adeganTerlindungi'));

test('adegan komponen benar-benar IKUT dijalankan', () => {
  /* Adegan yang ditulis tapi tak didaftarkan adalah pekerjaan yang terlihat
     selesai di diff dan tak pernah berjalan sekali pun. */
  assert.ok(/adeganKomponen,/.test(ADEGAN), 'adegan komponen tak masuk daftar tur');
});

test('MENUNGGU sebelum menyimpulkan komponen terbuka', () => {
  /* Inti seluruh kartu ini. Bug 2 Agu membuka popup lalu menutupnya sendiri
     dalam puluhan milidetik; memeriksa sesaat setelah klik akan menangkapnya
     dalam keadaan terbuka dan menyimpulkan semuanya baik. Yang membuktikan
     sebaliknya hanya menunggu. */
  assert.ok(/const TAHAN_MS = \d{3,}/.test(ADEGAN), 'tak ada jeda tahan sama sekali');
  const ms = Number(ADEGAN.match(/const TAHAN_MS = (\d+)/)?.[1] ?? 0);
  assert.ok(ms >= 500, `jeda ${ms}ms terlalu pendek untuk menangkap popup yang menutup sendiri`);
  assert.ok(/await page\.waitForTimeout\(TAHAN_MS\)/.test(ADEGAN), 'jedanya tak dipakai');
  assert.ok(/const masih = await target\.isVisible\(\)/.test(ADEGAN),
    'keterlihatan tak diperiksa ULANG setelah jeda — hanya sekali di awal');
});

test('kegagalan menyebut BENTUK bug-nya, bukan cuma "tak terlihat"', () => {
  /* Pesan gagal yang berbunyi "element not visible" mengirim yang membacanya
     mencari selektor yang salah. Yang benar mengirimnya ke kelas bug yang
     sudah pernah terjadi. */
  assert.ok(/MENUTUP SENDIRI/.test(BLOK));
  assert.ok(/tak terlihat di dev/.test(BLOK), 'tak menyebut kenapa dev tak menangkapnya');
});

test('pemicu dan sasaran WAJIB beda', () => {
  /* Memeriksa pemicunya sendiri hanya membuktikan tombolnya masih ada — dan
     itu benar bahkan saat popup-nya tak pernah muncul. */
  const panggilan = [...ADEGAN.matchAll(/langkahBertahan\(\s*'[^']+',\s*\n?\s*'([^']+)',\s*'([^']+)'/g)];
  assert.ok(panggilan.length >= 3, `hanya ${panggilan.length} komponen diuji tahan`);
  for (const [, pemicu, terlihat] of panggilan) {
    assert.notEqual(pemicu, terlihat, `pemicu & sasaran sama untuk ${pemicu}`);
  }
});

test('dropdown DAN laci sama-sama diuji — bukan hanya yang sudah rusak', () => {
  /* Memperbaiki satu komponen lalu hanya menguji komponen itu adalah cara
     paling mudah untuk menemukan bug yang sama lagi di komponen berikutnya. */
  assert.ok(/role="listbox"/.test(BLOK), 'dropdown tak diuji');
  assert.ok(/role="dialog"/.test(BLOK), 'laci tak diuji');
  assert.ok(/\.tabel-alat button\[aria-haspopup="listbox"\]/.test(BLOK),
    'dropdown di bilah alat tabel — 20 tabel baru — tak ikut diuji');
});

test('janji aria-modal ikut dibuktikan: Escape & pengembalian fokus', () => {
  /* <Drawer> menuliskan aria-modal="true", dan teknologi bantu memercayai
     deklarasi itu. Dialog yang mengaku modal tapi tak bisa ditutup papan ketik
     LEBIH buruk daripada yang tak mengaku apa-apa. */
  assert.ok(/Escape menutup laci/.test(BLOK));
  assert.ok(/Fokus kembali ke pemicunya/.test(BLOK));
  assert.ok(/Fokus jatuh ke <body>/.test(BLOK),
    'fokus yang jatuh ke body tak dianggap kegagalan');
});

test('selektornya masih cocok dengan komponen yang sebenarnya', () => {
  /* Adegan yang menargetkan selektor yang sudah tak ada akan melaporkan
     "pemicu tak ada di halaman ini" dan tetap HIJAU — bukti yang tak
     membuktikan apa pun, dengan tampilan yang sama seperti yang membuktikan. */
  const select = readFileSync('src/app/_components/select.tsx', 'utf8');
  assert.ok(/aria-haspopup="listbox"/.test(select), 'Select tak lagi memakai aria-haspopup=listbox');
  assert.ok(/role="listbox"/.test(select), 'popup Select tak lagi role=listbox');
  const ui = readFileSync('src/app/_components/ui.tsx', 'utf8');
  assert.ok(/role="dialog" aria-modal="true"/.test(ui), 'Drawer tak lagi role=dialog aria-modal');
  const tabel = readFileSync('src/app/_components/tabel.tsx', 'utf8');
  assert.ok(/className="cluster gap-2 tabel-alat"/.test(tabel), 'kelas .tabel-alat hilang');
});
