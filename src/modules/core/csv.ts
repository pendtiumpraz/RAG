/**
 * CSV — penulis yang aman dibuka di Excel.
 *
 * Bukan `join(',')`. Tiga hal yang membuat CSV naif berubah jadi cacat, dan
 * ketiganya baru terlihat setelah berkasnya sampai di komputer orang lain:
 *
 * 1. SUNTIKAN RUMUS. Sel yang diawali `=`, `+`, `-`, `@`, tab, atau carriage
 *    return dieksekusi Excel/Sheets sebagai rumus saat dibuka. Analitik kita
 *    memuat PERTANYAAN YANG DIKETIK PENGUNJUNG — teks yang sepenuhnya dikuasai
 *    orang luar. Satu pertanyaan `=HYPERLINK("http://…"&A1,"klik")` berubah
 *    jadi penyedot data begitu pemilik bisnis membuka laporannya. Ini kelas
 *    kerentanan tersendiri (CSV injection), dan pemiliknya adalah kita, bukan
 *    Excel.
 * 2. PEMISAH DI DALAM ISI. Koma, kutip ganda, dan baris baru di dalam sel
 *    menggeser seluruh kolom bila tak dikutip.
 * 3. HURUF NON-ASCII. Excel di Windows membaca CSV sebagai ANSI kecuali
 *    berkasnya diawali BOM UTF-8 — tanpa itu "Perjanjian Kerja Sama" jadi
 *    "Perjanjian Kerja Sama" dan laporan terlihat rusak.
 */

/** BOM UTF-8. Tanpa ini Excel di Windows salah membaca huruf beraksen. */
export const BOM = '﻿';

/** Karakter pembuka yang membuat Excel memperlakukan sel sebagai RUMUS. */
const AWALAN_RUMUS = /^[=+\-@\t\r]/;

/**
 * Satu sel CSV.
 *
 * Sel berbahaya diawali kutip tunggal — cara baku menetralkan rumus tanpa
 * mengubah apa yang terbaca manusia. Tanda minus ikut dinetralkan meski
 * angka negatif juga diawali minus; karena itu ANGKA dilewatkan sebagai
 * number, bukan string, dan tak pernah menyentuh jalur ini.
 */
export function sel(nilai: unknown): string {
  if (nilai === null || nilai === undefined) return '';
  if (typeof nilai === 'number') return Number.isFinite(nilai) ? String(nilai) : '';
  if (typeof nilai === 'boolean') return nilai ? 'true' : 'false';

  let s = String(nilai);
  if (AWALAN_RUMUS.test(s)) s = `'${s}`;
  // Kutip bila memuat pemisah, kutip, atau baris baru. Kutip di dalam isi
  // digandakan — itu cara CSV melepaskan karakter, bukan backslash.
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function baris(nilai: unknown[]): string {
  return nilai.map(sel).join(',');
}

/**
 * Rangkai tabel menjadi teks CSV lengkap.
 *
 * CRLF, bukan LF: sebagian besar penerima laporan ini membukanya di Excel
 * Windows, dan RFC 4180 memang menuliskannya begitu.
 */
export function tabel(header: string[], isi: unknown[][]): string {
  return BOM + [baris(header), ...isi.map(baris)].join('\r\n') + '\r\n';
}

/**
 * Beberapa tabel dalam SATU berkas, dipisah judul bagian.
 *
 * Analitik punya lima tabel dengan bentuk kolom berbeda (ringkasan, harian,
 * pertanyaan, kata kunci, dokumen). Memaksanya jadi satu tabel lebar akan
 * mengisi sebagian besar sel dengan kosong; memecahnya jadi lima berkas
 * memindahkan pekerjaan menggabungkan ke pengguna. Satu berkas berbagian
 * adalah bentuk yang benar-benar dipakai orang saat membawanya ke rapat.
 */
export interface BagianCsv {
  judul: string;
  header: string[];
  isi: unknown[][];
}

export function berbagian(bagian: BagianCsv[]): string {
  const potongan: string[] = [];
  for (const b of bagian) {
    // Judul lewat sel() juga: judul pun bisa memuat koma suatu hari nanti.
    potongan.push(baris([b.judul]));
    potongan.push(baris(b.header));
    for (const r of b.isi) potongan.push(baris(r));
    potongan.push('');   // satu baris kosong antar bagian
  }
  return BOM + potongan.join('\r\n') + '\r\n';
}

/**
 * Nama berkas yang aman dipakai di header Content-Disposition.
 *
 * Nama chatbot dikuasai pengguna dan bisa memuat kutip, koma, atau baris
 * baru — ketiganya memecah header HTTP, dan baris baru bahkan menyisipkan
 * header baru (response splitting).
 */
export function namaBerkas(dasar: string, awal: string, akhir: string): string {
  const bersih = dasar.normalize('NFKD').replace(/[^\w\-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return `${bersih || 'analitik'}-${awal}-sd-${akhir}.csv`;
}
