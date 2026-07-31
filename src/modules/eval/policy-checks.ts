/**
 * PEMERIKSA KEPATUHAN JAWABAN — murni, tanpa I/O, tanpa model penilai.
 *
 * Kartu a-answer-policy-eval menuntut bukti bahwa model BENAR-BENAR menuruti
 * kebijakan, bukan bahwa instruksinya berbunyi benar. Yang diuji unit selama
 * ini baru kalimat arahannya; ini memeriksa keluarannya.
 *
 * SENGAJA TANPA MODEL PENILAI (LLM-as-judge), dan itu keputusan sadar:
 * penilai berbasis model membuat hasil eval bergantung pada model lain yang
 * juga bisa salah, tak dapat diulang persis, dan biayanya berlipat. Untuk
 * tiga hal yang diukur di sini — menolak, bahasa, sitasi — pemeriksaan
 * deterministik sudah cukup tajam.
 *
 * BATASNYA DITULIS, BUKAN DISEMBUNYIKAN. Ketiganya heuristik. Yang penting
 * adalah ARAH kesalahannya: semuanya dirancang agar meleset ke sisi
 * PESIMIS — penolakan yang tak dikenali dihitung sebagai kegagalan menolak,
 * bahasa yang ambigu dihitung tak cocok. Eval yang meleset ke sisi optimis
 * akan meloloskan karangan, dan itu kegagalan yang paling mahal bagi produk
 * yang menjual jawaban bersumber.
 */

/**
 * Bagian maksimum pertanyaan berbahasa yang boleh salah bahasa sebelum
 * gerbang eval berbunyi.
 *
 * DITURUNKAN DARI PENGUKURAN, bukan dipilih. Pada himpunan 14 pertanyaan
 * penguji bahasa (31 Jul 2026, DeepSeek V4 Flash, korpus produksi):
 *
 *   tanpa pengingat kebijakan   1 · 6 · 4 pelanggaran  → 7–43%
 *   dengan pengingat            1 · 0 · 1 pelanggaran  → 0–7%
 *
 * Ambang 20% memisahkan keduanya dengan lebar. Longgar DENGAN SENGAJA: pada
 * temperature 0,2 angkanya bergoyang, dan gerbang yang sering berbunyi palsu
 * akan dimatikan orang — lalu tak menjaga apa pun. Yang ingin ditangkap
 * adalah kemunduran ke keadaan lama, bukan selisih satu pertanyaan.
 *
 * Tinggal di modul MURNI ini, bukan di skrip evalnya: mengimpornya dari sana
 * akan menjalankan main() skrip itu beserta sambungan basis datanya, dan tes
 * unit gagal karenanya.
 */
export const AMBANG_BAHASA_SALAH = 0.20;

/* ── 1 · PENOLAKAN ──────────────────────────────────────────────────── */

/**
 * Penanda bahwa jawaban MENOLAK menjawab karena dokumennya tak memuatnya.
 *
 * Dwibahasa karena kebijakan bahasa memang membolehkan jawaban Inggris.
 * Daftar ini sengaja menuntut frasa yang MENYEBUT sumbernya ("di dokumen",
 * "in the documents") — bukan sekadar "tidak tahu". Model yang menjawab
 * "saya tidak tahu" tanpa menyebut dokumen belum tentu menolak karena
 * groundingnya ketat; ia bisa saja sekadar bingung, dan itu perilaku lain.
 */
/**
 * DUA SINYAL DALAM SATU KALIMAT, bukan satu frasa utuh.
 *
 * Versi pertama berkas ini memakai regex berfrasa-utuh seperti
 * `/tidak\s+tersedia\s+(di|dalam|pada)\s+dokumen/`. Ia gagal pada jawaban
 * sungguhan yang berbunyi "Informasi mengenai gaji ... tidak tersedia DI
 * DALAM dokumen yang diberikan" — dua kata sisipan sudah cukup meleset, dan
 * penolakan yang benar dilaporkan sebagai KARANGAN. Kegagalan itu tak
 * terlihat sampai eval-nya benar-benar dijalankan terhadap model sungguhan.
 *
 * Sekarang penolakan dikenali bila SATU kalimat memuat keduanya:
 *   (a) pengingkaran KETERSEDIAAN — tidak/tak/belum + ada/tersedia/…
 *   (b) rujukan ke SUMBER — dokumen/berkas/konteks/document/context/…
 *
 * Menuntut keduanya menjaga ketajaman: "saya tidak tahu" saja tidak dihitung
 * menolak, karena ia belum tentu penolakan berbasis dokumen — bisa jadi
 * model sekadar bingung, dan itu perilaku lain yang tak boleh dicampur.
 */
const INGKAR_ADA = /\b(tidak|tak|belum|bukan)\b[^.!?]{0,40}?\b(ada|tersedia|ditemukan|terdapat|tercantum|disebut\w*|dijelaskan|dimuat|memuat|menyebut\w*|berisi)\b/i;
/* Bentuk kata kerja diberi akhiran bebas (\w*), bukan didaftar satu per satu.
   Versi sebelumnya menulis `stated` dan meleset pada jawaban model yang
   sungguhan: "The documents do not STATE the total number of employees" —
   penolakan yang benar dilaporkan sebagai KARANGAN, dan gerbangnya berbunyi
   palsu. Ini kegagalan yang sama persis dengan yang sudah diperbaiki di sisi
   Indonesia; sisi Inggris terlewat karena contoh ujinya kebetulan memakai
   bentuk lampau. */
const INGKAR_ADA_EN = /\b(no|not|does\s?n[o']t|do\s?n[o']t|cannot|can[o']t|unable)\b[^.!?]{0,40}?\b(information|data|mention\w*|found|availab\w*|specif\w*|provid\w*|stat\w*|contain\w*|includ\w*|detail\w*|list\w*|indicat\w*|find)\b/i;
const RUJUK_SUMBER = /\b(dokumen|berkas|konteks|sumber|document|documents|context|sources?|provided|given)\b/i;

/** Pecah jadi kalimat. Kasar dengan sengaja — yang dibutuhkan hanya batas. */
const kalimat = (t: string) => t.split(/(?<=[.!?])\s+|\n+/).filter((s) => s.trim());

/**
 * Apakah jawaban ini MENOLAK?
 *
 * Jawaban kosong dihitung MENOLAK: tak ada yang diklaim, jadi tak ada yang
 * bisa dikarang. Itu bukan jawaban yang baik, tapi bukan halusinasi — dan
 * kartu ini mengukur halusinasi.
 */
export function deteksiPenolakan(jawaban: string): boolean {
  const t = jawaban.trim();
  if (!t) return true;
  return kalimat(t).some((s) =>
    (INGKAR_ADA.test(s) || INGKAR_ADA_EN.test(s)) && RUJUK_SUMBER.test(s));
}

/* ── 2 · BAHASA ─────────────────────────────────────────────────────── */

/**
 * Kata fungsi — penanda bahasa yang jauh lebih andal daripada kata isi.
 *
 * Kata isi sering sama di kedua bahasa (nama perusahaan, istilah teknis,
 * nomor pasal), sedangkan kata fungsi hampir tak pernah menyeberang. Itulah
 * sebabnya "PT SAINSKERTA SOLUSI NUSANTARA" tak mengacaukan penilaian.
 */
const KATA_ID = ['yang', 'dan', 'dari', 'untuk', 'dengan', 'pada', 'adalah',
  'tidak', 'ini', 'itu', 'atau', 'dalam', 'akan', 'sudah', 'juga', 'oleh', 'ke'];
const KATA_EN = ['the', 'and', 'of', 'for', 'with', 'is', 'are', 'not',
  'this', 'that', 'or', 'in', 'will', 'has', 'have', 'by', 'to', 'a'];

const hitung = (kata: string[], daftar: string[]) =>
  kata.filter((k) => daftar.includes(k)).length;

/**
 * Terka bahasa jawaban: 'id' | 'en' | null bila tak cukup bukti.
 *
 * `null` BUKAN kegagalan pendeteksi — ia jawaban yang jujur untuk teks yang
 * memang tak punya cukup kata fungsi (jawaban satu angka, satu nama).
 * Pemanggilnya yang memutuskan apa artinya, dan di pelari eval ia dihitung
 * TIDAK COCOK — sisi pesimis, sesuai aturan berkas ini.
 */
export function deteksiBahasa(teks: string): 'id' | 'en' | null {
  const kata = teks.toLowerCase().match(/[a-z']+/g) ?? [];
  if (kata.length < 6) return null;
  const id = hitung(kata, KATA_ID);
  const en = hitung(kata, KATA_EN);
  // Menuntut selisih, bukan sekadar unggul: campuran istilah Inggris di
  // kalimat Indonesia lazim, dan menang tipis bukan bukti.
  if (id >= en + 2) return 'id';
  if (en >= id + 2) return 'en';
  return null;
}

/* ── 3 · SITASI ─────────────────────────────────────────────────────── */

export interface PemeriksaanJawaban {
  /** Menolak menjawab karena tak ada di dokumen. */
  menolak: boolean;
  /** Bahasa yang terdeteksi; null = tak cukup bukti. */
  bahasa: 'id' | 'en' | null;
  /** Jumlah dokumen yang dirujuk jawaban. */
  sitasi: number;
  /** Panjang jawaban dalam karakter — dipakai membaca hasil, bukan menilai. */
  panjang: number;
}

export function periksaJawaban(jawaban: string, sitasi: number): PemeriksaanJawaban {
  return {
    menolak: deteksiPenolakan(jawaban),
    bahasa: deteksiBahasa(jawaban),
    sitasi,
    panjang: jawaban.trim().length,
  };
}

/* ── penilaian satu pertanyaan ──────────────────────────────────────── */

export interface HarapanJawaban {
  /** true = jawabannya memang TIDAK ADA di korpus; menolak adalah benar. */
  harusMenolak: boolean;
  /** Bahasa yang diharapkan; null = tak dinilai. */
  bahasa?: 'id' | 'en' | null;
}

export interface PelanggaranJawaban {
  jenis: 'mengarang' | 'menolak-padahal-ada' | 'bahasa-salah' | 'tanpa-sitasi';
  catatan: string;
}

/**
 * Bandingkan hasil pemeriksaan dengan yang diharapkan.
 *
 * Empat pelanggaran, dan bobotnya TIDAK sama meski tak diberi angka di sini:
 *
 *   mengarang            paling mahal. Jawaban percaya diri atas sesuatu
 *                        yang tak ada di dokumen adalah kegagalan yang
 *                        menghancurkan alasan produk ini dibeli.
 *   menolak-padahal-ada  menjengkelkan, tapi jujur. Pengguna tahu ia tak
 *                        dapat jawaban; ia tidak disesatkan.
 *   bahasa-salah         mengganggu, tak berbahaya.
 *   tanpa-sitasi         jawaban tak bisa ditelusuri — yang membuat seluruh
 *                        klaim "bersumber" tak bisa diperiksa siapa pun.
 */
export function nilaiJawaban(
  p: PemeriksaanJawaban, harap: HarapanJawaban,
): PelanggaranJawaban[] {
  const out: PelanggaranJawaban[] = [];

  if (harap.harusMenolak && !p.menolak) {
    out.push({
      jenis: 'mengarang',
      catatan: `menjawab ${p.panjang} karakter untuk pertanyaan yang jawabannya tak ada di korpus`,
    });
  }
  if (!harap.harusMenolak && p.menolak) {
    out.push({ jenis: 'menolak-padahal-ada', catatan: 'dokumen memuat jawabannya, tapi jawaban menolak' });
  }
  if (harap.bahasa && p.bahasa !== harap.bahasa) {
    out.push({
      jenis: 'bahasa-salah',
      catatan: `diharapkan ${harap.bahasa}, terdeteksi ${p.bahasa ?? 'tak cukup bukti'}`,
    });
  }
  /* Sitasi hanya dituntut pada jawaban yang MENGKLAIM sesuatu. Menuntutnya
     pada penolakan akan menghukum perilaku yang justru benar: menolak
     memang tak merujuk dokumen mana pun. */
  if (!harap.harusMenolak && !p.menolak && p.sitasi === 0) {
    out.push({ jenis: 'tanpa-sitasi', catatan: 'jawaban mengklaim sesuatu tanpa satu pun rujukan dokumen' });
  }
  return out;
}
