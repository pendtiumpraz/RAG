import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  type KeadaanTenant, MIN_UNTUK_PERSEN, TAHAP, bolehPersen, hitungFunnel,
  persen, tahapPalingBocor,
} from '../src/modules/usage/funnel';

/**
 * FUNNEL PRODUK.
 *
 * Angka funnel punya wibawa yang tak sepadan dengan ketelitiannya: ia dibaca
 * sebagai temuan, dan orang mengubah produk karenanya. Karena itu yang paling
 * penting di sini bukan menghitung dengan benar, melainkan MENOLAK MENYIMPULKAN
 * saat datanya belum cukup.
 */

const SKRIP = readFileSync('scripts/funnel-report.ts', 'utf8');

const t = (o: Partial<KeadaanTenant> = {}): KeadaanTenant => ({
  daftar: true, terverifikasi: false, disetujui: false, punyaChatbot: false,
  punyaPengetahuan: false, punyaPercakapan: false, membayar: false, ...o,
});
const penuh = () => t({
  terverifikasi: true, disetujui: true, punyaChatbot: true,
  punyaPengetahuan: true, punyaPercakapan: true, membayar: true,
});

test('tahap BERSARANG — tak ada tahap yang lebih besar dari sebelumnya', () => {
  /* Funnel yang menanjak di tengah adalah pemandangan mustahil, dan ia
     langsung menghapus kepercayaan pada seluruh angkanya. Itu terjadi bila
     tahap dihitung lepas: tenant yang dibuatkan manual lalu langsung diisi
     dokumen akan muncul di tahap akhir tanpa pernah melewati yang awal. */
  const baris = hitungFunnel([
    t({ punyaPengetahuan: true, punyaPercakapan: true }),   // melompat, tanpa tahap awal
    penuh(),
  ]);
  for (let i = 1; i < baris.length; i++) {
    assert.ok(baris[i].jumlah <= baris[i - 1].jumlah,
      `tahap "${baris[i].label}" (${baris[i].jumlah}) melebihi "${baris[i - 1].label}" (${baris[i - 1].jumlah})`);
  }
  // Yang melompat TIDAK dihitung di tahap yang dilompatinya.
  assert.equal(baris.find((b) => b.kunci === 'punyaPengetahuan')!.jumlah, 1);
});

test('pembagian dengan nol jadi null, bukan angka yang terlihat pasti', () => {
  /* 0/0 menghasilkan NaN dan x/0 menghasilkan Infinity; keduanya dirender
     jadi sesuatu yang terlihat seperti data. */
  const baris = hitungFunnel([t()]);           // semua berhenti di tahap pertama
  const setelahnya = baris.slice(2);
  for (const b of setelahnya) {
    assert.equal(b.lanjutDariSebelumnya, null, `${b.label} membagi dengan nol`);
    assert.ok(!Number.isNaN(b.lanjutDariSebelumnya as unknown as number));
  }
  assert.equal(persen(null), '—');
  assert.equal(persen(0.5), '50.0%');
});

test('funnel kosong tak melempar dan tak mengarang', () => {
  const baris = hitungFunnel([]);
  assert.equal(baris.length, TAHAP.length);
  assert.ok(baris.every((b) => b.jumlah === 0));
  assert.equal(baris[0].lanjutDariSebelumnya, null);
  assert.equal(tahapPalingBocor(baris), null);
});

test('MENOLAK menyimpulkan pada populasi kecil', () => {
  /* Dengan tiga pendaftar, satu orang yang berhenti adalah "33% drop-off" —
     angka yang terlihat seperti temuan dan sebenarnya satu orang. Laporan
     yang selalu menunjuk "tahap terburuk" akan menunjuk sesuatu bahkan
     ketika datanya tiga orang, dan yang membacanya memperbaiki tahap yang
     tak pernah rusak. */
  const kecil = hitungFunnel([penuh(), t(), t()]);
  assert.equal(bolehPersen(3), false);
  assert.equal(tahapPalingBocor(kecil), null, 'menyimpulkan dari 3 tenant');

  const cukup = hitungFunnel([
    ...Array.from({ length: MIN_UNTUK_PERSEN - 5 }, () => penuh()),
    ...Array.from({ length: 5 }, () => t({ terverifikasi: true })),
  ]);
  assert.equal(bolehPersen(MIN_UNTUK_PERSEN), true);
  assert.ok(tahapPalingBocor(cukup), 'menolak menyimpulkan padahal datanya cukup');
});

test('tahap paling bocor adalah yang kehilangan TERBANYAK', () => {
  const baris = hitungFunnel([
    ...Array.from({ length: 30 }, () => penuh()),
    // 10 berhenti di "disetujui", 2 berhenti di "membuat chatbot"
    ...Array.from({ length: 10 }, () => t({ terverifikasi: true })),
    ...Array.from({ length: 2 }, () => t({ terverifikasi: true, disetujui: true })),
  ]);
  const bocor = tahapPalingBocor(baris)!;
  assert.equal(bocor.kunci, 'disetujui');
  assert.equal(bocor.berhenti, 10);
});

test('tiap tahap membawa ARTI-nya, bukan cuma label', () => {
  /* "Disetujui superadmin" yang menahan orang berarti antrean KITA, bukan
     keraguan pengguna — dan itu satu-satunya tahap yang bisa diperbaiki hari
     ini juga. Angka tanpa kalimat itu akan dibaca sebagai masalah pengguna. */
  for (const s of TAHAP) {
    assert.ok(s.arti.length > 30, `tahap ${s.kunci} tak menjelaskan artinya`);
  }
  assert.ok(TAHAP.find((s) => s.kunci === 'disetujui')!.arti.includes('KITA'));
});

/* ── skripnya ────────────────────────────────────────────────────────── */

test('hanya tenant HIDUP yang dihitung', () => {
  /* Laporan pertama menghitung 81 tenant padahal yang hidup 2 — 79 sisanya
     baris uji asap yang sudah dihapus lunak. Angka yang memuat mereka bukan
     sekadar meleset; ia menciptakan "kebocoran terbesar" palsu di tahap
     verifikasi email. */
  assert.ok(/\.where\(isNull\(tenants\.deletedAt\)\)/.test(SKRIP),
    'tenant terhapus ikut dihitung sebagai pendaftar');
});

test('satu kueri per tenant lewat withTenant, tanpa jalan pintas admin', () => {
  /* Agregasi tunggal lintas tenant mengembalikan NOL BARIS walau datanya ada,
     karena aplikasi menyambung sebagai peran NOBYPASSRLS — dan laporan kosong
     terbaca persis seperti "belum ada yang mendaftar". */
  assert.ok(/withTenant\(t\.id/.test(SKRIP), 'kueri di luar konteks tenant');
  assert.ok(!/app\.admin_context|set_config/.test(SKRIP),
    'skrip CLI memakai jalan pintas konteks admin');
});

test('pengetahuan diukur dari POTONGAN, bukan dari knowledge base', () => {
  /* KB kosong yang dibuat lalu ditinggalkan adalah persis pola berhenti yang
     ingin dilihat laporan ini. Menghitungnya sebagai "sudah mengisi" akan
     menyembunyikan kebocoran di tahap itu. */
  assert.ok(/from documents d where d\.deleted_at is null\) as punya_pengetahuan/.test(SKRIP),
    'tahap pengetahuan diukur dari KB, bukan dari isinya');
});
