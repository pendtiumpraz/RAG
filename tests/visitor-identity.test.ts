import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';

import {
  AWALAN_TERVERIFIKASI, IdentitasDitolak, kanonPenanda, rahasiaPengunjungBaru,
  tandaTanganCocok, tandaTanganPengunjung, terverifikasi,
} from '../src/modules/chat/visitor-identity';
import { CONTOH_TANDA_TANGAN } from '../src/modules/chat/contoh-tanda-tangan';

/**
 * IDENTITAS PENGUNJUNG YANG DISUNTIK SITUS PELANGGAN.
 *
 * Fitur ini memindahkan riwayat percakapan seseorang mengikuti IDENTITASNYA,
 * jadi satu celah di sini berarti riwayat orang lain bisa dibaca. Yang dijaga
 * karena itu bukan "penanda bertanda tangan diterima" — itu jalur bahagia —
 * melainkan setiap jalan memutar yang membuat tanda tangannya bisa dilewati.
 */

const RAHASIA = 'a'.repeat(64);
const ttd = (penanda: string, rahasia = RAHASIA) =>
  createHmac('sha256', rahasia).update(penanda, 'utf8').digest('hex');

/* ── tanda tangannya sendiri ─────────────────────────────────────────── */

test('tanda tangan = HMAC-SHA256 hex atas penanda MENTAH', () => {
  /* Bentuknya sengaja sesederhana mungkin: pelanggan harus bisa menulis ulang
     perhitungan ini dalam lima bahasa dari satu baris dokumentasi, dan tiap
     tambahan (garam, cap waktu, urutan medan) melipatgandakan cara mereka
     salah — lalu menyalahkan kita. */
  assert.equal(tandaTanganPengunjung(RAHASIA, 'karyawan-4471'), ttd('karyawan-4471'));
  assert.match(tandaTanganPengunjung(RAHASIA, 'x'), /^[0-9a-f]{64}$/);
});

test('perbandingan tanda tangan TIDAK bocor lewat waktu', () => {
  /* Perbandingan string biasa berhenti di byte pertama yang berbeda, jadi
     lamanya menceritakan berapa karakter awal yang sudah benar — cukup untuk
     menebak tanda tangan satu karakter demi satu karakter. */
  const src = readFileSync('src/modules/chat/visitor-identity.ts', 'utf8');
  assert.ok(/timingSafeEqual/.test(src), 'pakai perbandingan biasa — bisa ditebak per karakter');
  assert.equal(tandaTanganCocok('abc', 'abc'), true);
  assert.equal(tandaTanganCocok('abc', 'abd'), false);
  // Panjang berbeda dipulangkan lebih dulu: timingSafeEqual MELEMPAR pada
  // buffer tak sama panjang, dan lemparan itu akan jadi 500 alih-alih 403.
  assert.doesNotThrow(() => tandaTanganCocok('abc', 'abcdef'));
  assert.equal(tandaTanganCocok('abc', 'abcdef'), false);
});

test('rahasia baru cukup panjang dan tak berulang', () => {
  const a = rahasiaPengunjungBaru();
  assert.match(a, /^[0-9a-f]{64}$/, 'rahasia bukan 32 byte hex');
  assert.notEqual(a, rahasiaPengunjungBaru());
});

/* ── inti: jalan memutar yang harus tertutup ─────────────────────────── */

test('penanda bertanda tangan sah masuk RUANG NAMA TERPISAH', () => {
  const hasil = kanonPenanda({ visitorId: 'karyawan-4471', visitorSig: ttd('karyawan-4471'), rahasia: RAHASIA });
  assert.equal(hasil, `${AWALAN_TERVERIFIKASI}karyawan-4471`);
  assert.equal(terverifikasi(hasil), true);
});

test('penanda TANPA tanda tangan tak bisa mendarat di baris yang terverifikasi', () => {
  /* INI yang paling menentukan di seluruh berkas. Tanpa ruang nama terpisah,
     penyerang cukup mengirim visitorId="karyawan-4471" TANPA tanda tangan dan
     mendarat di baris yang sama dengan orang yang sudah terverifikasi —
     tanda tangannya jadi hiasan yang bisa dilewati hanya dengan tidak
     mengirimkannya. */
  const polos = kanonPenanda({ visitorId: 'karyawan-4471' });
  const bertanda = kanonPenanda({ visitorId: 'karyawan-4471', visitorSig: ttd('karyawan-4471'), rahasia: RAHASIA });
  assert.notEqual(polos, bertanda);
  assert.equal(terverifikasi(polos), false);
});

test('awalan yang dicadangkan tak bisa diketik sendiri', () => {
  /* Kalau boleh, ruang nama terpisah itu tinggal ditiru: kirim
     visitorId="t:karyawan-4471" tanpa tanda tangan, dan mendarat di baris
     yang sama dengan yang terverifikasi. */
  assert.throws(() => kanonPenanda({ visitorId: `${AWALAN_TERVERIFIKASI}karyawan-4471` }), IdentitasDitolak);
});

test('tanda tangan SALAH ditolak, tak diam-diam jadi anonim', () => {
  /* Kalau jatuh ke anonim, pemasangan yang tanda tangannya salah akan tampak
     bekerja sambil menulis riwayat ke penanda yang keliru — ketahuan
     berminggu-minggu kemudian saat riwayatnya dicari dan tak ada. */
  assert.throws(() => kanonPenanda({ visitorId: 'karyawan-4471', visitorSig: ttd('orang-lain'), rahasia: RAHASIA }),
    IdentitasDitolak);
  assert.throws(() => kanonPenanda({ visitorId: 'karyawan-4471', visitorSig: 'bukan-hex', rahasia: RAHASIA }),
    IdentitasDitolak);
});

test('tanda tangan dari RAHASIA LAIN ditolak', () => {
  /* Satu pelanggan tak boleh bisa menandatangani penanda untuk chatbot
     pelanggan lain. */
  assert.throws(() => kanonPenanda({
    visitorId: 'karyawan-4471', visitorSig: ttd('karyawan-4471', 'b'.repeat(64)), rahasia: RAHASIA,
  }), IdentitasDitolak);
});

test('tanda tangan dikirim ke chatbot yang BELUM menyalakannya → ditolak', () => {
  /* Bukan diloloskan sebagai anonim: memperlakukannya sebagai anonim berarti
     pemasangan yang salah konfigurasi diam-diam kehilangan seluruh
     riwayatnya, dan tak ada satu pun galat yang menjelaskannya. */
  assert.throws(() => kanonPenanda({ visitorId: 'karyawan-4471', visitorSig: ttd('karyawan-4471'), rahasia: null }),
    IdentitasDitolak);
});

test('bentuk penanda dibatasi — spasi & karakter kendali ditolak', () => {
  /* Satu penanda yang bisa ditulis dua cara berbeda berakhir sebagai dua
     riwayat terpisah untuk orang yang sama. */
  for (const buruk of ['', '   ', 'a b', 'a\nb', 'a\tb', 'x'.repeat(129), 'péhé', '<script>']) {
    assert.throws(() => kanonPenanda({ visitorId: buruk }), IdentitasDitolak, `lolos: ${JSON.stringify(buruk)}`);
  }
  // Bentuk id yang nyata dipakai pelanggan harus tetap diterima.
  for (const baik of ['4471', 'karyawan-4471', 'a.b_c@perusahaan.co.id',
    '550e8400-e29b-41d4-a716-446655440000', 'v_abc123']) {
    assert.doesNotThrow(() => kanonPenanda({ visitorId: baik }), `ditolak padahal wajar: ${baik}`);
  }
});

/* ── jalur lama tak boleh mati ───────────────────────────────────────── */

test('penanda peramban lama tetap bekerja apa adanya', () => {
  /* Identitas suntikan adalah lapisan TAMBAHAN. Kalau ia menggantikan jalur
     lama, setiap widget yang sudah terpasang hari ini akan mati — dan
     riwayat yang sudah tersimpan dengan penanda lama jadi tak terjangkau. */
  assert.equal(kanonPenanda({ visitorId: 'v_abc123' }), 'v_abc123');
  assert.equal(kanonPenanda({ visitorId: 'v_abc123', visitorSig: '' }), 'v_abc123');
  assert.equal(kanonPenanda({ visitorId: 'v_abc123', visitorSig: null }), 'v_abc123');
});

test('embed.js menolak pemasangan setengah jadi', () => {
  /* Tanda tangan tanpa penanda (atau sebaliknya) lalu diam-diam jatuh ke
     penanda acak akan tampak bekerja sambil menulis riwayat ke tempat yang
     salah. */
  const e = readFileSync('public/embed.js', 'utf8');
  assert.ok(/data-visitor-sig/.test(e), 'embed.js tak membaca tanda tangan');
  assert.ok(/harus ada berdua/.test(e), 'pemasangan setengah jadi tak diperingatkan');
  assert.ok(/injVisitor \|\| localStorage\.getItem\('nalar_visitor'\)/.test(e),
    'jalur localStorage lama hilang — widget yang sudah terpasang akan mati');
});

/* ── rahasia tak boleh meninggalkan server ───────────────────────────── */

test('ciphertext rahasia TIDAK ikut ke peramban', () => {
  /* repo.listActive memakai select() tanpa kolom eksplisit, jadi SETIAP kolom
     baru otomatis ikut terkirim — termasuk visitor_secret. Ia memang
     terenkripsi, tapi ciphertext yang beredar di klien adalah bahan yang tak
     pernah perlu ada di sana, dan tak satu pun layar membutuhkannya. */
  const svc = readFileSync('src/modules/chatbot/chatbot.service.ts', 'utf8');
  assert.ok(/tanpaRahasia/.test(svc), 'tak ada penyaring rahasia');
  const blokList = svc.slice(svc.indexOf('async list('), svc.indexOf('async create('));
  assert.ok(/tanpaRahasia/.test(blokList), 'daftar chatbot mengirim ciphertext ke peramban');
  for (const p of ['src/app/api/chatbots/route.ts', 'src/app/api/chatbots/[id]/route.ts']) {
    assert.ok(/tanpaRahasia/.test(readFileSync(p, 'utf8')), `${p} membalas baris mentah`);
  }
});

test('rahasia hanya dikembalikan SEKALI, saat dibuat', () => {
  /* Menyimpannya agar bisa "dilihat lagi" berarti seluruh riwayat pelanggan
     bergantung pada satu layar dasbor yang bisa dibuka siapa pun yang sempat
     duduk di kursi yang salah. */
  const svc = readFileSync('src/modules/chatbot/chatbot.service.ts', 'utf8');
  const blok = svc.slice(svc.indexOf('async setRahasiaPengunjung'), svc.indexOf('embedSnippet('));
  assert.ok(/encryptSecret\(rahasia\)/.test(blok), 'rahasia disimpan polos');
  assert.ok(/return \{ rahasia \}/.test(blok));
  assert.ok(/pastikanBoleh/.test(blok), 'memutar rahasia tak memeriksa divisi');
  // Tak ada endpoint yang MEMBACA rahasia yang tersimpan.
  const route = readFileSync('src/app/api/chatbots/[id]/visitor-secret/route.ts', 'utf8');
  assert.ok(!/GET/.test(route), 'ada jalur membaca rahasia yang sudah tersimpan');
  assert.ok(/requireRole\('superadmin', 'admin'\)/.test(route), 'siapa pun bisa memutar rahasia');
});

/* ── contoh kode ─────────────────────────────────────────────────────── */

test('lima bahasa, sesuai yang diminta', () => {
  assert.deepEqual(CONTOH_TANDA_TANGAN.map((c) => c.id), ['php', 'node', 'python', 'go', 'java']);
});

test('tiap contoh menyebut algoritma, rahasia, dan penandanya', () => {
  /* Potongan kode yang kurang satu bagian akan disalin apa adanya lalu
     menghasilkan tanda tangan yang tak pernah cocok — dan yang disalahkan
     adalah produk kita, bukan potongannya. */
  for (const c of CONTOH_TANDA_TANGAN) {
    assert.match(c.kode, /sha256|SHA256|HmacSHA256/, `${c.id}: algoritma tak disebut`);
    assert.ok(/NALAR_VISITOR_SECRET/.test(c.kode), `${c.id}: sumber rahasia tak disebut`);
    assert.ok(/data-visitor-sig/.test(c.kode), `${c.id}: pemasangan widgetnya tak ditunjukkan`);
    assert.ok(c.berkas.length > 0);
  }
});

test('tiap contoh MENEGASKAN bahwa perhitungannya di SERVER', () => {
  /* Rahasia yang dihitung di peramban bisa dibaca siapa pun yang membuka
     devtools, dan seluruh perlindungan ini runtuh dalam satu langkah. */
  for (const c of CONTOH_TANDA_TANGAN) {
    assert.match(c.kode, /SERVER/i, `${c.id}: tak menegaskan sisi server`);
    assert.match(c.kode, /tidak pernah di (peramban|browser)/i, `${c.id}: peringatan peramban hilang`);
  }
});
