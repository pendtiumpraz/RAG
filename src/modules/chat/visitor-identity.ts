import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * IDENTITAS PENGUNJUNG YANG DISUNTIK SITUS PELANGGAN.
 *
 * MASALAHNYA. Penanda pengunjung lahir dari Math.random() di localStorage
 * peramban (embed.js). Riwayatnya sendiri aman di server kita — tapi KUNCI
 * untuk menemukannya cuma ada di peramban itu. Tanya di ponsel pagi hari,
 * buka laptop siang hari, percakapannya hilang. Datanya masih utuh; tak ada
 * seorang pun yang bisa menunjuknya lagi.
 *
 * KEPUTUSAN PEMILIK PRODUK (1 Agu 2026): pelanggan yang situsnya sudah punya
 * login menyebutkan sendiri penanda penggunanya saat memasang widget — di
 * HALAMAN DALAM aplikasi mereka, bukan di landing publik.
 *
 * KENAPA TANDA TANGAN WAJIB. Penanda seperti "karyawan-4471" bisa ditebak.
 * Tanpa tanda tangan, siapa pun bisa memasang widget menyebut penanda orang
 * lain dan membaca seluruh riwayat percakapannya. Tanda tangan dihitung
 * server pelanggan memakai rahasia bersama; server kita memeriksanya.
 *
 * ┌─ YANG PALING MENENTUKAN DI BERKAS INI: RUANG NAMA TERPISAH ─────────┐
 * │ Penanda terverifikasi disimpan dengan awalan `t:`, penanda peramban │
 * │ apa adanya. Tanpa pemisahan itu, penyerang cukup mengirim           │
 * │ visitorId="karyawan-4471" TANPA tanda tangan dan mendarat di baris  │
 * │ yang sama dengan orang yang sudah terverifikasi — tanda tangannya   │
 * │ jadi hiasan yang bisa dilewati hanya dengan tidak mengirimkannya.   │
 * │                                                                     │
 * │ Karena itu pula penanda mentah yang KEBETULAN diawali `t:` ditolak: │
 * │ kalau tidak, awalannya tinggal diketik sendiri.                     │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * Jalur lama TIDAK dihapus. Widget di halaman publik tetap memakai penanda
 * peramban seperti hari ini; identitas suntikan adalah lapisan TAMBAHAN yang
 * menyala hanya bila atributnya ada. Menggantinya total akan mematikan setiap
 * widget yang sudah terpasang.
 */

/** Awalan ruang nama penanda TERVERIFIKASI. */
export const AWALAN_TERVERIFIKASI = 't:';

/** Panjang penanda yang masuk akal — cukup untuk uuid, email, atau id basis data. */
export const MAKS_PANJANG_PENANDA = 128;

/**
 * Karakter yang boleh ada di penanda.
 *
 * Sengaja longgar (huruf, angka, dan sedikit tanda baca) karena pelanggan
 * memakai bentuk id yang bermacam-macam — uuid, email, angka auto-increment.
 * Yang dilarang justru yang berbahaya: spasi dan karakter kendali, yang
 * membuat satu penanda bisa ditulis dua cara berbeda dan berakhir sebagai
 * dua riwayat terpisah untuk orang yang sama.
 */
const POLA_PENANDA = /^[A-Za-z0-9._@:+-]{1,128}$/;

export class IdentitasDitolak extends Error {}

/** Rahasia baru untuk satu chatbot — 32 byte, hex. */
export function rahasiaPengunjungBaru(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Hitung tanda tangan sebuah penanda.
 *
 * HMAC-SHA256 atas penanda MENTAH, hex huruf kecil. Bentuknya sengaja
 * sesederhana mungkin: pelanggan harus bisa menulis ulang perhitungan ini
 * dalam lima bahasa dari satu baris dokumentasi, dan tiap tambahan
 * (garam, cap waktu, urutan medan) melipatgandakan cara mereka salah.
 */
export function tandaTanganPengunjung(rahasia: string, penanda: string): string {
  return createHmac('sha256', rahasia).update(penanda, 'utf8').digest('hex');
}

/**
 * Bandingkan tanda tangan TANPA membocorkan lewat waktu.
 *
 * Perbandingan string biasa berhenti di byte pertama yang berbeda, jadi
 * lamanya perbandingan menceritakan berapa banyak karakter awal yang sudah
 * benar — cukup untuk menebak tanda tangan satu karakter demi satu karakter.
 * Panjang yang berbeda dipulangkan lebih dulu karena timingSafeEqual menolak
 * buffer tak sama panjang.
 */
export function tandaTanganCocok(harapan: string, diberikan: string): boolean {
  const a = Buffer.from(harapan, 'utf8');
  const b = Buffer.from(diberikan, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export interface MasukanIdentitas {
  /** Penanda mentah dari widget. */
  visitorId: string | null | undefined;
  /** Tanda tangan dari server pelanggan; kosong = penanda peramban biasa. */
  visitorSig?: string | null;
  /** Rahasia chatbot ybs (sudah didekripsi); null = fitur belum dinyalakan. */
  rahasia?: string | null;
}

/**
 * Ubah masukan widget jadi penanda yang BOLEH dipakai menyimpan & mencari.
 *
 * Empat keadaan, dan bedanya menentukan:
 *   1. tanda tangan sah        → `t:<penanda>` (terverifikasi, lintas perangkat)
 *   2. tanda tangan salah/palsu → DITOLAK
 *   3. tanda tangan dikirim tapi chatbotnya belum punya rahasia → DITOLAK,
 *      bukan diloloskan sebagai anonim: memperlakukannya sebagai anonim
 *      berarti pemasangan yang salah konfigurasi diam-diam kehilangan
 *      seluruh riwayatnya, dan tak ada satu pun galat yang menjelaskannya
 *   4. tanpa tanda tangan      → penanda peramban apa adanya (jalur lama)
 */
export function kanonPenanda(m: MasukanIdentitas): string {
  const penanda = (m.visitorId ?? '').trim();
  if (!POLA_PENANDA.test(penanda)) {
    throw new IdentitasDitolak('Penanda pengunjung tidak berbentuk sah');
  }

  const sig = (m.visitorSig ?? '').trim();
  if (!sig) {
    /* Penanda mentah TIDAK boleh menyerupai yang terverifikasi — kalau
       boleh, awalannya tinggal diketik sendiri dan tanda tangannya jadi
       hiasan yang bisa dilewati dengan tidak mengirimkannya. */
    if (penanda.startsWith(AWALAN_TERVERIFIKASI)) {
      throw new IdentitasDitolak('Penanda pengunjung memakai awalan yang dicadangkan');
    }
    return penanda;
  }

  if (!m.rahasia) {
    throw new IdentitasDitolak('Chatbot ini belum menyalakan identitas pengunjung');
  }
  if (!tandaTanganCocok(tandaTanganPengunjung(m.rahasia, penanda), sig)) {
    throw new IdentitasDitolak('Tanda tangan identitas pengunjung tidak cocok');
  }
  return AWALAN_TERVERIFIKASI + penanda;
}

/** Apakah penanda ini hasil identitas yang terverifikasi. */
export function terverifikasi(penandaTersimpan: string): boolean {
  return penandaTersimpan.startsWith(AWALAN_TERVERIFIKASI);
}
