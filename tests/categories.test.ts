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

test('taksonomi awal memuat penampung', async () => {
  const { DEFAULT_CATEGORIES, FALLBACK_SLUG } = await load();
  // Penampung tak boleh hilang: ia tujuan pindah bagi catatan milik kategori
  // yang dihapus, dan tempat parkir dokumen dengan usulan yang belum disetujui.
  assert.ok(DEFAULT_CATEGORIES.some((c) => c.slug === FALLBACK_SLUG));
});
