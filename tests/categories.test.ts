import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ??= 'postgres://x:y@localhost:5432/z';
process.env.CREDENTIALS_ENCRYPTION_KEY ??= '0'.repeat(64);

const load = () => import('../src/modules/memory/categories');

test('penanda melekat pada slot, bukan pada urutan', async () => {
  const { markerForSlot } = await load();
  // Inilah alasan `slot` DISIMPAN di baris kategori. Kalau ia diturunkan dari
  // posisi dalam daftar, menghapus satu kategori akan menggeser penanda semua
  // kategori sesudahnya — dan graf yang warnanya berubah sendiri tiap ada
  // penyuntingan tak bisa dibaca siapa pun.
  const a = markerForSlot(5);
  const b = markerForSlot(5);
  assert.deepEqual(a, b);
  assert.notDeepEqual(markerForSlot(5), markerForSlot(6));
});

test('16 slot pertama semuanya unik', async () => {
  const { markerForSlot, VISUAL_SLOTS } = await load();
  const seen = new Set<string>();
  for (let i = 0; i < VISUAL_SLOTS; i++) {
    const m = markerForSlot(i);
    seen.add(`${m.color}|${m.shape}`);
  }
  assert.equal(seen.size, VISUAL_SLOTS, 'ada penanda kembar di dalam 16 slot');
});

test('warna berputar lebih cepat dari bentuk', async () => {
  const { markerForSlot, SLOT_COLORS } = await load();
  // Disengaja: kategori yang bersebelahan di master data harus berbeda WARNA
  // (perbedaan yang paling cepat ditangkap mata), bukan berbeda bentuk.
  assert.notEqual(markerForSlot(0).color, markerForSlot(1).color);
  assert.equal(markerForSlot(0).shape, markerForSlot(1).shape);
  assert.notEqual(markerForSlot(0).shape, markerForSlot(SLOT_COLORS.length).shape);
});

test('slot di luar jangkauan jatuh ke warna netral, bukan undefined', async () => {
  const { markerForSlot, VISUAL_SLOTS, OVERFLOW_COLOR } = await load();
  for (const s of [-1, VISUAL_SLOTS, VISUAL_SLOTS + 99]) {
    const m = markerForSlot(s);
    assert.equal(m.color, OVERFLOW_COLOR);
    assert.equal(m.shape, 'circle');
  }
});

test('palet warna TIDAK diperbanyak tanpa uji ulang', async () => {
  const { SLOT_COLORS } = await load();
  // Empat warna ini lolos uji SEMUA-PASANGAN validator OKLab pada mode terang
  // maupun gelap. Delapan warna GAGAL: ungu #7C3AED vs biru #2563EB hanya
  // ΔE 0,4 pada deutan — bagi mata buta warna merah-hijau keduanya warna yang
  // sama. Menambah warna di sini tanpa menjalankan ulang validator akan
  // membuat kategori tampak berbeda bagi sebagian orang dan identik bagi
  // sebagian lain, tanpa ada yang sadar. Sumbu kedua adalah BENTUK.
  assert.equal(SLOT_COLORS.length, 4);
});

test('slug: nama bebas jadi kunci yang aman', async () => {
  const { categorySlug, FALLBACK_SLUG } = await load();
  assert.equal(categorySlug('Audit Internal'), 'audit-internal');
  assert.equal(categorySlug('  Notulen  Rapat  '), 'notulen-rapat');
  assert.equal(categorySlug('K3 & Lingkungan'), 'k3-lingkungan');
  // Masukan yang seluruhnya tak tersalin tak boleh menghasilkan kunci kosong.
  assert.equal(categorySlug('!!!'), FALLBACK_SLUG);
  assert.equal(categorySlug(''), FALLBACK_SLUG);
  assert.ok(categorySlug('x'.repeat(200)).length <= 40);
});

test('penampung BUKAN bagian dari daftar kategori', async () => {
  const { DEFAULT_CATEGORIES, FALLBACK_SLUG, FALLBACK_LABEL } = await load();
  // "Belum dikategorikan" adalah KEADAAN, bukan jenis dokumen. Menaruhnya di
  // daftar kategori membuatnya terbaca sebagai kelompok berkas yang sah —
  // persis salah paham yang dihapus migrasi 0034 (dulu berlabel "Lain-lain").
  assert.ok(!DEFAULT_CATEGORIES.some((c) => c.slug === FALLBACK_SLUG),
    'penampung ikut terdaftar sebagai kategori biasa');
  assert.match(FALLBACK_LABEL, /belum/i, 'label penampung tak menyebut keadaannya');
});

test('penampung tetap WAJIB disemai oleh service', async () => {
  // Ia tujuan pindah bagi tiga hal yang pasti terjadi: penilaian yang gagal,
  // catatan milik kategori yang dihapus, dan usulan yang belum disetujui.
  // Kalau ia tak ada, ketiganya jadi yatim tanpa pesan galat apa pun.
  const { readFileSync } = await import('node:fs');
  const svc = readFileSync('src/modules/memory/category.service.ts', 'utf8');
  assert.match(svc, /const wajib = \[\.\.\.DEFAULT_CATEGORIES, \{ slug: FALLBACK_SLUG/,
    'ensureSeeded tak menjamin penampung ada');
});

test('taksonomi cukup rinci agar penampung tak jadi tempat sampah', async () => {
  const { DEFAULT_CATEGORIES } = await load();
  // Daftar yang terlalu umum memaksa separuh korpus jatuh ke penampung, dan
  // penampung yang penuh tak memberi tahu apa pun kepada pemilik data.
  assert.ok(DEFAULT_CATEGORIES.length >= 10,
    `hanya ${DEFAULT_CATEGORIES.length} kategori bawaan — terlalu kasar`);
  const slug = new Set(DEFAULT_CATEGORIES.map((c) => c.slug));
  assert.equal(slug.size, DEFAULT_CATEGORIES.length, 'ada slug bawaan yang kembar');
});

test('nama samar ditolak jadi kategori baru', async () => {
  const { namaTerlaluSamar } = await load();
  // Model kadang tetap menjawab "lain" walau diinstruksikan jangan. Menerimanya
  // akan mengembalikan persis masalah yang dihapus migrasi 0034.
  for (const n of ['lain', 'Lain-lain', 'UMUM', 'Other', 'dokumen', 'tidak diketahui']) {
    assert.equal(namaTerlaluSamar(n), true, `"${n}" lolos sebagai kategori`);
  }
  for (const n of ['Perizinan', 'Audit Internal', 'Notulen Rapat', 'K3 & Lingkungan']) {
    assert.equal(namaTerlaluSamar(n), false, `"${n}" salah ditolak`);
  }
});
