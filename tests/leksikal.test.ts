import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  type PotonganLeksikal, istilahLangka, peringkatLeksikal, ringkasLeksikal, siapkanKorpus,
} from '../src/modules/eval/leksikal';

/**
 * JANGKAUAN KAKI LEKSIKAL — alat ukurnya, bukan hasilnya.
 *
 * Alat ukur yang salah di sini menghasilkan angka yang TERLIHAT menenangkan:
 * "leksikal menjangkau 100%" adalah kesimpulan yang menutup kartu
 * a-embed-template secara permanen, dan menutupnya karena bug jauh lebih
 * mahal daripada tak menutupnya sama sekali.
 */

const p = (id: string, teks: string): PotonganLeksikal => ({ id, teks });

test('istilah langka dihitung per DOKUMEN, bukan per potongan', () => {
  /* Cacat ini nyata dan sempat lolos. Nomor register sebuah kontrak diulang
     di SETIAP potongan dokumennya (60 kali di korpus uji), jadi ambang per
     potongan membuatnya terlihat umum padahal ia menunjuk tepat satu
     dokumen. Gejalanya: laporan menyebut "0% istilah langka" berbarengan
     dengan "jangkauan 100%" — dua angka yang tak mungkin benar bersamaan. */
  const potongan: PotonganLeksikal[] = [];
  for (let n = 0; n < 60; n++) potongan.push(p(`doc-a#${n}`, `perjanjian arb9001 pasal ${n}`));
  for (let n = 0; n < 60; n++) potongan.push(p(`doc-b#${n}`, `perjanjian arb9002 pasal ${n}`));

  const korpus = siapkanKorpus(potongan);
  assert.equal(korpus.jumlahDok, 2, 'dokumen tak dikenali dari id potongan');

  // arb9001 muncul di 60 POTONGAN tapi hanya 1 DOKUMEN → langka.
  assert.deepEqual(istilahLangka('nilai arb9001', korpus, 1), ['arb9001']);
  // 'perjanjian' ada di kedua dokumen → tidak langka pada ambang 1.
  assert.deepEqual(istilahLangka('perjanjian itu', korpus, 1), []);
});

test('korpus ditokenisasi SEKALI, bukan per pertanyaan', () => {
  /* Versi pertama menokenisasi ulang tiap potongan untuk setiap pertanyaan —
     800 × 12.000 tokenisasi, dan pengukurannya tak selesai dalam lima menit.
     Bentuk KorpusLeksikal-lah yang memaksa perhitungan itu terjadi sekali. */
  const korpus = siapkanKorpus([p('d#0', 'alfa beta'), p('d#1', 'gama')]);
  assert.ok(Array.isArray(korpus.tok) && korpus.tok[0] instanceof Set);
  assert.equal(korpus.tok.length, 2);
  assert.equal(korpus.indeksById.get('d#1'), 1);
});

test('pertanyaan tanpa istilah → null, BUKAN peringkat besar', () => {
  /* Di produksi keadaan itu berarti kaki leksikal DILEWATI seluruhnya.
     Menyamakannya dengan "peringkat besar" akan menghitungnya sebagai
     leksikal yang berpendapat dan salah — padahal ia tak berpendapat. */
  const korpus = siapkanKorpus([p('d#0', 'nilai kontrak')]);
  assert.equal(peringkatLeksikal('apa itu?', korpus, 'd#0'), null);
  assert.notEqual(peringkatLeksikal('nilai kontrak', korpus, 'd#0'), null);
});

test('potongan yang tak tercocoki sama sekali jatuh ke peringkat TERAKHIR', () => {
  const korpus = siapkanKorpus([p('d#0', 'alfa'), p('d#1', 'beta'), p('d#2', 'gama')]);
  assert.equal(peringkatLeksikal('delta epsilon', korpus, 'd#0'), 3);
});

test('seri dihitung MEMBERATKAN sasaran', () => {
  /* Korpus bertemplate penuh potongan yang mencocoki istilah yang sama
     persis. Menganggap sasaran menang saat seri akan melaporkan jangkauan
     yang lebih baik daripada yang akan dilihat pengguna. */
  const korpus = siapkanKorpus([p('d#0', 'nilai kontrak'), p('d#1', 'nilai kontrak')]);
  assert.equal(peringkatLeksikal('nilai kontrak', korpus, 'd#0'), 2);
});

test('istilah yang LEBIH BANYAK cocok menang — meniru ts_rank_cd', () => {
  const korpus = siapkanKorpus([
    p('d#0', 'nilai pekerjaan kontrak arb9001'),
    p('d#1', 'nilai saja'),
    p('d#2', 'kontrak saja'),
  ]);
  assert.equal(peringkatLeksikal('nilai kontrak arb9001', korpus, 'd#0'), 1);
});

test('sasaran yang tak ada di korpus MELEMPAR, bukan diam', () => {
  /* Kalau ia diam dan mengembalikan peringkat 1, kesalahan penyusunan korpus
     akan tampak sebagai jangkauan sempurna. */
  const korpus = siapkanKorpus([p('d#0', 'alfa')]);
  assert.throws(() => peringkatLeksikal('alfa', korpus, 'tak-ada'), /tak ada di korpus/);
});

test('ringkasan membedakan "tak berpendapat" dari "tak terjangkau"', () => {
  const r = ringkasLeksikal([1, 5, 40, null], [1, 0, 0, 0], 12);
  assert.equal(r.n, 4);
  assert.equal(r.tanpaIstilah, 1);
  // Penyebutnya SELURUH pertanyaan, bukan hanya yang berpendapat — kalau
  // hanya yang berpendapat, melewatkan pertanyaan justru menaikkan angkanya.
  assert.equal(r.jangkauan, 2 / 4);
  assert.equal(r.punyaIstilahLangka, 1);
});

test('korpus sintetis menyediakan pertanyaan versi KATA, bukan hanya kode', () => {
  /* Tanpa varian itu, pengukurannya hanya bisa menjawab kasus yang sudah
     diketahui aman (orang memegang nomor dokumennya) dan sama sekali tak
     menyentuh pertanyaan yang justru berisiko. */
  const { bangunKorpus } = require('../src/modules/eval/korpus-sintetis') as
    typeof import('../src/modules/eval/korpus-sintetis');
  const k = bangunKorpus(8);
  const fakta = k.flatMap((d) => d.potongan.filter((x) => x.tanya));
  assert.equal(fakta.length, 8 * 4);
  for (const f of fakta) {
    assert.ok(f.tanyaKata, 'potongan berfakta tanpa varian pertanyaan berkata');
    assert.ok(!/(ARB|SOP|HR|LK)-\d+/.test(f.tanyaKata!),
      `varian "kata" masih menyebut kode: ${f.tanyaKata}`);
  }
});
