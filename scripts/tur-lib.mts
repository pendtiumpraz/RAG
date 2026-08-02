/**
 * TUR FITUR · mesinnya.
 *
 * BAGAIMANA STATUS DIPUTUSKAN — dan kenapa bukan oleh penulis skenario.
 * Tiap langkah mengumpulkan tiga bukti: status HTTP, galat konsol peramban,
 * dan apakah PENANDA yang ditunggu benar-benar terlihat. Sebuah halaman yang
 * menjawab 200 tapi penandanya tak pernah muncul dicatat GAGAL, karena itulah
 * yang dilihat pengguna. Skenario tak punya cara menyatakan "bekerja"
 * sendiri; ia hanya boleh menyebutkan apa yang harus terlihat.
 *
 * Sengaja begitu: penilaian yang boleh ditulis sendiri oleh yang dinilai
 * bukan penilaian. assessment.ts menjanjikan "tak ada skor utk fitur yang
 * belum disaksikan bekerja" — berkas ini yang menjaga janji itu punya arti.
 */
import { mkdirSync } from 'node:fs';
import type { Page } from 'playwright-core';

export const BASIS = (process.env.BASIS ?? 'https://rag.sainskerta.net').replace(/\/$/, '');
export const TULIS = process.env.TUR_TULIS === '1';
export const KELUARAN = 'public/bukti';
export const TANDA_UJI = `Uji Tur ${new Date().toISOString().slice(0, 10)}`;

export type Status = 'bekerja' | 'sebagian' | 'gagal' | 'dilewati';

export interface Langkah {
  n: number; nama: string; gambar: string | null; status: Status;
  catatan: string; http: number | null; galat: string[]; ms: number;
}
export interface Adegan {
  id: string; fitur: string; jalur: string; butuhLogin: boolean;
  status: Status; ringkas: string; langkah: Langkah[];
}
export interface DefLangkah {
  nama: string;
  jalankan: (page: Page) => Promise<{ penanda?: string; catatan?: string; http?: number } | void>;
  /** Langkah yang MEMBUAT sesuatu di produksi — dilewati bila mode tulis mati. */
  butuhTulis?: boolean;
}
export interface DefAdegan {
  id: string; fitur: string; jalur: string; butuhLogin: boolean; langkah: DefLangkah[];
}

/**
 * Teks yang, kalau terlihat, membatalkan klaim "bekerja" apa pun.
 *
 * Ada karena penanda positif saja bisa bohong: `/demo/<kunci>` punya keadaan
 * galat "Chatbot tidak ditemukan" yang tetap merender <body> dengan rapi —
 * dan penanda `body` akan menyebutnya bekerja. Satu daftar larangan menutup
 * seluruh kelas itu sekaligus, termasuk halaman galat yang belum terpikirkan.
 */
export const LARANGAN = [
  'Chatbot tidak ditemukan',
  'Application error',
  'Terjadi kesalahan',
  'Internal Server Error',
  'This page could not be found',
  '[object Object]',
];

/** Galat konsol & permintaan gagal, dikumpulkan per langkah. */
export class Pengintai {
  private galat: string[] = [];
  pasang(page: Page) {
    page.on('console', (m) => {
      if (m.type() === 'error') this.galat.push(`konsol: ${m.text().slice(0, 200)}`);
    });
    page.on('pageerror', (e) => this.galat.push(`pageerror: ${String(e.message).slice(0, 200)}`));
    page.on('requestfailed', (r) => {
      const u = r.url();
      /* Pemblokir iklan, favicon, dan beacon analitik bukan cacat produk —
         menandainya sebagai galat membuat SELURUH tur berwarna merah dan
         laporan yang merah seluruhnya sama tak bergunanya dengan yang hijau
         seluruhnya. */
      if (/vitals|analytics|beacon|favicon|gtag|hotjar/.test(u)) return;
      this.galat.push(`gagal muat: ${u.slice(0, 120)} (${r.failure()?.errorText ?? '?'})`);
    });
  }
  ambil() { const g = [...this.galat]; this.galat = []; return g; }
}

export function siapkanKeluaran() {
  mkdirSync(KELUARAN, { recursive: true });
}

export async function jalankanAdegan(page: Page, mata: Pengintai, def: DefAdegan): Promise<Adegan> {
  const langkah: Langkah[] = [];
  let n = 0;
  for (const L of def.langkah) {
    n += 1;
    const t0 = Date.now();
    if (L.butuhTulis && !TULIS) {
      langkah.push({
        n, nama: L.nama, gambar: null, status: 'dilewati', http: null,
        catatan: 'mode tulis mati — alur ini membuat objek di produksi', galat: [], ms: 0,
      });
      console.log(`  · ${L.nama} (dilewati)`);
      continue;
    }
    mata.ambil();                       // buang galat milik langkah sebelumnya
    let status: Status = 'bekerja';
    let catatan = '';
    let http: number | null = null;
    let gambar: string | null = null;
    try {
      const hasil = await L.jalankan(page);
      http = hasil?.http ?? null;
      catatan = hasil?.catatan ?? '';
      if (hasil?.penanda) {
        await page.locator(hasil.penanda).first().waitFor({ state: 'visible', timeout: 25_000 });
      }
      await page.waitForTimeout(700);
      const teks = await page.locator('body').innerText().catch(() => '');
      const terlarang = LARANGAN.filter((x) => teks.includes(x));
      if (terlarang.length) throw new Error(`halaman menampilkan: ${terlarang.join(', ')}`);
      gambar = `${def.id}-${String(n).padStart(2, '0')}.png`;
      await page.screenshot({ path: `${KELUARAN}/${gambar}` });
    } catch (e) {
      status = 'gagal';
      const pesan = String((e as Error).message).split('\n')[0].slice(0, 220);
      catatan = catatan ? `${catatan} · ${pesan}` : pesan;
      try {
        gambar = `${def.id}-${String(n).padStart(2, '0')}-gagal.png`;
        await page.screenshot({ path: `${KELUARAN}/${gambar}` });
      } catch { gambar = null; }
    }
    const galat = mata.ambil();
    if (status === 'bekerja' && galat.length) status = 'sebagian';
    if (http !== null && http >= 400) status = 'gagal';
    langkah.push({ n, nama: L.nama, gambar, status, catatan, http, galat, ms: Date.now() - t0 });
    const tanda = status === 'bekerja' ? '+' : status === 'gagal' ? 'X' : '~';
    console.log(`  ${tanda} ${L.nama}${catatan ? ` — ${catatan}` : ''}${galat.length ? ` [${galat.length} galat konsol]` : ''}`);
  }

  const dipakai = langkah.filter((l) => l.status !== 'dilewati');
  const status: Status = dipakai.some((l) => l.status === 'gagal') ? 'gagal'
    : dipakai.some((l) => l.status === 'sebagian') ? 'sebagian'
      : dipakai.length ? 'bekerja' : 'dilewati';
  const rusak = dipakai.filter((l) => l.status !== 'bekerja');
  const ringkas = rusak.length
    ? `${rusak.length} dari ${dipakai.length} langkah bermasalah: ${rusak.map((l) => l.nama).join('; ')}`
    : `${dipakai.length} langkah, semuanya bekerja`;
  return {
    id: def.id, fitur: def.fitur, jalur: def.jalur, butuhLogin: def.butuhLogin,
    status, ringkas, langkah,
  };
}

/* ── bantuan navigasi ─────────────────────────────────────────────────── */

/** Buka jalur, tunggu penanda yang HARUS terlihat. */
export const bukaTunggu = (jalur: string, penanda: string) => async (page: Page) => {
  const r = await page.goto(BASIS + jalur, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  return { http: r?.status() ?? 0, penanda };
};

/** Adegan "buka halaman lalu potret" — bentuk paling sering dipakai. */
export const adeganHalaman = (
  id: string, fitur: string, jalur: string, penanda: string, butuhLogin = true,
): DefAdegan => ({
  id, fitur, jalur, butuhLogin,
  langkah: [{ nama: `Buka ${jalur}`, jalankan: bukaTunggu(jalur, penanda) }],
});
