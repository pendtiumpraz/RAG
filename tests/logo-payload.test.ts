import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * KOLOM `logo` TIDAK BOLEH IKUT DI DAFTAR CHATBOT.
 *
 * `chatbots.logo` adalah kolom `text` berisi data URL PENUH gambarnya, dan
 * `repo.listActive` memakai `select()` tanpa kolom eksplisit — jadi setiap
 * kolom baru otomatis ikut terkirim ke peramban. Persis jebakan yang sudah
 * dijaga untuk `visitor_secret`; `logo` lolos karena ia tak terasa seperti
 * rahasia. Bedanya cuma jenis kerugiannya: bukan kebocoran, tapi berat.
 *
 * Gambarnya sengaja dilayani terpisah lewat /api/chat/{publicKey}/logo justru
 * SUPAYA daftarnya tetap ringan — jadi mengirimkannya lagi di daftar
 * membatalkan alasan endpoint itu ada.
 *
 * KETAHUAN LEWAT 404. Tur fitur (2 Agu 2026) mencatat satu galat konsol di
 * /branding: `404 /api/chat/<kunci>/logo?v=0`. Halaman itu SELALU meminta
 * gambarnya dan menangani ketiadaannya lewat `onError` — derau yang membuat
 * galat sungguhan lebih sulit terlihat. Menambal bendera `punyaLogo`
 * menutup dua-duanya sekaligus.
 */

const SVC = readFileSync('src/modules/chatbot/chatbot.service.ts', 'utf8');
const PAGE = readFileSync('src/app/(app)/branding/page.tsx', 'utf8');
const REPO = readFileSync('src/modules/chatbot/chatbot.repository.ts', 'utf8');

test('tanpaRahasia MEMBUANG kolom logo dan menggantinya dengan bendera', () => {
  const blok = SVC.slice(SVC.indexOf('tanpaRahasia<T'), SVC.indexOf('async list('));
  assert.ok(/const \{ visitorSecret, logo, \.\.\.sisa \} = row/.test(blok),
    'kolom logo tak dibuang — data URL penuh ikut ke peramban di tiap daftar');
  assert.ok(/punyaLogo: !!logo/.test(blok), 'bendera punyaLogo tak disediakan');
});

test('branding hanya meminta gambar bila logonya MEMANG ada', () => {
  /* Sebelum ini gambarnya selalu diminta; ketiadaannya ditangani onError, dan
     tiap kunjungan meninggalkan 404 di konsol. */
  assert.ok(/active\.punyaLogo/.test(PAGE),
    'halaman branding masih meminta logo tanpa memeriksa keberadaannya');
  const i = PAGE.indexOf('/logo?v=');
  assert.ok(i > 0, 'pratinjau logo hilang sama sekali');
  const sebelum = PAGE.slice(Math.max(0, i - 400), i);
  assert.ok(/punyaLogo/.test(sebelum), 'syarat keberadaan logo tak menjaga <img> ini');
});

test('sebab hulunya masih ada: listActive memang select() polos', () => {
  /* Kalau suatu hari repositorinya menyebut kolom satu per satu, kelas cacat
     ini mustahil terjadi dan penjagaan di sini boleh ditinjau ulang. Aturan
     yang alasannya sudah hilang adalah aturan yang dilanggar orang berikutnya
     — dan seharusnya memang boleh dilanggar. */
  const blok = REPO.slice(REPO.indexOf('listActive('), REPO.indexOf('listActive(') + 400);
  assert.ok(/tx\.select\(\)\.from\(chatbots\)/.test(blok),
    'listActive tak lagi select() polos — tinjau ulang tests/logo-payload.test.ts');
});
