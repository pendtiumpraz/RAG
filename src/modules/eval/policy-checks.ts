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
 * Pendeteksi penolakan tinggal di PRODUK (chat/confidence), bukan di sini.
 *
 * Arah ketergantungannya menentukan: produk MEMILIKI perilakunya, eval
 * MENGUKUR. Kalau salinannya hidup di modul eval, keduanya akan menyimpang
 * diam-diam — dan eval yang mengukur pendeteksi yang berbeda dari yang
 * dipakai produksi adalah eval yang paling berbahaya justru saat hijau.
 */
import { deteksiPenolakan } from '@/modules/chat/confidence';
export { deteksiPenolakan };

/* ── 2 · BAHASA ─────────────────────────────────────────────────────
   Pendeteksinya tinggal di `modules/chat/bahasa.ts` — milik PRODUK, bukan
   milik eval. Begitu jalur chat ikut memakainya (penolakan tanpa konteks
   mengikuti bahasa penanya), ia berhenti jadi alat ukur dan jadi perilaku:
   alat ukur boleh diperbaiki agar lebih tajam, perilaku tak boleh berubah
   diam-diam karena seseorang menyetel evalnya. */
export { deteksiBahasa } from '@/modules/chat/bahasa';
import { deteksiBahasa } from '@/modules/chat/bahasa';

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
