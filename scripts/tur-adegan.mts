/**
 * TUR FITUR · daftar adegan.
 *
 * Satu adegan = satu fitur sebagaimana pemakainya melihatnya, bukan satu
 * berkas kode. Urutan langkahnya sengaja seperti orang memakainya: buka
 * halaman, tekan tombolnya, isi, simpan, lihat hasilnya.
 *
 * PENANDA adalah kontraknya. Tiap langkah menyebutkan apa yang HARUS terlihat
 * setelahnya; kalau tak terlihat, langkahnya gagal — sekalipun servernya
 * menjawab 200. Judul <h1> dipakai karena setiap halaman punya satu dan
 * isinya literal di kode, jadi ia tak ikut bergeser saat tata letaknya
 * diubah.
 */
import type { Page } from 'playwright-core';
import { BASIS, TANDA_UJI, adeganHalaman, bukaTunggu } from './tur-lib.mjs';
import type { DefAdegan } from './tur-lib.mjs';

const h1 = (teks: string) => `h1:has-text("${teks}")`;

/** ID objek yang dibuat tur — dihapus lagi di akhir. */
export const dibuat: { chatbotId?: string; kbId?: string } = {};

/* ── permukaan publik ─────────────────────────────────────────────────── */

export function adeganPublik(publicKey: string | null): DefAdegan[] {
  const daftar: DefAdegan[] = [
    {
      id: 'landing', fitur: 'Landing publik', jalur: '/', butuhLogin: false,
      langkah: [
        { nama: 'Buka halaman depan', jalankan: bukaTunggu('/', 'a[href="/auth"], a[href^="/auth"]') },
        {
          nama: 'Gulir ke bawah — seluruh halaman termuat',
          jalankan: async (page: Page) => {
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await page.waitForTimeout(1200);
          },
        },
      ],
    },
    {
      id: 'auth', fitur: 'Masuk & daftar', jalur: '/auth', butuhLogin: false,
      langkah: [
        { nama: 'Formulir masuk', jalankan: bukaTunggu('/auth', 'input[type="password"]') },
        {
          nama: 'Tab Daftar — pendaftaran mandiri tersedia',
          jalankan: async (page: Page) => {
            await page.locator('button[role="tab"]:has-text("Daftar")').click();
            return { penanda: 'input[placeholder="PT Nusantara"]' };
          },
        },
      ],
    },
    adeganHalaman('reset', 'Lupa password', '/auth/reset', 'input[type="email"], input[type="password"]', false),
    adeganHalaman('status', 'Halaman status', '/status', 'h1', false),
    adeganHalaman('privacy', 'Kebijakan privasi', '/privacy', 'h2:has-text("Siapa yang bertanggung jawab")', false),
    adeganHalaman('terms', 'Syarat layanan', '/terms', 'h2:has-text("Layanan")', false),
  ];

  if (publicKey) {
    daftar.push({
      id: 'widget', fitur: 'Widget embed (pengunjung)', jalur: `/c/${publicKey}`, butuhLogin: false,
      langkah: [
        { nama: 'Buka jendela chat publik', jalankan: bukaTunggu(`/c/${publicKey}`, 'input, textarea') },
      ],
    });
    daftar.push({
      id: 'demo', fitur: 'Demo publik tanpa daftar', jalur: `/demo/${publicKey}`, butuhLogin: false,
      langkah: [
        { nama: 'Buka halaman demo', jalankan: bukaTunggu(`/demo/${publicKey}`, 'text=Coba chatbot ini') },
      ],
    });
  }
  return daftar;
}

/* ── masuk ────────────────────────────────────────────────────────────── */

export function adeganMasuk(email: string, sandi: string): DefAdegan {
  return {
    id: 'masuk', fitur: 'Autentikasi (login kredensial)', jalur: '/auth', butuhLogin: false,
    langkah: [
      { nama: 'Buka formulir masuk', jalankan: bukaTunggu('/auth', 'input[type="password"]') },
      {
        nama: 'Isi kredensial dan tekan Masuk',
        jalankan: async (page: Page) => {
          await page.locator('input[type="email"]').first().fill(email);
          await page.locator('input[type="password"]').first().fill(sandi);
          await page.locator('button.btn-primary:has-text("Masuk")').first().click();
          await page.waitForURL((u) => !u.pathname.startsWith('/auth'), { timeout: 45_000 });
          return { catatan: `mendarat di ${new URL(page.url()).pathname}` };
        },
      },
    ],
  };
}

/* ── di balik login ───────────────────────────────────────────────────── */

export const adeganTerlindungi: DefAdegan[] = [
  adeganHalaman('dashboard', 'Dashboard', '/dashboard', h1('Dashboard')),

  {
    id: 'chatbots', fitur: 'Chatbots — daftar & tambah', jalur: '/chatbots', butuhLogin: true,
    langkah: [
      { nama: 'Daftar chatbot', jalankan: bukaTunggu('/chatbots', h1('Chatbots')) },
      {
        nama: 'Buka laci Tambah Chatbot',
        jalankan: async (page: Page) => {
          await page.locator('button.btn-primary:has-text("Tambah Chatbot")').first().click();
          return { penanda: 'h3:has-text("Tambah Chatbot")' };
        },
      },
      {
        /* INI keluhan 1–2 Agu: "save tambah chatbot muter2 terus". Kebuntuan
           kolam koneksi max:1. Langkah ini yang membuktikan ia benar sembuh —
           bukan tsc, bukan tes unit, tapi tombol Simpan yang benar-benar
           ditekan di produksi. */
        nama: 'Isi nama + konteks, tekan Simpan',
        butuhTulis: true,
        jalankan: async (page: Page) => {
          await page.locator('.drawer input.input, [role="dialog"] input.input').first().fill(TANDA_UJI);
          const kotakKonteks = page.locator('.drawer textarea, [role="dialog"] textarea').first();
          if (await kotakKonteks.count()) {
            await kotakKonteks.fill('Chatbot sementara yang dibuat tur fitur untuk membuktikan alur simpan bekerja. Dihapus di akhir tur.');
          }
          const t0 = Date.now();
          const [resp] = await Promise.all([
            page.waitForResponse((r) => r.url().includes('/api/chatbots') && r.request().method() === 'POST', { timeout: 60_000 }),
            page.locator('button.btn-primary:has-text("Simpan")').first().click(),
          ]);
          const body = await resp.json().catch(() => null);
          if (body?.id) dibuat.chatbotId = body.id;
          return { http: resp.status(), catatan: `POST /api/chatbots → ${resp.status()} dalam ${Date.now() - t0}ms` };
        },
      },
      {
        nama: 'Chatbot baru muncul di daftar',
        butuhTulis: true,
        jalankan: async (page: Page) => {
          await page.goto(`${BASIS}/chatbots`, { waitUntil: 'domcontentloaded' });
          return { penanda: `text=${TANDA_UJI}` };
        },
      },
    ],
  },

  {
    id: 'knowledge', fitur: 'Knowledge Base & sumber data', jalur: '/knowledge', butuhLogin: true,
    langkah: [
      { nama: 'Halaman Knowledge Base', jalankan: bukaTunggu('/knowledge', h1('Knowledge Base')) },
      {
        nama: 'Dropdown knowledge base di header Sumber Data',
        jalankan: async (page: Page) => {
          const dd = page.locator('button[aria-haspopup="listbox"], [role="combobox"]').first();
          if (!(await dd.count())) return { catatan: 'tak ada dropdown di halaman ini' };
          await dd.click();
          return { penanda: '[role="listbox"]' };
        },
      },
      {
        nama: 'Laci Tambah sumber (Drive/OneDrive/SharePoint)',
        jalankan: async (page: Page) => {
          await page.keyboard.press('Escape');
          await page.locator('button:has-text("Tambah sumber")').first().click();
          return { penanda: 'h3:has-text("Tambah sumber")' };
        },
      },
    ],
  },

  {
    id: 'chat', fitur: 'Chat — tanya jawab berdasar dokumen', jalur: '/chat', butuhLogin: true,
    langkah: [
      { nama: 'Konsol chat', jalankan: bukaTunggu('/chat', h1('Chat')) },
      {
        nama: 'Kirim pertanyaan dan tunggu jawaban',
        butuhTulis: true,
        jalankan: async (page: Page) => {
          const kotak = page.locator('input[placeholder="Tanyakan sesuatu…"]').first();
          await kotak.fill('Ringkas isi dokumen yang kamu punya dalam tiga kalimat.');
          const t0 = Date.now();
          await page.locator('button[aria-label="Kirim"]').first().click();
          /* Menunggu TEKS bertambah, bukan menunggu jaringan: jawaban datang
             lewat SSE dan permintaannya tetap "berjalan" sepanjang streaming. */
          await page.waitForFunction(
            () => (document.body.innerText.match(/\n/g) ?? []).length > 12,
            undefined, { timeout: 90_000 },
          );
          await page.waitForTimeout(4000);
          return { catatan: `jawaban mulai muncul dalam ${Date.now() - t0}ms` };
        },
      },
    ],
  },

  adeganHalaman('documents', 'Dokumen — pencarian & pratinjau', '/documents', h1('Dokumen')),
  adeganHalaman('graf', 'Graf pengetahuan', '/graf', h1('Graf Pengetahuan')),
  adeganHalaman('conversations', 'Conversations', '/conversations', h1('Conversations')),
  adeganHalaman('analytics', 'Analitik per chatbot', '/analytics', h1('Analitik')),
  adeganHalaman('memory', 'Memory agent', '/memory', h1('Memory')),
  adeganHalaman('categories', 'Kategori dokumen', '/categories', h1('Kategori Dokumen')),
  adeganHalaman('models', 'Models & Keys', '/models', 'h1'),
  adeganHalaman('branding', 'Branding / white-label', '/branding', h1('Branding')),
  adeganHalaman('team', 'Team & RBAC', '/team', h1('Team')),
  adeganHalaman('divisions', 'Divisi', '/divisions', h1('Divisi')),
  adeganHalaman('usage', 'Usage & kuota', '/usage', h1('Usage')),
  adeganHalaman('billing', 'Billing & pembayaran', '/billing', h1('Billing')),
  adeganHalaman('observability', 'Observability', '/observability', h1('Observability')),
  adeganHalaman('settings', 'Settings', '/settings', h1('Settings')),
  adeganHalaman('bantuan', 'Panduan pengguna', '/bantuan', h1('Panduan')),
  adeganHalaman('dataroom', 'Dataroom', '/dataroom', '[role="tablist"]'),
];

/* ── bersih-bersih ────────────────────────────────────────────────────── */

/**
 * Hapus objek yang dibuat tur.
 *
 * Lewat API dari dalam halaman, bukan lewat tombol di layar: yang diuji di
 * sini bukan tombol hapusnya, melainkan bahwa tur tidak meninggalkan sampah
 * di produksi orang. Semua tabel soft delete, jadi barangnya tetap bisa
 * dipulihkan kalau ternyata keliru.
 */
export async function bersihkan(page: Page): Promise<string[]> {
  const jejak: string[] = [];
  for (const [jenis, id] of [['chatbots', dibuat.chatbotId], ['knowledge-bases', dibuat.kbId]] as const) {
    if (!id) continue;
    const status = await page.evaluate(async ([j, i]) => {
      const r = await fetch(`/api/${j}/${i}`, { method: 'DELETE' });
      return r.status;
    }, [jenis, id] as [string, string]);
    jejak.push(`DELETE /api/${jenis}/${id} → ${status}`);
  }
  return jejak;
}
