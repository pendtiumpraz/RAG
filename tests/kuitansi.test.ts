import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  bisaDicetak, nomorKuitansi, rupiah, terbilang, terbilangRupiah, uraian,
} from '../src/modules/payments/kuitansi';

/**
 * KUITANSI PEMBAYARAN.
 *
 * Kegagalan di sini tak menimbulkan galat — ia menimbulkan pertanyaan dari
 * bagian keuangan pelanggan berbulan-bulan kemudian, saat berkasnya sudah
 * telanjur masuk pembukuan dan tak bisa ditarik kembali.
 */

const RUTE = readFileSync('src/app/api/payments/[id]/kuitansi/route.ts', 'utf8');
const HAL = readFileSync('src/app/(app)/kuitansi/[id]/page.tsx', 'utf8');
const CSS = readFileSync('src/app/(app)/kuitansi/[id]/kuitansi.css', 'utf8');
const BILLING = readFileSync('src/app/(app)/billing/page.tsx', 'utf8');
const MIG = readFileSync('migrations/0039_billing_identity.sql', 'utf8');

const trx = (o: Partial<{ id: string; paidAt: string | null; createdAt: string }> = {}) => ({
  id: o.id ?? 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  paidAt: o.paidAt === undefined ? '2026-07-15T03:00:00.000Z' : o.paidAt,
  createdAt: o.createdAt ?? '2026-07-14T00:00:00.000Z',
});

/* ── nomor ───────────────────────────────────────────────────────────── */

test('nomor kuitansi STABIL — dihitung ulang selalu sama', () => {
  /* Nomor yang berubah tiap kali dibuka membuat dua cetakan dokumen yang
     sama tampak sebagai dua transaksi. */
  const a = nomorKuitansi(trx());
  assert.equal(a, nomorKuitansi(trx()));
  assert.equal(a, 'KW/2026-07/A1B2C3D4');
});

test('nomor memakai tanggal LUNAS, bukan tanggal tagihan dibuat', () => {
  /* Tagihan yang dibuat akhir Juni lalu dibayar awal Juli masuk pembukuan
     Juli. Menomorinya Juni membuat kuitansinya jatuh di periode yang salah. */
  const n = nomorKuitansi(trx({ createdAt: '2026-06-30T23:00:00.000Z', paidAt: '2026-07-01T02:00:00.000Z' }));
  assert.ok(n.startsWith('KW/2026-07/'), `memakai bulan tagihan, bukan bulan lunas: ${n}`);
  // Tanpa paidAt, jatuh ke createdAt — bukan melempar, karena baris lama
  // memang bisa begitu.
  assert.ok(nomorKuitansi(trx({ paidAt: null })).startsWith('KW/2026-07/'));
});

test('tanggal tak sah MELEMPAR, tak menghasilkan nomor "KW/NaN-NaN"', () => {
  assert.throws(() => nomorKuitansi(trx({ paidAt: 'bukan tanggal' })), /tidak sah/);
});

test('dua transaksi berbeda tak pernah bernomor sama', () => {
  const a = nomorKuitansi(trx({ id: '11111111-1111-1111-1111-111111111111' }));
  const b = nomorKuitansi(trx({ id: '22222222-2222-2222-2222-222222222222' }));
  assert.notEqual(a, b);
});

/* ── nominal & terbilang ─────────────────────────────────────────────── */

test('terbilang benar pada bentuk yang sering salah', () => {
  /* "seratus" bukan "satu ratus", "seribu" bukan "satu ribu", dan belasan
     punya bentuknya sendiri. Terbilang yang salah bertentangan dengan
     angkanya di dokumen yang sama — dan yang dipercaya auditor adalah
     hurufnya. */
  assert.equal(terbilang(0), 'nol');
  assert.equal(terbilang(11), 'sebelas');
  assert.equal(terbilang(15), 'lima belas');
  assert.equal(terbilang(20), 'dua puluh');
  assert.equal(terbilang(100), 'seratus');
  assert.equal(terbilang(150), 'seratus lima puluh');
  assert.equal(terbilang(200), 'dua ratus');
  assert.equal(terbilang(1_000), 'seribu');
  assert.equal(terbilang(1_500), 'seribu lima ratus');
  assert.equal(terbilang(2_000), 'dua ribu');
  assert.equal(terbilang(299_000), 'dua ratus sembilan puluh sembilan ribu');
  assert.equal(terbilang(1_499_000), 'satu juta empat ratus sembilan puluh sembilan ribu');
});

test('terbilang rupiah diawali huruf besar dan berakhir "rupiah"', () => {
  assert.equal(terbilangRupiah(299_000), 'Dua ratus sembilan puluh sembilan ribu rupiah');
  assert.ok(terbilangRupiah(0).endsWith(' rupiah'));
});

test('rupiah memakai pemisah ribuan Indonesia', () => {
  assert.equal(rupiah(299_000), 'Rp299.000');
  assert.equal(rupiah(1_499_000), 'Rp1.499.000');
});

test('uraian tetap terbaca untuk paket yang tak dikenal', () => {
  /* Paket baru ditambahkan di limits.ts jauh lebih sering daripada di peta
     nama di sini. Uraian kosong pada kuitansi adalah dokumen tanpa keterangan
     pembayaran — tak bisa dipakai sama sekali. */
  assert.ok(uraian('pro', 3).includes('Pro'));
  assert.ok(uraian('pro', 3).includes('3 bulan'));
  const asing = uraian('paket-baru', 1);
  assert.ok(asing.includes('paket-baru') && asing.includes('1 bulan'), asing);
});

/* ── siapa yang boleh dapat kuitansi ─────────────────────────────────── */

test('kuitansi HANYA untuk transaksi lunas', () => {
  /* Kuitansi adalah bukti terima uang, dan pelanggan memakainya persis
     sebagai itu. Menerbitkan satu untuk tagihan yang belum dibayar akan
     berbalik jadi masalah kita, bukan masalah mereka. */
  assert.equal(bisaDicetak('paid'), true);
  for (const s of ['pending', 'expired', 'failed', '', 'PAID']) {
    assert.equal(bisaDicetak(s), false, `status "${s}" diloloskan`);
  }
  assert.ok(/bisaDicetak\(p\.status\)/.test(RUTE), 'rute tak memeriksa status');
  assert.ok(/status: 409/.test(RUTE), 'transaksi belum lunas tak ditolak dengan jelas');
});

test('transaksi diambil lewat paymentService (withTenant), bukan kueri lepas', () => {
  /* Id transaksi bisa ditebak. Yang menahan kebocoran lintas tenant adalah
     RLS di dalam withTenant, bukan pemeriksaan di kode rute. */
  assert.ok(/paymentService\.get\(user\.tenantId, id\)/.test(RUTE),
    'rute membaca transaksi tanpa lingkup tenant');
  assert.ok(!/db\.select|tx\.execute/.test(RUTE), 'rute mengakses DB langsung');
});

/* ── isi dokumen ─────────────────────────────────────────────────────── */

test('dokumen menyatakan dirinya BUKAN faktur pajak', () => {
  /* Faktur pajak menuntut status PKP dan terbit lewat e-Faktur DJP. Berkas
     yang mengaku faktur pajak justru merepotkan pelanggan saat diperiksa —
     dan itu kerugian yang kita timbulkan sendiri. */
  assert.ok(/bukan.{0,3}<\/b> faktur pajak|bukan faktur pajak/i.test(HAL),
    'halaman kuitansi tak menyatakan dirinya bukan faktur pajak');
  assert.ok(/e-Faktur/.test(HAL), 'tak menyebut jalur faktur pajak yang benar');
  /* Komentar SQL dipatahkan tiap ~78 kolom, jadi frasanya jarang utuh dalam
     satu baris. Yang diperiksa maknanya, bukan tata letaknya. */
  const migRata = MIG.replace(/^--\s?/gm, '').replace(/\s+/g, ' ');
  assert.ok(/BUKAN faktur pajak/i.test(migRata), 'migrasi tak mencatat batas ini');
});

test('identitas penerbit yang kosong DIKATAKAN, bukan dicetak kosong', () => {
  /* Baris nama yang kosong di kuitansi terlihat seperti kerusakan cetak, dan
     penerimanya akan menyangka berkasnya rusak alih-alih belum disiapkan. */
  assert.ok(/identitas penerbit belum diisi/i.test(HAL), 'penerbit kosong tak dijelaskan');
  assert.ok(/adaPenerbit/.test(HAL), 'halaman tak membedakan penerbit terisi/kosong');
});

test('kerangka aplikasi tak ikut tercetak', () => {
  /* Tanpa aturan cetak, hasil cetaknya memuat sidebar, tombol, dan latar
     gelap — halaman yang tak bisa dilampirkan ke pembukuan siapa pun. */
  assert.ok(/@media print\{/.test(CSS), 'tak ada aturan cetak');
  for (const bagian of ['.sidebar', '.topbar', '.kw-aksi']) {
    assert.ok(new RegExp(`${bagian.replace('.', '\\.')}[^{]*\\{[^}]*display:none`).test(CSS)
      || /\.sidebar, \.topbar, \.backdrop, \.kw-aksi\{ display:none/.test(CSS),
      `${bagian} ikut tercetak`);
  }
  // Tema gelap tak boleh mengubah warna dokumen yang dicetak.
  assert.ok(/\[data-theme="dark"\] \.kw\{ background:#fff/.test(CSS),
    'kuitansi ikut gelap di tema gelap — yang tercetak jadi berbeda');
});

/* ── riwayat ─────────────────────────────────────────────────────────── */

test('tombol kuitansi hanya muncul pada transaksi lunas', () => {
  assert.ok(/t\.status === 'paid'\s*\?\s*<a className="btn btn-sm" href=\{`\/kuitansi\//.test(BILLING),
    'tombol kuitansi tak dipagari status lunas');
  assert.ok(/BELUM LUNAS/.test(BILLING), 'transaksi belum lunas tak diberi keterangan');
});

test('riwayat memakai endpoint yang sudah ada, tak menambah kembarannya', () => {
  assert.ok(/useApi<Trx\[\]>\('\/api\/payments'\)/.test(BILLING),
    'riwayat tak membaca /api/payments');
});
