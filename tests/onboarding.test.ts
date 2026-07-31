import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { PLAN_LIMITS } from '../src/modules/core/limits';

/**
 * LANGKAH PERTAMA & PILIHAN PAKET.
 *
 * Dua kegagalan yang sama-sama tak membuat apa pun gagal, dan sama-sama
 * merusak kepercayaan pada saat yang paling menentukan — hari pertama.
 *
 * Yang pertama: daftar onboarding yang mengingat KLIK, bukan membaca KEADAAN.
 * Ia tetap tercentang setelah chatbotnya dihapus, kosong lagi di peramban
 * lain, dan mengaku tahu sesuatu yang tak pernah diperiksanya.
 *
 * Yang kedua: angka paket yang diketik tangan. Ia benar sekali, lalu batasnya
 * disesuaikan di limits.ts dan tak ada apa pun yang memberi tahu halaman
 * pemilihan paket.
 */

const DASH = readFileSync('src/app/(app)/dashboard/page.tsx', 'utf8');
const WELCOME = readFileSync('src/app/(app)/welcome/page.tsx', 'utf8');
const TSX = execSync('git ls-files "src/app/**/*.tsx"', { encoding: 'utf8' })
  .trim().split('\n').filter(Boolean).map((f) => [f, readFileSync(f, 'utf8')] as const);

/* ── daftar langkah pertama ──────────────────────────────────────────── */

test('langkah pertama diturunkan dari DATA, bukan dari localStorage', () => {
  const fn = DASH.slice(DASH.indexOf('function LangkahPertama('), DASH.indexOf('function TrenPemakaian('));
  assert.ok(fn.length > 0, 'komponen LangkahPertama hilang');
  for (const ingatan of [/localStorage/, /sessionStorage/, /document\.cookie/]) {
    assert.ok(!ingatan.test(fn),
      'kemajuan onboarding disimpan di peramban — daftarnya akan berbohong dua arah');
  }
  // Keempat langkah harus benar-benar memeriksa sesuatu.
  assert.ok(/bots\.length > 0/.test(fn), 'langkah "buat chatbot" tak memeriksa data');
  assert.ok(/kbs\.some\(\(k\) => k\.chunks > 0\)/.test(fn), 'langkah "isi KB" tak memeriksa isi');
  assert.ok(/k\.chatbots\.length > 0/.test(fn), 'langkah "hubungkan" tak memeriksa sambungannya');
  assert.ok(/bd\.perChatbot\.some\(/.test(fn), 'langkah "uji" tak memeriksa percakapan nyata');
});

test('langkah "hubungkan KB ke chatbot" menuntut KEDUANYA', () => {
  /* Ini langkah yang paling sering terlewat, dan gejalanya menyesatkan:
     dokumen sudah masuk, tapi KB-nya belum dipasang ke chatbot mana pun,
     jadi chatbotnya menolak menjawab seolah dokumennya tak pernah ada.
     Memeriksa `chatbots.length > 0` saja akan meluluskan KB kosong yang
     kebetulan tersambung. */
  const fn = DASH.slice(DASH.indexOf('function LangkahPertama('), DASH.indexOf('function TrenPemakaian('));
  assert.ok(/k\.chunks > 0 && k\.chatbots\.length > 0/.test(fn),
    'langkah "hubungkan" lolos untuk KB yang masih kosong');
});

test('daftar DIAM saat datanya belum lengkap, dan HILANG saat semuanya selesai', () => {
  /* Menebak saat data belum tiba membuat daftar berkedip dari "belum" ke
     "sudah" — lebih membingungkan daripada diam. Dan daftar yang tetap
     tampil setelah selesai berubah jadi perabot permanen yang diabaikan. */
  const fn = DASH.slice(DASH.indexOf('function LangkahPertama('), DASH.indexOf('function TrenPemakaian('));
  assert.ok(/if \(!bots \|\| !kbs \|\| !bd\) return null;/.test(fn),
    'daftar menebak saat data belum lengkap');
  assert.ok(/if \(sisa\.length === 0\) return null;/.test(fn),
    'daftar tak hilang sendiri saat semua langkah selesai');
  // Tak ada tombol "tutup": daftar yang bisa ditutup permanen akan ditutup
  // oleh orang yang justru belum selesai.
  assert.ok(!/Tutup|Sembunyikan|dismiss/i.test(fn), 'daftar bisa ditutup permanen');
});

/* ── halaman pemilihan paket ─────────────────────────────────────────── */

test('angka paket DIBACA dari PLAN_LIMITS', () => {
  assert.ok(/import \{ PLAN_LIMITS \} from '@\/modules\/core\/limits'/.test(WELCOME),
    'halaman paket tak mengimpor PLAN_LIMITS');
  assert.ok(/PLAN_LIMITS\[plan\]/.test(WELCOME), 'batas paket tak dibaca dari sumbernya');
  assert.ok(!/const PERKS/.test(WELCOME), 'daftar perk lama yang berangka masih ada');
});

test('tak ada angka batas yang diketik tangan di halaman paket', () => {
  /* Ketiganya pernah salah, dan salahnya ke arah yang merugikan: Free
     dijanjikan 1.000 pesan (sebenarnya 10), Pro 50.000 (sebenarnya 5.000),
     Enterprise "pesan tanpa batas" (sebenarnya 50.000). Ini halaman tempat
     orang memutuskan membayar. */
  /* KOMENTAR DIBUANG lebih dulu. Penjelasan di berkas itu justru MENGUTIP
     angka-angka salah yang dulu tertulis di sana — dan tanpa membuangnya,
     uji ini gagal karena catatan sejarahnya sendiri, bukan karena kodenya. */
  const kode = WELCOME.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  for (const salah of ['1.000 pesan', '50.000 pesan', '5.000 pesan', '10 chatbot ·']) {
    assert.ok(!kode.includes(salah), `angka batas diketik tangan: "${salah}"`);
  }
  assert.ok(!/pesan.{0,20}tanpa batas/i.test(kode),
    'halaman paket masih menjanjikan pesan tanpa batas');
});

test('nilai tak terhingga jadi kata, bukan "Infinity"', () => {
  assert.ok(/Number\.isFinite\(n\) \? n\.toLocaleString\('id-ID'\) : 'tanpa batas'/.test(WELCOME),
    'nilai tanpa batas tak diterjemahkan');
  // Dan memang ADA yang tak terhingga, jadi jalur itu benar-benar terpakai.
  assert.equal(PLAN_LIMITS.enterprise.maxChatbots, Infinity);
  assert.ok(Number.isFinite(PLAN_LIMITS.enterprise.messagesPerMonth),
    'kuota pesan enterprise kini tak terhingga — tinjau kembali klaim di halaman paket');
});

/* ── empty state yang punya jalan keluar ─────────────────────────────── */

test('empty state hari pertama menawarkan langkah berikutnya', () => {
  /* Halaman yang kosong KARENA belum ada apa-apa berbeda dari halaman yang
     kosong karena penyaringnya. Yang pertama adalah orang di hari pertama,
     dan menyuruhnya "buat chatbot dulu" tanpa memberi jalan ke sana berarti
     menyuruhnya menebak di mana. */
  const wajib: Array<[string, string]> = [
    ['src/app/(app)/analytics/page.tsx', 'Belum ada chatbot'],
    ['src/app/(app)/branding/page.tsx', 'Belum ada chatbot'],
    ['src/app/(app)/memory/page.tsx', 'Graph masih kosong'],
    ['src/app/(app)/knowledge/page.tsx', 'Belum ada knowledge base'],
  ];
  const buruk: string[] = [];
  for (const [f, judul] of wajib) {
    const s = readFileSync(f, 'utf8');
    const blok = [...s.matchAll(/<EmptyState([\s\S]*?)\/>/g)]
      .map((m) => m[1]).find((b) => b.includes(judul));
    if (!blok) { buruk.push(`${f}: empty state "${judul}" hilang`); continue; }
    if (!/action=/.test(blok)) buruk.push(`${f}: "${judul}" tanpa jalan keluar`);
  }
  assert.deepEqual(buruk, [], buruk.join('\n  '));
});

test('tak ada EmptyState dengan dua atribut action', () => {
  /* Terjadi sekali saat kartu ini dikerjakan: aksi disisipkan ke empty state
     yang SUDAH punya aksi. TypeScript menangkapnya, tapi hanya karena
     keduanya kebetulan di satu elemen — penyisipan serupa di tempat lain
     bisa lolos. */
  const buruk: string[] = [];
  for (const [f, s] of TSX) {
    for (const m of s.matchAll(/<EmptyState([\s\S]*?)\/>/g)) {
      if ((m[1].match(/action=/g) ?? []).length > 1) buruk.push(f);
    }
  }
  assert.deepEqual(buruk, [], `EmptyState beratribut action ganda:\n  ${buruk.join('\n  ')}`);
});
