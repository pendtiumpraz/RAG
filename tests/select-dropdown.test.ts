import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * DROPDOWN TIDAK BOLEH MENUTUP DIRINYA SENDIRI.
 *
 * KEJADIAN NYATA (2 Agu 2026, produksi). "Dropdown model chat aktif ketika
 * di klik ngeglitch, muncul dan langsung hilang."
 *
 * Mekanismenya berputar pada dirinya sendiri:
 *   1. `.nsel-pop` dibatasi 280px dan bisa digulir.
 *   2. Saat dibuka, sebuah efek menggulir OPSI TERPILIH ke dalam pandangan
 *      dengan `scrollIntoView` — yang boleh menggulir leluhur mana pun.
 *   3. Efek lain menutup popup pada peristiwa `scroll` apa pun (capture).
 *   4. Langkah 2 memicu langkah 3. Popup menutup sepersekian detik setelah
 *      dibuka.
 *
 * KENAPA HANYA SEBAGIAN DROPDOWN. Yang nilainya berada di dalam 280px pertama
 * tak pernah perlu menggulir, jadi tak pernah menunjukkan gejalanya. Terbukti
 * di produksi: "model chat aktif" (14 model) menutup sendiri, "model embedding
 * aktif" (6 opsi) tidak. Itu sebabnya cacat ini bertahan lama — ia tampak
 * seperti masalah satu dropdown, bukan masalah komponennya.
 *
 * Bonusnya: gulir daftar dengan roda tetikus juga menutup popup, sehingga
 * daftar panjang praktis mustahil dijelajahi.
 */

const SRC = readFileSync('src/app/_components/select.tsx', 'utf8');
const DS = readFileSync('src/app/nalar-ds.css', 'utf8');

/**
 * Iris satu useEffect utuh, dari komentar penandanya sampai efek berikutnya.
 *
 * Batasnya dicari SESUDAH `useEffect(` yang mengikuti penanda — bukan sesudah
 * penandanya. Versi pertama berhenti tepat di awal efek yang hendak diperiksa,
 * jadi yang tersisa cuma komentarnya, dan ketiga tes gagal terhadap kode yang
 * SUDAH benar. Tes yang salah menuduh sama merusaknya dengan tes yang lolos
 * diam-diam.
 */
function efek(setelah: string): string {
  const i = SRC.indexOf(setelah);
  assert.ok(i > 0, `penanda tak ditemukan: ${setelah}`);
  const mulaiEfek = SRC.indexOf('useEffect(', i);
  assert.ok(mulaiEfek > 0, `useEffect tak ditemukan setelah: ${setelah}`);
  const j = SRC.indexOf('\n  useEffect(', mulaiEfek + 1);
  const k = SRC.indexOf('\n  function ', mulaiEfek + 1);
  const akhir = [j, k].filter((x) => x > 0).sort((a, b) => a - b)[0] ?? SRC.length;
  return SRC.slice(mulaiEfek, akhir);
}

test('opsi aktif digulir TANPA menyentuh leluhur', () => {
  /* scrollIntoView boleh menggulir kontainer mana pun di atasnya — termasuk
     halaman. Di komponen yang juga menutup pada gulir, itu bunuh diri. */
  /* Diikat ke bentuk PANGGILAN `scrollIntoView(`, bukan katanya. Komentar
     penjelasan di select.tsx menyebut namanya, dan pola tanpa kurung akan
     menuduh komentar yang justru menerangkan kenapa ia tak boleh dipakai. */
  assert.ok(!/scrollIntoView\(/.test(SRC),
    'scrollIntoView() kembali dipakai — ia bisa menggulir halaman dan memicu penutup-saat-gulir');
  const blok = efek('// Gulir opsi aktif');
  assert.ok(/scrollTop/.test(blok), 'opsi aktif tak lagi digulir ke dalam pandangan sama sekali');
});

test('gulir DI DALAM popup tidak menutupnya', () => {
  const blok = efek('// Tutup saat klik di luar');
  assert.ok(/listRef\.current\.contains\(t\)|listRef\.current === t/.test(blok),
    'penutup-saat-gulir tak memeriksa asal gulirnya — gulir daftar opsi akan menutup popup');
  assert.ok(/addEventListener\('scroll', onScroll, true\)/.test(blok),
    'pendengar gulir tidak memakai penyaring asal; daftar panjang jadi mustahil dijelajahi');
});

test('gulir HALAMAN tetap menutup — posisinya dipatok ke pemicu', () => {
  /* Popup melayang dengan position:absolute terhadap pemicunya. Kalau halaman
     bergerak di bawahnya dan popup tidak ikut menutup, ia mengambang di
     tempat yang salah. Perbaikan di atas tak boleh menghapus perilaku ini. */
  const blok = efek('// Tutup saat klik di luar');
  assert.ok(/setOpen\(false\)/.test(blok.slice(blok.indexOf('onScroll'))),
    'gulir halaman tak lagi menutup popup');
});

test('sebab hulunya masih ada: popup memang bisa digulir', () => {
  /* Kalau suatu hari daftar opsi tak lagi dibatasi tingginya, cacat ini
     mustahil terjadi dan aturan di berkas ini boleh ditinjau ulang. Aturan
     yang alasannya sudah hilang adalah aturan yang dilanggar orang berikutnya
     — dan seharusnya memang boleh dilanggar. */
  const i = DS.indexOf('.nsel-pop{');
  const blok = DS.slice(i, i + 400);
  assert.ok(/max-height:\s*\d+px/.test(blok) && /overflow-y:\s*auto/.test(blok),
    'popup tak lagi dibatasi & digulir — tinjau ulang penjagaan di tests/select-dropdown.test.ts');
});
