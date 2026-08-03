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
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import type { Page } from 'playwright-core';

/**
 * Alamat yang ditur.
 *
 * Menerima DUA nama, dan itu disengaja. `BASIS` sudah dipakai orang saat
 * menjalankannya dari terminal, tapi ia terlalu umum untuk sebuah alur CI —
 * variabel bernama "BASIS" di daftar rahasia repositori tak memberi tahu
 * siapa pun basis apa. `TUR_BASIS` didahulukan supaya alur terjadwalnya punya
 * nama yang menjelaskan dirinya, tanpa mematahkan kebiasaan yang sudah ada.
 */
export const BASIS = (process.env.TUR_BASIS ?? process.env.BASIS
  ?? 'https://rag.sainskerta.net').replace(/\/$/, '');
export const TULIS = process.env.TUR_TULIS === '1';
export const KELUARAN = 'public/bukti';

/**
 * WebP LOSSLESS. Diukur, bukan ditebak — dan tebakan pertama memang salah.
 *
 * Satu jalan penuh berisi ±120 gambar dan tiap jalan menaruh blob baru di
 * riwayat git, jadi ukurannya layak dipikirkan. Dugaan awal "JPEG akan jauh
 * lebih kecil" ternyata KELIRU: JPEG mutu 90 justru 14MB melawan PNG 13MB,
 * karena tangkapan layar antarmuka adalah warna rata dengan tepi huruf tajam —
 * bentuk paling boros bagi JPEG (bit terbuang pada dengung di sekitar teks).
 *
 * Diukur pada SELURUH 120 berkas dengan sumber piksel identik (dua sampel
 * 12-berkas sebelumnya sama-sama mengambil 12 nama pertama secara alfabet —
 * yang kebetulan halaman paling sederhana; sampel yang sama diambil dua kali
 * bukan dua bukti):
 *   WebP lossless  58%   ← dipakai
 *   WebP q90       77%
 *   PNG           100%
 *
 * Lossless MENGALAHKAN lossy di sini, jadi tak ada pertukaran sama sekali.
 * Hasil nyata satu jalan penuh: 13MB → 5,8MB, piksel identik. Tak ada
 * sakelar mutu, karena tak ada mutu yang dikorbankan untuk ditawar.
 *
 * Playwright BISA menulis .webp sendiri, dan itu sempat terjadi tanpa
 * disadari ketika penyambungan ke sini gagal diam-diam — hasilnya 208KB
 * untuk gambar yang lewat sini jadi 66KB. Encoder peramban memakai setelan
 * bawaannya; yang di sini dipilih sengaja.
 */
export const EKSTENSI = 'webp';
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
  /**
   * Langkah tambahan yang baru bisa disusun SETELAH halamannya terbuka.
   *
   * Ada karena jumlah panel per halaman bukan pengetahuan yang boleh ditulis
   * tangan: begitu satu panel ditambahkan di kode, daftar tangan itu diam-diam
   * jadi bohong — dan bukti yang bohong lebih buruk daripada tak ada bukti.
   * Panelnya dihitung dari halaman yang sedang dibuka, saat itu juga.
   */
  perluas?: (page: Page) => Promise<DefLangkah[]>;
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
    /* Respons 4xx/5xx BUKAN `requestfailed` — permintaannya berhasil, isinya
       yang tak ada. Tanpa pendengar ini yang tersisa cuma pesan konsol
       "Failed to load resource: 404" TANPA URL, dan bukti yang tak menyebut
       apa yang hilang tak bisa ditindaklanjuti siapa pun. */
    page.on('response', (r) => {
      const s = r.status();
      const u = r.url();
      if (s < 400) return;
      if (/vitals|analytics|beacon|gtag|hotjar/.test(u)) return;
      this.galat.push(`${s} ${u.replace(/^https?:\/\/[^/]+/, '').slice(0, 140)}`);
    });
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
  /* DIKOSONGKAN, bukan sekadar dibuat. Tanpa ini, gambar dari jalan sebelumnya
     tetap tinggal — dan yang tertinggal justru bukti fitur yang sudah dihapus
     atau berganti nama, yang tak lagi ditunjuk laporan mana pun tapi masih
     ikut ter-commit. Ketahuan saat format bawaan berganti dari PNG ke JPEG:
     122 berkas lama akan menetap selamanya. */
  rmSync(KELUARAN, { recursive: true, force: true });
  mkdirSync(KELUARAN, { recursive: true });
}

/** Potret → WebP lossless. Playwright hanya bisa PNG/JPEG, jadi konversinya
 *  di sini; `effort: 5` sudah menyentuh dasar ukurannya tanpa memperlambat
 *  tur secara terasa. */
async function simpanPotret(page: Page, nama: string) {
  const png = await page.screenshot();
  const webp = await sharp(png).webp({ lossless: true, effort: 5 }).toBuffer();
  writeFileSync(`${KELUARAN}/${nama}`, webp);
}

export async function jalankanAdegan(page: Page, mata: Pengintai, def: DefAdegan): Promise<Adegan> {
  const langkah: Langkah[] = [];
  let n = 0;
  const antre = [...def.langkah];
  let sudahDiperluas = false;
  /* Perluasan dicoba di TIAP putaran, bukan hanya saat idx===1.
     Versi pertama memeriksa `idx === 1` di dalam syarat lanjut perulangan —
     dan adegan berlangkah SATU tak pernah sampai ke sana, jadi Dashboard (5
     panel) dan Models (7 panel) diam-diam hanya dapat satu potret sementara
     lognya tampak sehat. Kegagalan yang paling sepi: bukan galat, cuma bukti
     yang hilang. */
  for (let idx = 0; idx <= antre.length; idx += 1) {
    if (!sudahDiperluas && def.perluas && idx >= 1) {
      /* Disisipkan SETELAH langkah pertama (buka halaman) supaya panelnya
         dihitung dari halaman yang benar-benar sudah termuat. */
      sudahDiperluas = true;
      try {
        antre.splice(1, 0, ...await def.perluas(page));
      } catch { /* halamannya tak terbuka — biarkan langkah pertama yang melaporkan */ }
    }
    const L = antre[idx];
    if (!L) break;                    // penjaga: idx boleh menyentuh panjangnya
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
      gambar = `${def.id}-${String(n).padStart(2, '0')}.${EKSTENSI}`;
      await simpanPotret(page, gambar);
    } catch (e) {
      status = 'gagal';
      const pesan = String((e as Error).message).split('\n')[0].slice(0, 220);
      catatan = catatan ? `${catatan} · ${pesan}` : pesan;
      try {
        gambar = `${def.id}-${String(n).padStart(2, '0')}-gagal.${EKSTENSI}`;
        await simpanPotret(page, gambar);
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

/**
 * Susun satu langkah untuk TIAP panel di halaman yang sedang terbuka.
 *
 * Judul langkahnya diambil dari `.panel-head .t` — yaitu nama yang ditulis
 * produknya sendiri untuk panel itu. Sengaja bukan nama karangan saya:
 * kalau panelnya berganti nama di kode, bukti ikut berganti nama, dan tak ada
 * satu pun tempat yang perlu diingat untuk diperbarui.
 */
export async function sapuPanel(page: Page): Promise<DefLangkah[]> {
  const judul = await page.locator('.panel-head .t').allInnerTexts().catch(() => []);
  return judul.map((t, i) => ({
    nama: `Panel: ${t.trim()}`,
    jalankan: async (p: Page) => {
      const el = p.locator('.panel-head .t').nth(i);
      await el.scrollIntoViewIfNeeded({ timeout: 10_000 });
      await p.waitForTimeout(400);
      return { catatan: '' };
    },
  }));
}

/** Adegan "buka halaman lalu potret" — bentuk paling sering dipakai. */
export const adeganHalaman = (
  id: string, fitur: string, jalur: string, penanda: string, butuhLogin = true,
): DefAdegan => ({
  id, fitur, jalur, butuhLogin,
  langkah: [{ nama: `Buka ${jalur}`, jalankan: bukaTunggu(jalur, penanda) }],
});

/** Halaman + satu potret untuk tiap panel di dalamnya. */
export const adeganHalamanPanel = (
  id: string, fitur: string, jalur: string, penanda: string,
): DefAdegan => ({
  ...adeganHalaman(id, fitur, jalur, penanda),
  perluas: sapuPanel,
});
