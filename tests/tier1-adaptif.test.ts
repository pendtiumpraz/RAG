import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { irisBlok } from './_iris';
import {
  RASIO_KORPUS, TIER1_MAKS, TIER1_MIN, tier1Docs, tier1Mentok,
} from '../src/modules/chat/tier1';

/**
 * AMBANG LAPISAN PERTAMA — kenapa ia tak boleh angka tetap.
 *
 * Dokumen yang tersingkir di lapisan pertama TAK AKAN PERNAH dibaca lapisan
 * kedua, dan tak ada satu pun gejala yang muncul. Pada korpus 400 dokumen,
 * 120 adalah 30% isi — longgar. Pada 3,5 juta dokumen, 120 adalah 0,003%, dan
 * angka yang sama berubah dari "longgar" jadi ATAP RECALL seluruh sistem.
 *
 * KESIMPULAN YANG TIDAK MENYENANGKAN, dan justru itu yang harus dijaga: model
 * pertumbuhan di modules/eval/tier1.ts LINEAR, jadi ambang yang mempertahankan
 * recall juga harus tumbuh linear — dan pada korpus raksasa itu berarti tidak
 * menyaring sama sekali. Membesarkan ambang TIDAK menyelamatkan recall di
 * sana; yang menyelamatkannya adalah MENGECILKAN KORPUS EFEKTIF lewat
 * penyaring metadata. Tes di bawah menjaga supaya kenyataan itu tak tertutup
 * oleh rumus yang terlihat pintar.
 */

test('korpus kecil TIDAK jadi lebih buruk dari sebelum kartu ini', () => {
  /* Perubahan yang membuat sebagian pemasangan lebih buruk demi membuat
     sebagian lain lebih baik bukan perbaikan — ia memindahkan kerugian ke
     orang yang tak diajak bicara. */
  assert.equal(tier1Docs(1), TIER1_MIN);
  assert.equal(tier1Docs(100), TIER1_MIN);
  assert.equal(tier1Docs(400), TIER1_MIN, 'korpus 400 dokumen (yang diukur) turun di bawah nilai lama');
});

test('ambangnya TUMBUH mengikuti korpus, bukan diam di tempat', () => {
  assert.ok(tier1Docs(2_000) > TIER1_MIN, 'korpus 2.000 dokumen masih memakai ambang korpus kecil');
  assert.ok(tier1Docs(2_000) > tier1Docs(1_000), 'ambang tak tumbuh bersama korpus');
  assert.equal(tier1Docs(1_000), Math.ceil(1_000 * RASIO_KORPUS));
});

test('ada ATAP, dan atapnya anggaran WAKTU — bukan anggaran ketepatan', () => {
  /* Lapisan kedua memindai potongan milik dokumen terpilih; di lambda
     berkolam max:1 dengan tenggat 60 detik, ambang yang tumbuh tanpa batas
     memindahkan kegagalan dari "jawaban meleset" ke "permintaan mati di
     tengah" — dan yang kedua jauh lebih sulit didiagnosis. */
  assert.equal(tier1Docs(1_000_000), TIER1_MAKS);
  assert.equal(tier1Docs(3_500_000), TIER1_MAKS);
  assert.ok(TIER1_MAKS > TIER1_MIN);
});

test('keadaan MENTOK bisa dikenali — supaya bisa dicatat', () => {
  /* Keadaan yang tak pernah dicatat adalah keadaan yang baru diketahui saat
     ada yang mengeluh jawabannya meleset, berbulan-bulan kemudian, tanpa satu
     pun jejak yang menghubungkannya. */
  assert.equal(tier1Mentok(400), false);
  assert.equal(tier1Mentok(3_500_000), true);
  const persisAtap = Math.ceil(TIER1_MAKS / RASIO_KORPUS);
  assert.equal(tier1Mentok(persisAtap), false, 'tepat di atap dilaporkan mentok');
  assert.equal(tier1Mentok(persisAtap + 100), true);
});

test('ukuran tak diketahui jatuh ke batas bawah, bukan ke tebakan', () => {
  /* Menebak besar membuat setiap korpus kecil membayar biaya korpus besar;
     menebak kecil menurunkan recall diam-diam. Yang berlaku hari ini adalah
     pilihan yang paling tidak mengejutkan. */
  for (const buruk of [0, -1, Number.NaN, null, undefined, Number.POSITIVE_INFINITY]) {
    assert.equal(tier1Docs(buruk as number), TIER1_MIN, `tier1Docs(${String(buruk)}) tak jatuh ke batas bawah`);
  }
});

/* ── pemasangannya di retrieval ───────────────────────────────────────── */

const SVC = readFileSync('src/modules/chat/retrieval.service.ts', 'utf8');

test('tak ada lagi angka ambang yang ditulis mati di retrieval', () => {
  assert.ok(!/const TIER1_DOCS = \d+;/.test(SVC),
    'ambang tetap masih ada — perubahan ini tak berlaku sama sekali');
  assert.ok(/limit \$\{tier1Ambang\}/.test(SVC), 'lapisan pertama tak memakai ambang adaptif');
});

test('ukuran korpus dihitung BERBATAS, bukan penuh', () => {
  /* Menghitung penuh berarti memindai jutaan baris pada tiap pertanyaan untuk
     memutuskan sebuah pengoptimalan — cara membayar ongkos yang hendak
     dihemat. Di atas batas, jawabannya selalu sama. */
  assert.ok(/BATAS_HITUNG = Math\.ceil\(TIER1_MAKS \/ RASIO_KORPUS\)/.test(SVC),
    'batas hitung tak diturunkan dari titik rumusnya mentok');
  assert.ok(/limit \$\{BATAS_HITUNG \+ 1\}/.test(SVC),
    'tanpa +1, "persis sebanyak batas" tak bisa dibedakan dari "lebih banyak"');
});

test('penyaring metadata IKUT dihitung — itu inti kartunya', () => {
  /* Yang menentukan bukan besar KORPUS melainkan besar korpus YANG MASIH
     MUNGKIN TERAMBIL. Penyaring yang menyempitkan ke 5.000 dokumen membuat
     ambang kecil masuk akal lagi — dan itulah satu-satunya jalan keluar di
     korpus raksasa, karena membesarkan ambang saja tidak cukup. */
  const blok = SVC.slice(SVC.indexOf('const jumlahTier1 = await withTenant'));
  assert.ok(/\$\{saringSql\('v'\)\}/.test(blok.slice(0, 900)),
    'hitungan korpus mengabaikan penyaring — ambangnya jadi menjawab pertanyaan yang salah');
});

test('keadaan mentok DICATAT ke log, bukan didiamkan', () => {
  assert.ok(/tier1\.mentok/.test(SVC), 'korpus yang melewati atap tak meninggalkan jejak apa pun');
});

/* ── alat ukurnya tidak boleh mengukur angka yang salah ───────────────── */

test('harness eval memakai ambang yang SAMA dengan produksi', () => {
  /* Bentuk kegagalan yang sudah terjadi sekali: komentarnya berbunyi "dibaca
     dari sana, bukan disalin" padahal angkanya salinan — dan salinannya
     tertinggal di 40 sementara produksi sudah 120. Seluruh laporannya lalu
     menjawab pertanyaan tentang ambang yang tak dipakai siapa pun. */
  const h = readFileSync('scripts/tier1-recall.ts', 'utf8');
  assert.ok(/from '@\/modules\/chat\/tier1'/.test(h),
    'harness tak mengimpor ambang dari sumber yang dipakai produksi');
  assert.ok(!/const TIER1_DOCS = \d+/.test(h), 'harness menyalin angka ambang lagi');
});

test('proyeksinya membandingkan adaptif LAWAN tetap', () => {
  /* Tanpa pembanding, tak ada cara melihat apa yang dibeli perubahan ini —
     dan angka yang tak bisa dibandingkan gampang terbaca sebagai kemajuan
     padahal bukan. */
  const h = readFileSync('scripts/tier1-recall.ts', 'utf8');
  assert.ok(/recall bila ambang tetap/.test(h), 'proyeksi tak menyertakan pembanding');
  assert.ok(/MENTOK/.test(h), 'proyeksi tak menandai di mana ambangnya menabrak atap');
});

/* ── alasannya tetap benar ────────────────────────────────────────────── */

test('model pertumbuhannya MASIH linear — itu dasar seluruh rumus ini', () => {
  /* Kalau suatu hari proyeksinya berubah bentuk (mis. jadi akar), rasio tetap
     di tier1.ts berhenti masuk akal dan harus diturunkan ulang. Aturan yang
     alasannya sudah hilang adalah aturan yang dilanggar orang berikutnya. */
  const ev = readFileSync('src/modules/eval/tier1.ts', 'utf8');
  const blok = irisBlok(ev, 'export function proyeksikan(');
  assert.ok(/const faktor = \(nTarget - 1\) \/ \(nUkur - 1\)/.test(blok),
    'model proyeksi tak lagi linear — RASIO_KORPUS di chat/tier1.ts harus diturunkan ulang');
});
