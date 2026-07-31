/**
 * JANGKAUAN KAKI LEKSIKAL — `npm run eval:leksikal`
 *
 * Menjawab satu-satunya pertanyaan yang tersisa di kartu a-embed-template:
 * pencarian vektor terbukti lemah pada korpus bertemplate, tapi produksi
 * belum terlihat rusak karena kaki LEKSIKAL menangkap nomor register dan
 * nama pihak yang persis. Berapa besar sisanya — pertanyaan yang menyebut
 * dokumen dengan KATA-KATA, bukan dengan kode?
 *
 * TIDAK memanggil model, TIDAK menyentuh basis data. Yang ditanyakan memang
 * murni soal teks: apakah pertanyaan memuat istilah yang cukup langka untuk
 * menunjuk satu dokumen. Menjalankan embedding untuk itu berarti mengukur
 * hal lain — dan menghabiskan setengah jam untuk jawaban yang keliru.
 */
import { bangunKorpus } from '@/modules/eval/korpus-sintetis';
import {
  type PotonganLeksikal, istilahLangka, peringkatLeksikal, ringkasLeksikal, siapkanKorpus,
} from '@/modules/eval/leksikal';

/** Sepadan dengan `pool` kandidat di retrieval.service (k*5, dibatasi 20–40). */
const BATAS = 12;
/** Istilah dianggap LANGKA bila muncul di ≤ sekian DOKUMEN (bukan potongan). */
const AMBANG_DF = 3;

function arg(nama: string, bawaan: number): number {
  const m = process.argv.find((a) => a.startsWith(`--${nama}=`));
  const v = m ? Number(m.split('=')[1]) : NaN;
  return Number.isFinite(v) && v > 0 ? v : bawaan;
}

function main() {
  const nDok = arg('dok', 400);
  const korpus = bangunKorpus(nDok);

  const potongan: PotonganLeksikal[] = [];
  const soal: Array<{ dengankode: string; kata: string; id: string; rumpun: string }> = [];
  for (const d of korpus) {
    for (const p of d.potongan) {
      const id = `${d.docRef}#${p.nomor}`;
      potongan.push({ id, teks: p.teks });
      if (p.tanya && p.tanyaKata) {
        soal.push({ dengankode: p.tanya, kata: p.tanyaKata, id, rumpun: d.rumpun });
      }
    }
  }

  /* Ditokenisasi SEKALI. Versi pertama menokenisasi ulang tiap potongan untuk
     setiap pertanyaan — 800 × 12.000 tokenisasi teks 700 karakter, dan
     pengukurannya tak selesai dalam lima menit. */
  const indeks = siapkanKorpus(potongan);

  console.log(`\nJANGKAUAN KAKI LEKSIKAL — ${korpus.length} dokumen · ${potongan.length} potongan · ${soal.length} pertanyaan`);
  console.log(`Potongan benar dihitung "terjangkau" bila masuk ${BATAS} teratas kaki leksikal.\n`);

  for (const [label, ambil] of [
    ['MENYEBUT KODE   (ARB-1234, SOP-2001, …)', (s: typeof soal[number]) => s.dengankode],
    ['KATA-KATA SAJA  (nama pihak, unit, tahun)', (s: typeof soal[number]) => s.kata],
  ] as const) {
    const peringkat = soal.map((s) => peringkatLeksikal(ambil(s), indeks, s.id));
    const langka = soal.map((s) => istilahLangka(ambil(s), indeks, AMBANG_DF).length);
    const r = ringkasLeksikal(peringkat, langka, BATAS);

    console.log(label);
    console.log(`  jangkauan @${BATAS}       : ${(r.jangkauan * 100).toFixed(1)}%`);
    console.log(`  punya istilah langka : ${(r.punyaIstilahLangka / r.n * 100).toFixed(1)}%  (muncul di ≤ ${AMBANG_DF} dokumen)`);
    console.log(`  tanpa istilah sama sekali: ${r.tanpaIstilah}`);
    console.log(`  rerata peringkat     : ${r.rerataPeringkat.toFixed(1)} dari ${potongan.length}\n`);
  }

  console.log('Cara membaca angka di atas:');
  console.log('  • Selisih antara kedua baris ITULAH ukuran ketergantungan pada kode.');
  console.log('    Kalau baris kedua jauh lebih rendah, jaring pengaman leksikal hanya');
  console.log('    bekerja untuk orang yang sudah memegang nomor dokumennya — dan orang');
  console.log('    yang memegang nomornya biasanya tak perlu bertanya.');
  console.log('  • "punya istilah langka" adalah sebabnya, bukan sekadar gejala:');
  console.log('    di korpus bertemplate, hampir semua kata muncul di setiap potongan,');
  console.log('    dan yang menunjuk satu dokumen hanya token yang jarang.\n');
}

main();
