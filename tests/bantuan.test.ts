import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import { FORMAT_DIDUKUNG, TEXT_EXT, DOC_EXT } from '../src/modules/knowledge/format';

/**
 * PANDUAN PENGGUNA — dijaga supaya tak bisa berbohong.
 *
 * Dokumentasi punya satu bentuk kegagalan yang khas dan tak pernah membuat
 * apa pun gagal: ia BENAR saat ditulis, lalu kodenya berubah dan ia diam-diam
 * jadi salah. Yang membacanya adalah orang yang paling percaya dan paling
 * tidak punya cara memeriksa. Karena itu setiap angka dan daftar di halaman
 * bantuan harus DIBACA dari kode, bukan diketik ulang — dan tes ini menjaga
 * agar tetap begitu.
 */

const HAL = readFileSync('src/app/(app)/bantuan/page.tsx', 'utf8');
const SYNC = readFileSync('src/modules/knowledge/sync.service.ts', 'utf8');
const LAYOUT = readFileSync('src/app/(app)/layout.tsx', 'utf8');
const EMBED = readFileSync('public/embed.js', 'utf8');

test('daftar format DIBACA dari kode, tak diketik ulang', () => {
  assert.ok(/import \{ FORMAT_DIDUKUNG \} from '@\/modules\/knowledge\/format'/.test(HAL),
    'halaman bantuan tak mengimpor daftar format');
  assert.ok(/FORMAT_DIDUKUNG\.join\(/.test(HAL), 'daftar format tak dirender dari sumbernya');
  // Dan tak ada salinan manual yang bisa menyimpang.
  for (const ext of ['.pdf', '.docx', '.md']) {
    assert.ok(!HAL.includes(`'${ext}'`), `ekstensi ${ext} disalin manual ke halaman bantuan`);
  }
});

test('sync.service memakai daftar format yang SAMA', () => {
  /* Kalau sync punya salinannya sendiri, panduan bisa benar sementara
     produknya menolak berkas yang dijanjikan — atau sebaliknya. */
  assert.ok(/from '\.\/format'/.test(SYNC), 'sync.service tak memakai modul format bersama');
  assert.ok(!/const TEXT_EXT = \[/.test(SYNC), 'sync.service masih menyimpan salinan TEXT_EXT');
  assert.ok(!/const DOC_EXT = \[/.test(SYNC), 'sync.service masih menyimpan salinan DOC_EXT');
  assert.equal(FORMAT_DIDUKUNG.length, TEXT_EXT.length + DOC_EXT.length);
});

test('angka kuota DIBACA dari PLAN_LIMITS', () => {
  assert.ok(/import \{ PLAN_LIMITS \} from '@\/modules\/core\/limits'/.test(HAL),
    'halaman bantuan tak mengimpor PLAN_LIMITS');
  assert.ok(/PLAN_LIMITS\[p\]\.messagesPerMonth/.test(HAL), 'kuota pesan tak dibaca dari sumbernya');
  assert.ok(/PLAN_LIMITS\.free\.messagesPerMonth/.test(HAL),
    'angka paket gratis di prosa tak dibaca dari sumbernya');
  // Angka besar yang diketik manual adalah tanda salinan.
  for (const angka of ['5.000', '50.000', '5,000', '50,000']) {
    assert.ok(!HAL.includes(angka), `angka kuota ${angka} diketik manual`);
  }
});

test('tak terhingga ditampilkan sebagai kata, bukan "Infinity" atau 0', () => {
  /* Infinity hilang saat melewati JSON dan sering muncul kembali sebagai
     null lalu 0 — "0 chatbot" untuk paket tanpa batas adalah kebalikan
     persis dari yang benar. Di sini nilainya dibaca langsung, jadi yang
     perlu dijaga hanya penerjemahannya. */
  assert.ok(/Number\.isFinite\(n\) \? n\.toLocaleString\('id-ID'\) : 'Tanpa batas'/.test(HAL),
    'nilai tanpa batas tak diterjemahkan jadi kata');
});

test('setiap tautan internal menunjuk halaman yang BENAR-BENAR ada', () => {
  /* Panduan yang menunjuk halaman tak ada mengubah bantuan jadi jalan buntu,
     dan itu justru terjadi pada orang yang sedang tersangkut. */
  const buruk: string[] = [];
  for (const m of HAL.matchAll(/href="(\/[a-z0-9/-]*)"/g)) {
    const rute = m[1];
    if (rute.startsWith('/api/')) continue;                       // rute API, bukan halaman
    const dir = `src/app/(app)${rute}`;
    if (!existsSync(`${dir}/page.tsx`)) buruk.push(rute);
  }
  assert.deepEqual(buruk, [], `tautan ke halaman yang tak ada:\n  ${buruk.join('\n  ')}`);
});

test('mode embed yang dijanjikan memang dikenali embed.js', () => {
  assert.ok(/data-mode/.test(HAL), 'panduan tak menyebut data-mode');
  assert.ok(/data-mode="inline"/.test(HAL), 'mode inline tak dicontohkan');
  // embed.js harus benar-benar membacanya, bukan sekadar menyebutnya di komentar.
  assert.ok(/getAttribute\('data-mode'\)/.test(EMBED), 'embed.js tak membaca data-mode');
  assert.ok(/=== 'inline'/.test(EMBED), "embed.js tak mengenali mode 'inline'");
  assert.ok(/data-target/.test(HAL) && /data-target/.test(EMBED),
    'data-target dijanjikan panduan tapi tak dibaca embed.js');
});

test('panduan terpasang di navigasi, tanpa gerbang fitur', () => {
  /* Yang paling butuh membacanya adalah tenant paket gratis di hari pertama.
     Menaruhnya di balik gerbang fitur berarti menyembunyikan bantuan dari
     orang yang paling membutuhkannya. */
  const item = LAYOUT.match(/\{ href: '\/bantuan',[^}]*\}/);
  assert.ok(item, 'Panduan tak ada di navigasi');
  assert.ok(!/feature:/.test(item![0]), 'Panduan dipagari gerbang fitur');
  assert.ok(!/superadmin:/.test(item![0]), 'Panduan hanya untuk superadmin');
});

test('panduan menyebutkan yang MENGECEWAKAN, bukan hanya jalan mulus', () => {
  /* Panduan yang hanya memuat jalan mulus membuat orang menyalahkan dirinya
     sendiri saat menemui yang tidak mulus. Tiga hal ini adalah kekecewaan
     yang paling sering dilaporkan, dan ketiganya lebih baik diketahui di
     muka. */
  assert.ok(/PDF hasil pindai/.test(HAL), 'panduan tak memperingatkan PDF hasil pindai');
  assert.ok(/tidak ada di dokumen|menolak menjawab/.test(HAL),
    'panduan tak menjelaskan kenapa bot menolak menjawab');
  assert.ok(/Paket gratis sengaja kecil/.test(HAL),
    'panduan tak menyebut batas paket gratis di muka');
});

test('panduan menggambarkan perilaku kuota yang SEDANG berlaku', () => {
  /* Ditulis saat panduan ini dibuat, diperbaiki saat kartu a-kuota-pesan
     selesai. Bentuk kegagalan yang dijaga: panduan yang tertinggal satu
     langkah di belakang kodenya — ia pernah menuliskan keterbatasan yang
     kini sudah tak ada, dan itu menakut-nakuti pengguna tanpa sebab. */
  assert.ok(!/itu keliru untuk kuota bulanan/.test(HAL),
    'panduan masih menyebut keterbatasan yang sudah diperbaiki');
  assert.ok(/pesan netral/.test(HAL), 'panduan tak menjelaskan apa yang dilihat pengunjung');
  assert.ok(/ditampilkan ke pengunjung/.test(HAL),
    'panduan tak menyebut bahwa angka kuota tak bocor ke pengunjung');
});
