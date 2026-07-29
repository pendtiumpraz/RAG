/**
 * PENGGABUNGAN HASIL PENCARIAN — fungsi murni, diuji tanpa database.
 *
 * Dua persoalan yang diselesaikan di sini, dan keduanya nyata:
 *
 * 1. MENGGABUNG DUA PERINGKAT YANG SKORNYA TAK SEBANDING.
 *    Kaki vektor menghasilkan kemiripan kosinus (0..1); kaki leksikal
 *    menghasilkan ts_rank_cd yang skalanya berbeda dan tak terbatas.
 *    Menjumlahkan atau merata-ratakan keduanya berarti membandingkan satuan
 *    yang berbeda — hasilnya didominasi kaki yang kebetulan berangka besar.
 *    Reciprocal Rank Fusion menghindarinya dengan hanya memakai PERINGKAT,
 *    bukan skor: kontribusi tiap kaki = 1/(K + peringkat). Tak ada
 *    normalisasi yang perlu ditera ulang tiap ganti model embedding.
 *
 * 2. POTONGAN KEMBAR MEMENUHI JAWABAN.
 *    Satu berkas yang ter-ingest dua kali (mudah terjadi: satu folder Drive
 *    di-sync ulang, atau dokumen sama ada di dua KB) menghasilkan potongan
 *    yang isinya nyaris sama. Tanpa penyaringan, tiga slot teratas bisa
 *    terisi kalimat yang sama tiga kali — konteks jadi sempit padahal
 *    daftarnya penuh. MMR memilih potongan yang relevan TAPI berbeda dari
 *    yang sudah terpilih.
 */

/** Konstanta RRF yang lazim dipakai; meredam dominasi peringkat teratas. */
export const RRF_K = 60;

export interface RankedLeg {
  /** id dokumen berurut dari peringkat 1 (paling relevan menurut kaki ini) */
  ids: string[];
  /** bobot kaki; 1 = setara */
  weight?: number;
}

/**
 * Reciprocal Rank Fusion. Mengembalikan skor gabungan per id.
 *
 * Dokumen yang muncul di KEDUA kaki otomatis unggul — dan itu memang yang
 * diinginkan: kesepakatan dua metode yang saling bebas adalah sinyal paling
 * kuat yang tersedia tanpa model tambahan.
 */
export function rrfFuse(legs: RankedLeg[], k = RRF_K): Map<string, number> {
  const out = new Map<string, number>();
  for (const leg of legs) {
    const w = leg.weight ?? 1;
    leg.ids.forEach((id, i) => {
      out.set(id, (out.get(id) ?? 0) + w / (k + i + 1));
    });
  }
  return out;
}

/** Token untuk pembanding kemiripan permukaan — huruf/angka, ≥3 karakter. */
export function contentTokens(text: string): Set<string> {
  return new Set((text.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []).slice(0, 400));
}

/** Jaccard: 0 = tak beririsan, 1 = identik. */
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  const [small, big] = a.size < b.size ? [a, b] : [b, a];
  for (const t of small) if (big.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

export interface MmrItem { id: string; score: number; tokens: Set<string> }

/**
 * Ambang "praktis potongan yang sama".
 *
 * DIUKUR, bukan ditebak. Pada korpus nyata (satu berkas NIB yang ter-ingest
 * dua kali lewat dua sumber), pasangan duplikat sungguhan menghasilkan
 * Jaccard 0,70 — bukan 1,0 — karena batas pemotongan kedua ingest berbeda
 * sehingga isinya bergeser. Sementara SEMUA pasangan lain di hasil yang sama
 * berada di bawah 0,30: potongan berbeda dari dokumen panjang, bahkan yang
 * sevokabuler, tak mendekati angka itu.
 *
 * Jurang 0,30–0,70 itulah yang dipakai. 0,6 duduk di tengahnya: cukup rendah
 * untuk menangkap duplikat yang bergeser, cukup tinggi untuk tak menyentuh
 * potongan yang saling melengkapi. Ambang 0,9 yang sempat dipakai terlalu
 * ketat dan meloloskan duplikat nyata.
 */
export const DUPLICATE_AT = 0.6;

/**
 * Buang potongan yang praktis kembar, sisakan yang skornya tertinggi.
 *
 * Ini TERPISAH dari MMR dan dijalankan lebih dulu — dan pemisahannya penting.
 * MMR menyeimbangkan relevansi lawan kebaruan, jadi kembar yang relevansinya
 * nyaris sama tetap menang: secara matematis benar, tapi bukan yang kita mau.
 * Duplikat bukan soal "kurang beragam", melainkan tak membawa informasi baru
 * sama sekali, jadi jawabannya penyingkiran tegas — bukan pengurangan nilai.
 *
 * O(n²) atas kolam kandidat (puluhan, bukan ribuan) — memadai di sini.
 */
export function dedupeNearDuplicates<T extends MmrItem>(items: T[], at = DUPLICATE_AT): T[] {
  const sorted = [...items].sort((a, b) => b.score - a.score);
  const kept: T[] = [];
  for (const it of sorted) {
    if (kept.some((k) => jaccard(it.tokens, k.tokens) >= at)) continue;
    kept.push(it);
  }
  return kept;
}

/**
 * Maximal Marginal Relevance.
 *
 * Memilih `k` item dengan menyeimbangkan relevansi dan kebaruan:
 *   nilai = λ·relevansi − (1−λ)·kemiripan_tertinggi_dengan_yang_sudah_dipilih
 *
 * λ = 1 berarti murni relevansi (perilaku lama). λ rendah mengejar keragaman.
 * Kemiripan diukur dari tumpang tindih token isi — proksi yang murah dan
 * justru tepat sasaran di sini, karena masalah yang dikejar adalah potongan
 * yang benar-benar KEMBAR, bukan yang sekadar bertema mirip.
 */
export function mmrSelect(items: MmrItem[], k: number, lambda = 0.7): MmrItem[] {
  if (k <= 0 || !items.length) return [];
  const pool = [...items].sort((a, b) => b.score - a.score);
  const picked: MmrItem[] = [];

  // Skor relevansi dinormalkan ke 0..1 supaya sebanding dengan kemiripan
  // Jaccard yang memang 0..1 — tanpa ini λ tak punya arti yang stabil.
  const max = pool[0].score;
  const min = pool[pool.length - 1].score;
  const span = max - min || 1;
  const rel = new Map(pool.map((it) => [it.id, (it.score - min) / span]));

  while (picked.length < k && pool.length) {
    let bestIdx = 0;
    let bestVal = -Infinity;
    for (let i = 0; i < pool.length; i++) {
      const cand = pool[i];
      let maxSim = 0;
      for (const p of picked) {
        const s = jaccard(cand.tokens, p.tokens);
        if (s > maxSim) maxSim = s;
      }
      const val = lambda * (rel.get(cand.id) ?? 0) - (1 - lambda) * maxSim;
      if (val > bestVal) { bestVal = val; bestIdx = i; }
    }
    picked.push(pool.splice(bestIdx, 1)[0]);
  }
  return picked;
}
