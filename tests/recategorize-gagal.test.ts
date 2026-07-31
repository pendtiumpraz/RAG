import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * KATEGORISASI ULANG — kegagalan model yang menyamar jadi keputusan model.
 *
 * Bug nyata, dilaporkan pengguna dan direproduksi di produksi 31 Jul 2026:
 * tombol "kategorikan semua" dijalankan berkali-kali, 33 dokumen tetap di
 * penampung, dan laporannya berkata "33 tetap belum — model tak bisa
 * memutuskan". Yang sebenarnya terjadi: model bernalar (deepseek-v4-flash)
 * menghabiskan seluruh anggaran token untuk penalaran internal dan
 * mengembalikan ISI KOSONG, JSON.parse melempar, dan `catch { continue }`
 * menelannya tanpa jejak. Dengan 3 dokumen model yang sama menjawab benar —
 * jadi kegagalannya hanya muncul pada batch besar, dan tak ada satu pun
 * angka yang menunjukkannya.
 *
 * Setelah diperbaiki: 33 dari 33 dokumen terkategorikan di produksi.
 */

const SVC = readFileSync('src/modules/memory/recategorize.service.ts', 'utf8');
const UI = readFileSync('src/app/(app)/memory/page.tsx', 'utf8');
const LLM = readFileSync('src/modules/chat/llm/index.ts', 'utf8');

test('kegagalan model DIHITUNG, tak ditelan diam-diam', () => {
  /* `catch { continue }` tanpa penghitung membuat jawaban yang tak terbaca
     masuk ke `tetapBelum` — tak bisa dibedakan dari dokumen yang memang
     sulit, dan pengguna menekan tombol yang sama berkali-kali sambil
     membaca angka yang sama. */
  assert.ok(/gagalDinilai \+= batch\.length;/.test(SVC),
    'batch yang jawabannya tak terbaca tidak dihitung');
  assert.ok(/gagalDinilai: number;/.test(SVC), 'hasil tak membawa bidang gagalDinilai');
  // Dan ia TIDAK ikut dihitung sebagai "model sudah menilai".
  assert.ok(/tetapBelum: siap\.length - hasil\.size - gagalDinilai/.test(SVC),
    'dokumen yang gagal dinilai masih dihitung sebagai tetapBelum');
});

test('UI membedakan "tak bisa memutuskan" dari "tak sempat dinilai"', () => {
  /* Keduanya berakhir sama di layar sebelumnya, padahal artinya berlawanan
     dan langkah lanjutannya berbeda: yang satu berarti dokumennya memang
     sulit, yang lain berarti modelnya perlu diganti. */
  assert.ok(/gagalDinilai/.test(UI), 'UI tak menampilkan kegagalan model');
  assert.ok(/tak sempat dinilai/.test(UI), 'UI tak menjelaskan bedanya kepada pengguna');
  assert.ok(/ganti model aktif/.test(UI), 'UI tak menyebut langkah lanjutan yang benar');
});

test('anggaran token dikirim lewat sampling, BUKAN lewat maxChars', () => {
  /* Argumen keempat completeChat adalah `maxChars` — pemotong panjang string
     di sisi kita, bukan batas token model. Memakainya sebagai batas token
     membuat anggaran sesungguhnya diam-diam jatuh ke bawaan 2.048, dan model
     bernalar menghabiskannya untuk berpikir sebelum sempat menulis apa pun. */
  assert.ok(/maxChars = 8000/.test(LLM), 'bentuk completeChat berubah — periksa ulang argumennya');
  assert.ok(/\], apiKey, 8_000, \{ maxTokens: MAX_TOKEN_BATCH \}\)/.test(SVC),
    'anggaran token tak dikirim lewat argumen sampling');
  assert.ok(!/\], apiKey, 2000\)/.test(SVC), 'angka token masih dikirim sebagai maxChars');
});

test('batch cukup kecil untuk model bernalar', () => {
  /* 20 ringkasan × 700 karakter membuat model bernalar kehabisan anggaran
     sebelum menulis jawabannya. Batch kecil juga gagal lebih anggun: yang
     hilang satu kelompok, bukan seluruh jalannya. */
  const m = SVC.match(/const PER_BATCH = (\d+);/);
  assert.ok(m, 'PER_BATCH hilang');
  assert.ok(Number(m![1]) <= 10, `PER_BATCH = ${m![1]} — terlalu besar untuk model bernalar`);
  const t = SVC.match(/const MAX_TOKEN_BATCH = ([\d_]+);/);
  assert.ok(t, 'MAX_TOKEN_BATCH hilang');
  assert.ok(Number(t![1].replace(/_/g, '')) >= 4000,
    'anggaran token terlalu kecil; model bernalar memakai sebagian besarnya untuk berpikir');
});

test('satu batch gagal tak menggagalkan sisanya', () => {
  /* Dokumen di batch yang gagal tetap di penampung — keadaan yang sama
     seperti sebelum tombol ditekan, jadi menekannya lagi aman. */
  const blok = SVC.slice(SVC.indexOf('} catch {'), SVC.indexOf('if (!hasil.size)'));
  assert.ok(/continue;/.test(blok), 'batch gagal menghentikan seluruh jalannya');
});

test('kategori tak dikenal tetap DIUSULKAN, bukan dipakai langsung', () => {
  /* Memakainya langsung berarti dokumen menunjuk kategori yang mungkin
     ditolak besok — dan menolaknya lalu membuat mereka yatim. Perilaku ini
     harus sama dengan agen Memory; dua jalur yang menulis kategori tak boleh
     punya aturan berbeda. */
  assert.ok(/await categoryService\.propose\(tenantId, usul\);/.test(SVC),
    'kategori tak dikenal tak diusulkan');
  const blok = SVC.slice(SVC.indexOf('const cocok = kategoriAktif.find'), SVC.indexOf('} catch {'));
  assert.ok(!/hasil\.set\([^)]*usul/.test(blok), 'usulan mentah dipakai sebagai kategori');
});

test('hanya dokumen di PENAMPUNG yang disentuh', () => {
  /* Tombol yang diam-diam memindahkan dokumen yang sudah sengaja
     dikategorikan seseorang adalah tombol yang membuat orang berhenti
     mempercayai seluruh fiturnya. */
  assert.ok(/where n\.category = \$\{FALLBACK_SLUG\}/.test(SVC),
    'pemilihan dokumen tak dibatasi ke penampung');
});
