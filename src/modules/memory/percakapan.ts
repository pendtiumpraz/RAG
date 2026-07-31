/**
 * BELAJAR DARI PERCAKAPAN — pengelompokan pertanyaan berulang.
 *
 * Modul MURNI: tak menyentuh basis data dan tak memanggil satu pun model,
 * sehingga bisa diuji tanpa apa pun yang berjalan.
 *
 * TIGA KEPUTUSAN YANG MENENTUKAN, dan ketiganya soal apa yang TIDAK
 * dilakukan.
 *
 * 1. TIDAK ADA PANGGILAN LLM. Menjalankan model pada tiap percakapan akan
 *    membebankan biaya yang tumbuh sebanding lalu lintas — dan justru
 *    chatbot yang paling ramai (pelanggan paling berharga) yang paling mahal.
 *    Yang dibutuhkan untuk mengenali pertanyaan berulang hanyalah menghitung,
 *    dan menghitung tak menuntut model.
 *
 * 2. DIHITUNG PER PERCAKAPAN, BUKAN PER PESAN. Satu pengunjung yang menanyakan
 *    hal sama lima kali dalam satu sesi bukan sinyal apa-apa — ia justru
 *    tanda jawabannya tak memuaskan. Lima ORANG berbeda yang menanyakannya
 *    adalah sinyal.
 *
 * 3. HASILNYA TIDAK PERNAH LANGSUNG DIPAKAI MENJAWAB. Teks pertanyaan datang
 *    dari pengunjung publik dan bisa memuat apa saja — nama, nomor, keluhan
 *    pribadi. Catatan memory yang berstatus `active` IKUT TERAMBIL saat
 *    chatbot menjawab (kaki Memory di retrieval.service), jadi menuliskannya
 *    sebagai active berarti pertanyaan satu pengunjung bisa muncul di jawaban
 *    untuk pengunjung lain. Karena itu semuanya ditulis `pending` dan menunggu
 *    persetujuan manusia — mekanisme yang memang sudah ada.
 */

/** Berapa PERCAKAPAN berbeda sebelum sebuah pertanyaan disebut berulang. */
export const MIN_PERCAKAPAN = 3;

/** Pertanyaan lebih pendek dari ini tak membawa maksud yang bisa dikenali. */
export const MIN_HURUF = 12;

/**
 * Lebih panjang dari ini biasanya bukan pertanyaan melainkan tempelan
 * dokumen. Mengelompokkannya tak berguna dan isinya paling mungkin memuat
 * data pribadi.
 */
export const MAKS_HURUF = 300;

export interface BarisPertanyaan {
  conversationId: string;
  content: string;
  /** Apakah jawaban atasnya membawa sitasi. */
  terjawab: boolean;
  /** Judul dokumen yang dipakai menjawab, bila ada. */
  sumber: string[];
}

export interface KelompokPertanyaan {
  /** Bentuk yang dinormalkan — kunci pengelompokan. */
  kunci: string;
  /** Bentuk asli yang paling sering muncul, untuk ditampilkan. */
  contoh: string;
  /** Banyak PERCAKAPAN berbeda yang menanyakannya. */
  percakapan: number;
  /** Berapa di antaranya terjawab dengan sitasi. */
  terjawab: number;
  /** Dokumen yang pernah dipakai menjawabnya, terurut menurun. */
  sumber: string[];
}

/**
 * Normalkan pertanyaan agar bentuk yang sama tak terhitung dua kali.
 *
 * Huruf kecil, tanda baca dibuang, spasi dirapatkan. Sengaja TIDAK memakai
 * stemming atau kemiripan vektor: keduanya menyatukan pertanyaan yang
 * berbeda maksud ("berapa harga" dan "berapa harganya dulu"), dan kesalahan
 * itu baru ketahuan setelah catatannya terlanjur dibuat.
 */
export function normalisasiPertanyaan(teks: string): string {
  return teks
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Layak dihitung? Terlalu pendek tak bermakna, terlalu panjang bukan pertanyaan. */
export function layakDihitung(teks: string): boolean {
  const n = normalisasiPertanyaan(teks);
  return n.length >= MIN_HURUF && n.length <= MAKS_HURUF;
}

/**
 * Kelompokkan baris pertanyaan jadi pertanyaan berulang.
 *
 * Percakapan yang sama hanya dihitung SEKALI per kunci, berapa pun kali ia
 * menanyakannya di sesi itu.
 */
export function kelompokkan(baris: BarisPertanyaan[], minPercakapan = MIN_PERCAKAPAN): KelompokPertanyaan[] {
  const peta = new Map<string, {
    percakapan: Set<string>;
    terjawab: Set<string>;
    bentuk: Map<string, number>;
    sumber: Map<string, number>;
  }>();

  for (const b of baris) {
    if (!layakDihitung(b.content)) continue;
    const kunci = normalisasiPertanyaan(b.content);
    let e = peta.get(kunci);
    if (!e) {
      e = { percakapan: new Set(), terjawab: new Set(), bentuk: new Map(), sumber: new Map() };
      peta.set(kunci, e);
    }
    e.percakapan.add(b.conversationId);
    if (b.terjawab) e.terjawab.add(b.conversationId);
    const asli = b.content.trim();
    e.bentuk.set(asli, (e.bentuk.get(asli) ?? 0) + 1);
    for (const s of b.sumber) e.sumber.set(s, (e.sumber.get(s) ?? 0) + 1);
  }

  const keluar: KelompokPertanyaan[] = [];
  for (const [kunci, e] of peta) {
    if (e.percakapan.size < minPercakapan) continue;
    const contoh = [...e.bentuk.entries()].sort((a, b) => b[1] - a[1])[0][0];
    keluar.push({
      kunci,
      contoh,
      percakapan: e.percakapan.size,
      terjawab: e.terjawab.size,
      sumber: [...e.sumber.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s).slice(0, 5),
    });
  }
  // Yang paling sering ditanya lebih dulu — itu yang paling layak ditinjau.
  return keluar.sort((a, b) => b.percakapan - a.percakapan);
}

/** Terjawab bila SEBAGIAN BESAR percakapan yang menanyakannya mendapat sitasi. */
export function adalahKesenjangan(k: KelompokPertanyaan): boolean {
  return k.terjawab / k.percakapan < 0.5;
}

/**
 * Susun catatan untuk satu pertanyaan berulang.
 *
 * TIDAK MENGARANG JAWABAN. Untuk pertanyaan yang terjawab, isinya menunjuk
 * dokumen yang memang dipakai menjawabnya. Untuk yang tidak, isinya
 * menyatakan kesenjangan apa adanya — catatan yang mengarang jawaban atas
 * pertanyaan yang justru TIDAK terjawab korpus adalah kebalikan dari
 * gunanya seluruh sistem ini.
 */
export function susunCatatan(k: KelompokPertanyaan): { slug: string; title: string; contentMd: string } {
  const gap = adalahKesenjangan(k);
  const judul = k.contoh.length > 70 ? `${k.contoh.slice(0, 67)}…` : k.contoh;

  const badan = gap
    ? [
      `**Ditanyakan ${k.percakapan} percakapan berbeda, dan ${k.percakapan - k.terjawab} di antaranya tak terjawab.**`,
      '',
      'Tidak ada dokumen di basis pengetahuan ini yang menjawabnya dengan meyakinkan.',
      'Catatan ini menandai KESENJANGAN, bukan jawaban — isinya sengaja tidak dikarang.',
      '',
      'Langkah yang masuk akal: tambahkan dokumen yang membahasnya, lalu tinjau ulang catatan ini.',
    ]
    : [
      `**Ditanyakan ${k.percakapan} percakapan berbeda, ${k.terjawab} di antaranya terjawab dari dokumen.**`,
      '',
      'Dokumen yang dipakai menjawabnya:',
      ...k.sumber.map((s) => `- [[${s}]]`),
      '',
      'Pertanyaan ini sering berulang. Bila jawabannya tersebar di banyak dokumen,',
      'satu halaman ringkas akan membuatnya lebih mudah ditemukan.',
    ];

  return {
    slug: `tanya-${slugPertanyaan(k.kunci)}`,
    title: judul,
    contentMd: [
      '---',
      'jenis: pertanyaan-berulang',
      `percakapan: ${k.percakapan}`,
      `terjawab: ${k.terjawab}`,
      `kesenjangan: ${gap ? 'ya' : 'tidak'}`,
      '---',
      '',
      ...badan,
    ].join('\n'),
  };
}

/** Slug pendek & stabil dari kunci yang sudah dinormalkan. */
export function slugPertanyaan(kunci: string): string {
  return kunci.split(' ').slice(0, 8).join('-').slice(0, 60) || 'tanpa-judul';
}
