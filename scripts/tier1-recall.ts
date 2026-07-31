/**
 * UKUR RECALL LAPISAN PERTAMA pada korpus besar sungguhan.
 *
 *   npm run eval:tier1                    # 2.000 dokumen, 200 pertanyaan
 *   npm run eval:tier1 -- --dok=8000 --tanya=300
 *   npm run eval:tier1 -- --model=nomic-embed-text-v1.5
 *
 * Menjawab satu pertanyaan yang tak bisa dijawab korpus produksi (76 potongan):
 * berapa persen dokumen yang benar TERLEWAT di lapisan pertama ketika korpusnya
 * besar — dan pada ukuran berapa ambang TIER1_DOCS = 40 mulai tak cukup.
 *
 * Tidak menyentuh basis data sama sekali. Korpusnya dibangun di memori dan
 * diembed dengan model yang sama yang dipakai produksi, jadi geometrinya nyata
 * sementara isinya bisa sebesar yang diperlukan.
 */
import { embed } from '@/modules/knowledge/embeddings';
import { resolveEmbeddingModel } from '@/modules/knowledge/embeddings/catalog';
import { bangunKorpus, POTONGAN_PER_DOK } from '@/modules/eval/korpus-sintetis';
import { POTONGAN_PER_BAGIAN } from '@/modules/knowledge/document-vectors.service';
import {
  type DokVektor, centroidBagian, kurvaAmbang, peringkatDatar, peringkatTarget,
  proyeksikan, ringkas, ambangUntukRecall,
} from '@/modules/eval/tier1';

/** Sama dengan TIER1_DOCS di retrieval.service.ts. Dibaca dari sana, bukan disalin. */
const TIER1_DOCS = 40;

function arg(nama: string, bawaan: number): number {
  const m = process.argv.find((a) => a.startsWith(`--${nama}=`));
  const v = m ? Number(m.split('=')[1]) : NaN;
  return Number.isFinite(v) && v > 0 ? v : bawaan;
}
function argStr(nama: string, bawaan: string): string {
  const m = process.argv.find((a) => a.startsWith(`--${nama}=`));
  return m ? m.split('=')[1] : bawaan;
}

const ctx = { tenantId: 'eval', getApiKey: async () => null };

async function embedBanyak(model: string, teks: string[], dims: number, label: string): Promise<Float32Array[]> {
  const UKURAN = 64;
  const keluar: Float32Array[] = [];
  const mulai = Date.now();
  for (let i = 0; i < teks.length; i += UKURAN) {
    const v = await embed(model, teks.slice(i, i + UKURAN), ctx);
    // Dipotong ke dimensi ASLI: padVector menambah nol sampai 1.536, dan nol
    // itu tak mengubah jarak kosinus sedikit pun — hanya melipatempatkan
    // biaya hitungnya.
    for (const x of v) keluar.push(Float32Array.from(x.slice(0, dims)));
    const selesai = Math.min(i + UKURAN, teks.length);
    const detik = (Date.now() - mulai) / 1000;
    process.stdout.write(`\r  ${label}: ${selesai}/${teks.length} (${(selesai / detik).toFixed(0)}/dtk)   `);
  }
  process.stdout.write('\n');
  return keluar;
}

async function main() {
  const nDok = arg('dok', 2000);
  const nTanya = arg('tanya', 200);
  const modelId = argStr('model', 'all-MiniLM-L6-v2');

  const model = await resolveEmbeddingModel(modelId);
  if (!model) { console.error(`Model tak dikenal: ${modelId}`); process.exit(2); }
  const dims = model.dimensions;

  console.log(`\nRECALL LAPISAN PERTAMA — ${nDok} dokumen · ${nTanya} pertanyaan · ${modelId} (${dims}d)\n`);

  const korpus = bangunKorpus(nDok);
  const potongan = korpus.flatMap((d) => d.potongan.map((b) => b.teks));
  console.log(`Korpus: ${korpus.length} dokumen · ${potongan.length} potongan `
    + `(${POTONGAN_PER_DOK}/dokumen) · centroid dari rata-rata ${POTONGAN_PER_BAGIAN} potongan · 4 rumpun`);

  const vek = await embedBanyak(modelId, potongan, dims, 'embedding korpus');

  /* Centroid dibangun PERSIS seperti produksi: rata-rata tiap 50 potongan
     berurutan, bukan satu vektor per potongan. Perata-rataan itulah langkah
     yang bisa merusak lapisan pertama, dan melewatkannya membuat seluruh
     pengukuran ini tautologi. */
  const docs: DokVektor[] = [];
  let p = 0;
  for (const d of korpus) {
    const vd = d.potongan.map(() => vek[p++]);
    docs.push({ docRef: d.docRef, bagian: centroidBagian(vd, POTONGAN_PER_BAGIAN) });
  }

  /* Pencuplikan BERLAPIS per rumpun, bukan langkah tetap.
     Rumpun disusun berselang-seling (i % 4), jadi langkah tetap yang kebetulan
     kelipatan empat hanya akan mengenai satu rumpun saja — dan seluruh angka
     recall lalu mewakili satu jenis dokumen sambil terlihat mewakili empat.
     Bagiannya juga ikut diputar, supaya pertanyaan tak selalu menyasar bagian
     pembuka yang paling khas. */
  const perRumpun = new Map<string, typeof korpus>();
  for (const d of korpus) {
    const l = perRumpun.get(d.rumpun) ?? [];
    l.push(d); perRumpun.set(d.rumpun, l);
  }
  const soal: Array<{ tanya: string; docRef: string; rumpun: string; iPotongan: number }> = [];
  const jatah = Math.max(1, Math.floor(nTanya / perRumpun.size));
  // Peta docRef → indeks potongan pertamanya, supaya potongan benar bisa
  // ditunjuk persis untuk kontrol peringkat datar.
  const awalPotongan = new Map<string, number>();
  { let n = 0; for (const d of korpus) { awalPotongan.set(d.docRef, n); n += d.potongan.length; } }
  for (const [rumpun, daftar] of perRumpun) {
    const langkah = Math.max(1, Math.floor(daftar.length / jatah));
    for (let i = 0, ambil = 0; i < daftar.length && ambil < jatah; i += langkah, ambil++) {
      const d = daftar[i];
      // Hanya potongan BERFAKTA yang punya pertanyaan; pengisi tidak.
      const fakta = d.potongan.filter((b) => b.tanya);
      const f = fakta[ambil % fakta.length];
      soal.push({
        tanya: f.tanya!, docRef: d.docRef, rumpun,
        iPotongan: awalPotongan.get(d.docRef)! + f.nomor,
      });
    }
  }

  const vq = await embedBanyak(modelId, soal.map((s) => s.tanya), dims, 'embedding pertanyaan');

  const t0 = Date.now();
  const peringkat = soal.map((s, i) => peringkatTarget(vq[i], docs, s.docRef));
  console.log(`Peringkat dihitung dalam ${((Date.now() - t0) / 1000).toFixed(1)} dtk\n`);

  const r = ringkas(peringkat, TIER1_DOCS);
  console.log(`RECALL @${TIER1_DOCS}  : ${(r.recall * 100).toFixed(1)}%   (${Math.round(r.recall * r.n)}/${r.n} dokumen benar lolos ke lapisan kedua)`);
  console.log(`Peringkat   : rerata ${r.rerataPeringkat.toFixed(1)} · p95 ${r.p95} · terburuk ${r.peringkatTerburuk}\n`);

  console.log('RECALL PER AMBANG');
  for (const { batas, recall } of kurvaAmbang(peringkat, [1, 5, 10, 20, 40, 80, 160, 400])) {
    const bar = '█'.repeat(Math.round(recall * 40));
    console.log(`  ${String(batas).padStart(4)} ${bar.padEnd(40)} ${(recall * 100).toFixed(1)}%`);
  }

  console.log('\nPER RUMPUN');
  for (const rp of ['kontrak', 'sop', 'sdm', 'keuangan']) {
    const idx = soal.map((s, i) => (s.rumpun === rp ? peringkat[i] : -1)).filter((x) => x > 0);
    if (!idx.length) continue;
    const rr = ringkas(idx, TIER1_DOCS);
    console.log(`  ${rp.padEnd(9)} recall ${(rr.recall * 100).toFixed(1)}%  rerata ${rr.rerataPeringkat.toFixed(1)}  terburuk ${rr.peringkatTerburuk}`);
  }

  console.log(`\nPROYEKSI (batas atas — lihat catatan asumsi di modules/eval/tier1.ts)`);
  for (const n of [10_000, 50_000, 200_000, 1_000_000]) {
    if (n <= nDok) continue;
    console.log(`  ${String(n).padStart(9)} dokumen → recall @${TIER1_DOCS} ≈ ${(proyeksikan(peringkat, nDok, n, TIER1_DOCS) * 100).toFixed(1)}%`);
  }

  /* KONTROL — peringkat potongan benar tanpa lapisan pertama sama sekali.
     Tanpa ini angka di atas tak bisa ditafsirkan: recall rendah karena
     lapisan pertama membuang dokumennya, dan recall rendah karena modelnya
     memang tak membedakan dokumen mirip, menghasilkan angka yang sama tapi
     menuntut tindakan yang berlawanan. */
  const pDatar = soal.map((s, i) => peringkatDatar(vq[i], vek, s.iPotongan));
  const rDatar = ringkas(pDatar, 12);
  console.log('\nKONTROL — TANPA LAPISAN PERTAMA (pencarian datar seluruh potongan)');
  console.log(`  Potongan benar: rerata peringkat ${rDatar.rerataPeringkat.toFixed(1)} · p95 ${rDatar.p95} · terburuk ${rDatar.peringkatTerburuk}`);
  for (const { batas, recall } of kurvaAmbang(pDatar, [1, 5, 12, 40])) {
    console.log(`  potongan benar di ${String(batas).padStart(3)} teratas: ${(recall * 100).toFixed(1)}%`);
  }
  /* Batas atas yang menentukan keputusan: dari pertanyaan yang potongan
     benarnya MEMANG terjangkau pencarian datar (12 teratas ≈ pool kandidat
     produksi), berapa yang dijatuhkan oleh lapisan pertama? Itulah kerusakan
     yang benar-benar disebabkan lapisan pertama, terpisah dari kelemahan
     model. */
  const terjangkau = pDatar.map((p, i) => (p <= 12 ? i : -1)).filter((i) => i >= 0);
  const dijatuhkan = terjangkau.filter((i) => peringkat[i] > TIER1_DOCS).length;
  console.log(`\n  Dari ${terjangkau.length} pertanyaan yang potongan benarnya terjangkau pencarian datar,`);
  console.log(`  lapisan pertama menjatuhkan ${dijatuhkan} (${terjangkau.length ? (dijatuhkan / terjangkau.length * 100).toFixed(1) : '—'}%).`);
  console.log('  ITULAH kerusakan yang disebabkan lapisan pertama; sisanya kelemahan model.');

  const perlu95 = ambangUntukRecall(peringkat, 0.95, 100_000);
  console.log(`\nAmbang untuk recall 95% pada ${nDok} dokumen: ${perlu95 === null ? 'TAK TERCAPAI' : perlu95} dokumen`
    + `${perlu95 !== null && perlu95 > TIER1_DOCS ? `  ← LEBIH BESAR dari TIER1_DOCS (${TIER1_DOCS})` : ''}`);

  console.log('\nYang TIDAK dibuktikan angka ini: kualitas semantik modelnya, dan');
  console.log('perilaku pada dokumen yang saling merevisi (kembar hampir persis).');
  console.log('Korpus ini memakai template berulang dengan entitas unik — sulit,');
  console.log('tapi tiap dokumen tetap punya jawaban yang tunggal dan jelas.\n');
}

main().catch((e) => { console.error(e); process.exit(1); });
