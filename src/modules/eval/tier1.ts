/**
 * RECALL LAPISAN PERTAMA — matematika peringkatnya, tanpa basis data.
 *
 * Yang diukur persis mekanisme di `retrieval.service.ts`: dokumen diperingkat
 * lewat BAGIAN TERBAIKNYA (`group by doc_ref order by min(jarak)`), lalu
 * `TIER1_DOCS` teratas saja yang potongannya dibaca di lapisan kedua. Dokumen
 * yang meleset di lapisan pertama TIDAK PERNAH dibaca di lapisan kedua —
 * karena itu recall lapisan pertama adalah batas atas recall seluruh kaki
 * vektor, bukan sekadar salah satu faktornya.
 */

/** Jarak kosinus antara dua vektor. Sepadan dengan operator `<=>` pgvector. */
export function jarakKosinus(a: Float32Array, b: Float32Array): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  if (na === 0 || nb === 0) return 1;
  return 1 - dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Centroid bagian = RATA-RATA vektor potongan di dalamnya.
 *
 * Meniru `avg(d.embedding)` di `document-vectors.service.ts` persis. Inilah
 * satu-satunya langkah yang benar-benar bisa merusak lapisan pertama:
 * potongan yang membawa jawaban hanya menyumbang seperlima puluh arah
 * centroid-nya, sementara empat puluh sembilan potongan lain — ketentuan
 * umum, kerahasiaan, keadaan kahar — menariknya ke tema rata-rata dokumen.
 *
 * Melewatkan langkah ini (satu potongan = satu bagian) membuat pengukuran
 * apa pun melaporkan lapisan pertama tanpa cacat, karena hasilnya jadi
 * tautologi: potongan yang masuk N teratas datar mustahil punya lebih dari
 * N-1 dokumen pesaing.
 */
export function rataVektor(vs: Float32Array[]): Float32Array {
  if (!vs.length) throw new Error('Tak ada vektor untuk dirata-ratakan');
  const out = new Float32Array(vs[0].length);
  for (const v of vs) {
    if (v.length !== out.length) throw new Error('Dimensi vektor tak seragam');
    for (let i = 0; i < out.length; i++) out[i] += v[i];
  }
  for (let i = 0; i < out.length; i++) out[i] /= vs.length;
  return out;
}

/**
 * Kelompokkan potongan menjadi bagian, `perBagian` potongan per bagian.
 * Sepadan dengan `(metadata->>'chunk')::int / POTONGAN_PER_BAGIAN` di SQL.
 */
export function centroidBagian(potongan: Float32Array[], perBagian: number): Float32Array[] {
  if (perBagian < 1) throw new Error('perBagian minimal 1');
  const keluar: Float32Array[] = [];
  for (let i = 0; i < potongan.length; i += perBagian) {
    keluar.push(rataVektor(potongan.slice(i, i + perBagian)));
  }
  return keluar;
}

export interface DokVektor {
  docRef: string;
  /** Satu vektor per BAGIAN (document_vectors.segment), bukan satu per dokumen. */
  bagian: Float32Array[];
}

/** Jarak dokumen = jarak bagian TERDEKATNYA — persis `min()` di SQL. */
export function jarakDokumen(q: Float32Array, d: DokVektor): number {
  let min = Infinity;
  for (const b of d.bagian) { const j = jarakKosinus(q, b); if (j < min) min = j; }
  return min;
}

/**
 * Peringkat dokumen sasaran di antara SELURUH dokumen (1 = teratas).
 *
 * Mengembalikan peringkat, bukan lolos/tidak, karena angka itulah yang
 * menjawab pertanyaan lanjutan: kalau meleset di 40, apakah ia di urutan 41
 * atau 4.000? Yang pertama berarti ambangnya kurang; yang kedua berarti
 * lapisan pertamanya yang salah bentuk.
 *
 * Seri dihitung MEMBERATKAN sasaran (pesaing berjarak sama dianggap menang) —
 * kalau tidak, korpus dengan banyak dokumen kembar akan melaporkan recall
 * yang lebih baik daripada yang akan dilihat pengguna.
 */
export function peringkatTarget(q: Float32Array, docs: DokVektor[], docRefTarget: string): number {
  const target = docs.find((d) => d.docRef === docRefTarget);
  if (!target) throw new Error(`Dokumen sasaran tak ada di korpus: ${docRefTarget}`);
  const jTarget = jarakDokumen(q, target);
  let lebihBaik = 0;
  for (const d of docs) {
    if (d.docRef === docRefTarget) continue;
    if (jarakDokumen(q, d) <= jTarget) lebihBaik++;
  }
  return lebihBaik + 1;
}

/**
 * Peringkat potongan benar TANPA lapisan pertama — kontrol yang menentukan.
 *
 * Tanpa angka ini, recall lapisan pertama yang rendah tak bisa ditafsirkan.
 * Dua sebab yang menghasilkan angka sama persis, tapi menuntut tindakan yang
 * berlawanan:
 *
 *   • lapisan pertamanya yang membuang dokumen benar → naikkan TIER1_DOCS;
 *   • modelnya yang memang tak bisa membedakan dokumen mirip → menaikkan
 *     TIER1_DOCS tak menolong sama sekali, cuma memperlambat.
 *
 * Peringkat datar menjawab yang mana. Kalau potongan benar sudah terkubur di
 * urutan 500 pada pencarian datar, ia takkan terambil meski seluruh korpus
 * lolos lapisan pertama.
 */
export function peringkatDatar(q: Float32Array, potongan: Float32Array[], indeksBenar: number): number {
  if (indeksBenar < 0 || indeksBenar >= potongan.length) {
    throw new Error(`Indeks potongan benar di luar korpus: ${indeksBenar}`);
  }
  const jBenar = jarakKosinus(q, potongan[indeksBenar]);
  let lebihBaik = 0;
  for (let i = 0; i < potongan.length; i++) {
    if (i === indeksBenar) continue;
    if (jarakKosinus(q, potongan[i]) <= jBenar) lebihBaik++;
  }
  return lebihBaik + 1;
}

export interface HasilRecall {
  /** Banyak pertanyaan yang diukur. */
  n: number;
  /** Bagian pertanyaan yang dokumen benarnya masuk `batas` teratas. */
  recall: number;
  /** Peringkat rata-rata dokumen benar. */
  rerataPeringkat: number;
  /** Peringkat terburuk yang teramati — bentuk kegagalannya, bukan reratanya. */
  peringkatTerburuk: number;
  /** Persentil 95 peringkat: satu dari dua puluh pertanyaan lebih buruk dari ini. */
  p95: number;
}

export function ringkas(peringkat: number[], batas: number): HasilRecall {
  if (!peringkat.length) throw new Error('Tak ada peringkat untuk diringkas');
  const urut = [...peringkat].sort((a, b) => a - b);
  const lolos = peringkat.filter((p) => p <= batas).length;
  return {
    n: peringkat.length,
    recall: lolos / peringkat.length,
    rerataPeringkat: peringkat.reduce((a, b) => a + b, 0) / peringkat.length,
    peringkatTerburuk: urut[urut.length - 1],
    p95: urut[Math.min(urut.length - 1, Math.ceil(urut.length * 0.95) - 1)],
  };
}

/**
 * Recall pada berbagai ambang, dari SATU himpunan peringkat.
 *
 * Menjalankan ulang pencarian untuk tiap ambang akan memakan waktu berlipat
 * tanpa menambah informasi: peringkat dokumen benar tidak bergantung pada
 * ambangnya. Ambangnya hanya garis potong.
 */
export function kurvaAmbang(peringkat: number[], ambang: number[]): Array<{ batas: number; recall: number }> {
  return ambang.map((batas) => ({ batas, recall: peringkat.filter((p) => p <= batas).length / peringkat.length }));
}

/**
 * Proyeksi ke korpus yang JAUH lebih besar dari yang sempat diukur.
 *
 * Dasarnya satu pengamatan yang bisa diperiksa: di korpus berukuran `nUkur`,
 * sebuah pertanyaan punya `peringkat - 1` dokumen pengganggu yang mengalahkan
 * dokumen benarnya. Bila korpus ditumbuhkan dengan dokumen yang SEJENIS,
 * jumlah pengganggu tumbuh sebanding — pengganggu ke-n punya peluang sama
 * untuk lebih dekat.
 *
 * ASUMSI YANG MENANGGUNG SELURUH ANGKA INI, dan ia OPTIMISTIS: korpus yang
 * tumbuh dianggap tetap seperti korpus yang diukur. Basis pengetahuan
 * sungguhan cenderung memburuk lebih cepat dari ini, karena dokumen yang
 * ditambahkan belakangan justru sering revisi dari yang sudah ada — dan
 * dokumen kembar adalah pengganggu terkuat yang mungkin. Karena itu angka
 * proyeksi harus dibaca sebagai BATAS ATAS, bukan ramalan.
 */
export function proyeksikan(peringkat: number[], nUkur: number, nTarget: number, batas: number): number {
  if (nUkur < 2) throw new Error('Proyeksi butuh korpus ukur minimal 2 dokumen');
  const faktor = (nTarget - 1) / (nUkur - 1);
  const lolos = peringkat.filter((p) => 1 + (p - 1) * faktor <= batas).length;
  return lolos / peringkat.length;
}

/**
 * Ambang terkecil yang masih mencapai recall yang diminta.
 *
 * Mengembalikan null bila tak ada ambang di bawah `maks` yang cukup — itu
 * jawaban yang sah dan harus bisa dibedakan dari "ambangnya nol".
 */
export function ambangUntukRecall(peringkat: number[], targetRecall: number, maks: number): number | null {
  const urut = [...peringkat].sort((a, b) => a - b);
  const perlu = Math.ceil(targetRecall * urut.length);
  if (perlu === 0) return 0;
  if (perlu > urut.length) return null;
  const batas = urut[perlu - 1];
  return batas <= maks ? batas : null;
}
