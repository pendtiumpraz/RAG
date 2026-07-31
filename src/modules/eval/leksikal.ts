import { lexicalTsquery } from '@/modules/chat/lexical-query';

/**
 * JANGKAUAN KAKI LEKSIKAL — diukur dari TEKS saja.
 *
 * Kartu a-embed-template menyisakan satu pertanyaan yang belum terjawab:
 * pencarian vektor terbukti lemah pada korpus bertemplate (potongan benar
 * hanya masuk 12 teratas untuk 30,5% pertanyaan), tapi produksi belum
 * terlihat rusak karena kaki LEKSIKAL menangkap nomor register dan nama
 * pihak yang persis. Yang belum diketahui: berapa besar sisanya — pertanyaan
 * yang menyebut dokumen dengan KATA-KATA, bukan dengan kode.
 *
 * Modul ini menjawabnya tanpa satu pun embedding dan tanpa basis data.
 * Alasannya bukan penghematan: yang ditanyakan memang murni soal TEKS —
 * apakah pertanyaan memuat istilah yang cukup langka untuk menunjuk satu
 * dokumen. Menjalankan embedding untuk itu berarti mengukur hal lain.
 *
 * YANG DIMODELKAN, DAN YANG TIDAK. Istilahnya diambil dari
 * `lexicalTsquery()` yang sama persis dipakai produksi, dan pemeringkatannya
 * meniru sifat `ts_rank_cd`: potongan yang mencocoki LEBIH BANYAK istilah
 * berbeda menang. Yang TIDAK dimodelkan: pembobotan panjang dokumen dan
 * kedekatan posisi antar istilah. Keduanya menggeser urutan di antara
 * potongan yang sama-sama cocok, bukan menentukan cocok atau tidak — jadi
 * angka JANGKAUAN di sini tetap sahih, sementara angka peringkat persisnya
 * adalah perkiraan.
 */

export interface PotonganLeksikal {
  /** Penanda unik potongan — dipakai menunjuk mana yang benar. */
  id: string;
  teks: string;
}

/** Tokenisasi yang sama dengan yang dipakai membangun tsquery. */
function token(teks: string): Set<string> {
  return new Set(teks.toLowerCase().match(/[a-z0-9]+/g) ?? []);
}

/**
 * Korpus yang SUDAH ditokenisasi.
 *
 * Versi pertama menokenisasi ulang setiap potongan untuk tiap pertanyaan —
 * 800 pertanyaan × 12.000 potongan berarti 9,6 juta tokenisasi teks 700
 * karakter, dan pengukurannya tak selesai dalam lima menit. Isi korpus tak
 * berubah di antara pertanyaan; menokenisasinya sekali mengubah beban dari
 * perkalian jadi penjumlahan.
 */
export interface KorpusLeksikal {
  id: string[];
  tok: Array<Set<string>>;
  indeksById: Map<string, number>;
  /** Dokumen pemilik tiap potongan — dipakai menghitung frekuensi DOKUMEN. */
  dok: string[];
  jumlahDok: number;
}

export function siapkanKorpus(potongan: PotonganLeksikal[]): KorpusLeksikal {
  const id = potongan.map((p) => p.id);
  /* Id potongan berbentuk "<docRef>#<nomor>" — bagian sebelum '#' adalah
     dokumennya. */
  const dok = id.map((x) => x.split('#')[0]);
  return {
    id,
    tok: potongan.map((p) => token(p.teks)),
    indeksById: new Map(id.map((x, i) => [x, i])),
    dok,
    jumlahDok: new Set(dok).size,
  };
}

/**
 * Peringkat potongan sasaran menurut kaki leksikal.
 *
 * Mengembalikan `null` bila pertanyaannya tak menyisakan satu istilah pun —
 * keadaan yang di produksi berarti kaki leksikal DILEWATI seluruhnya, bukan
 * dijalankan dengan kuery kosong. Membedakannya dari "peringkat besar"
 * penting: yang satu berarti leksikal tak berpendapat, yang lain berarti ia
 * berpendapat dan salah.
 *
 * Seri dihitung MEMBERATKAN sasaran, sama seperti pengukuran tier-1: korpus
 * bertemplate penuh potongan yang mencocoki istilah yang sama persis, dan
 * menganggap sasaran menang saat seri akan melaporkan jangkauan yang lebih
 * baik daripada yang akan dilihat pengguna.
 */
export function peringkatLeksikal(
  pertanyaan: string,
  korpus: KorpusLeksikal,
  idBenar: string,
): number | null {
  const q = lexicalTsquery(pertanyaan);
  if (!q) return null;
  const istilah = q.split(' | ');

  const iBenar = korpus.indeksById.get(idBenar);
  if (iBenar === undefined) throw new Error(`Potongan benar tak ada di korpus: ${idBenar}`);

  const skor = (tok: Set<string>) => {
    let n = 0;
    for (const i of istilah) if (tok.has(i)) n++;
    return n;
  };

  const skorTarget = skor(korpus.tok[iBenar]);
  if (skorTarget === 0) return korpus.id.length;   // tak tercocoki sama sekali

  let lebihBaik = 0;
  for (let i = 0; i < korpus.tok.length; i++) {
    if (i === iBenar) continue;
    if (skor(korpus.tok[i]) >= skorTarget) lebihBaik++;
  }
  return lebihBaik + 1;
}

/**
 * Istilah yang LANGKA di korpus — inilah yang membuat kaki leksikal berguna.
 *
 * Kata yang muncul di hampir setiap potongan (template) tak menunjuk apa pun.
 * Yang menyelamatkan pencarian di korpus bertemplate adalah token yang hanya
 * muncul di segelintir DOKUMEN: nomor register, nama pihak, kode pasal.
 *
 * DIHITUNG PER DOKUMEN, BUKAN PER POTONGAN — dan bedanya menentukan. Nomor
 * register sebuah kontrak diulang di SETIAP potongan dokumennya (60 kali di
 * korpus ini), jadi frekuensi per potongan membuatnya terlihat umum padahal
 * ia menunjuk tepat satu dokumen. Versi pertama pengukuran ini memakai
 * ambang per potongan dan melaporkan "0% istilah langka" berbarengan dengan
 * "jangkauan 100%" — dua angka yang tak mungkin benar bersamaan, dan itulah
 * yang membuat kekeliruannya ketahuan.
 */
export function istilahLangka(
  pertanyaan: string,
  korpus: KorpusLeksikal,
  ambangDokumen: number,
): string[] {
  const q = lexicalTsquery(pertanyaan);
  if (!q) return [];
  return q.split(' | ').filter((i) => {
    const dokumen = new Set<string>();
    for (let n = 0; n < korpus.tok.length; n++) {
      if (korpus.tok[n].has(i)) dokumen.add(korpus.dok[n]);
    }
    return dokumen.size > 0 && dokumen.size <= ambangDokumen;
  });
}

export interface RingkasLeksikal {
  n: number;
  /** Pertanyaan yang potongan benarnya masuk `batas` teratas kaki leksikal. */
  jangkauan: number;
  /** Pertanyaan yang tak menyisakan istilah apa pun — leksikal dilewati. */
  tanpaIstilah: number;
  /** Pertanyaan yang punya minimal satu istilah langka. */
  punyaIstilahLangka: number;
  rerataPeringkat: number;
}

export function ringkasLeksikal(
  peringkat: Array<number | null>,
  langka: number[],
  batas: number,
): RingkasLeksikal {
  const ada = peringkat.filter((p): p is number => p !== null);
  return {
    n: peringkat.length,
    jangkauan: ada.filter((p) => p <= batas).length / peringkat.length,
    tanpaIstilah: peringkat.length - ada.length,
    punyaIstilahLangka: langka.filter((n) => n > 0).length,
    rerataPeringkat: ada.length ? ada.reduce((a, b) => a + b, 0) / ada.length : 0,
  };
}
