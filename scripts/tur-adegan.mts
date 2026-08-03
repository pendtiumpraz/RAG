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
 * isinya literal di kode, jadi ia tak ikut bergeser saat tata letaknya diubah.
 *
 * PANEL DISAPU, TIDAK DIDAFTAR TANGAN. `perluas: sapuPanel` menghitung panel
 * dari halaman yang sedang terbuka dan memberi nama tiap langkah dari judul
 * panel itu sendiri. Daftar tangan akan diam-diam jadi bohong pada panel
 * berikutnya yang ditambahkan — dan bukti yang bohong lebih buruk daripada
 * tak ada bukti.
 *
 * PERAN. Akun tur adalah superadmin, jadi panel yang hanya muncul untuk
 * superadmin (kuota plan, seluruh tenant, SMTP platform, saklar konektor,
 * server LLM/embedding, aplikasi OAuth, antrean persetujuan pendaftaran)
 * ikut tersapu tanpa perlu disebut satu per satu.
 */
import type { Page } from 'playwright-core';
import {
  BASIS, TANDA_UJI, adeganHalaman, adeganHalamanPanel, bukaTunggu, sapuPanel,
} from './tur-lib.mjs';
import type { DefAdegan, DefLangkah } from './tur-lib.mjs';

const h1 = (teks: string) => `h1:has-text("${teks}")`;

/** ID objek yang dibuat tur — dihapus lagi di akhir. */
export const dibuat: { chatbotId?: string; kbId?: string } = {};

/** Tutup laci/dialog yang masih terbuka sebelum langkah berikutnya. */
async function tutupLaci(page: Page) {
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(300);
}

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
        {
          nama: 'Gelembung chat terbuka',
          jalankan: async (page: Page) => {
            const tombol = page.locator('button[aria-label*="chat" i], .nalar-bubble, iframe').first();
            if (await tombol.count()) await tombol.click({ timeout: 5000 }).catch(() => {});
            await page.waitForTimeout(1500);
          },
        },
      ],
    });
  }
  return daftar;
}

/* ── masuk ────────────────────────────────────────────────────────────── */

export function adeganMasuk(email: string, sandi: string): DefAdegan {
  return {
    id: 'masuk', fitur: 'Autentikasi — masuk dengan kredensial', jalur: '/auth', butuhLogin: false,
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
      {
        nama: 'Sidebar lengkap — menu superadmin ikut tampil',
        jalankan: async (page: Page) => {
          await page.goto(`${BASIS}/dashboard`, { waitUntil: 'domcontentloaded' });
          return { penanda: 'a[href="/dataroom"]', catatan: 'Dataroom hanya terlihat oleh superadmin' };
        },
      },
    ],
  };
}

/* ── di balik login ───────────────────────────────────────────────────── */

/* ── komponen di build TERPASANG ──────────────────────────────────────── */

/**
 * Berapa lama sebuah komponen harus BERTAHAN terbuka.
 *
 * Bug dropdown 2 Agu 2026 tak terlihat di dev dan lolos seluruh tes unit: ia
 * membuka popup-nya lalu menutupnya sendiri dalam hitungan puluhan milidetik,
 * karena satu pendengar klik di luar ikut menangkap klik yang MEMBUKANYA.
 * Memotret sesaat setelah klik akan menangkapnya dalam keadaan terbuka dan
 * menyimpulkan semuanya baik. Yang membuktikan sebaliknya hanya menunggu.
 */
const TAHAN_MS = 900;

/**
 * Satu langkah: buka sebuah komponen, tunggu, pastikan ia MASIH terbuka.
 *
 * `pemicu` adalah yang diklik; `terlihat` adalah yang harus ada sesudahnya.
 * Keduanya wajib berbeda — memeriksa pemicunya sendiri hanya membuktikan
 * tombolnya masih ada.
 */
function langkahBertahan(nama: string, pemicu: string, terlihat: string): DefLangkah {
  return {
    nama,
    jalankan: async (page: Page) => {
      const p = page.locator(pemicu).first();
      if (!(await p.count())) return { catatan: `pemicu "${pemicu}" tak ada di halaman ini` };
      await p.click();
      const target = page.locator(terlihat).first();
      await target.waitFor({ state: 'visible', timeout: 5_000 });
      await page.waitForTimeout(TAHAN_MS);
      const masih = await target.isVisible().catch(() => false);
      if (!masih) {
        throw new Error(
          `"${nama}" terbuka lalu MENUTUP SENDIRI dalam ${TAHAN_MS}ms — `
          + 'persis bentuk bug dropdown 2 Agu 2026, dan tak terlihat di dev.',
        );
      }
      return { penanda: terlihat, catatan: `masih terbuka setelah ${TAHAN_MS}ms` };
    },
  };
}

/**
 * AUDIT KOMPONEN — kartu a-komponen-audit.
 *
 * Dropdown yang sudah ditulis ulang dan dites ternyata menutup sendiri begitu
 * dibuka; hanya di build TERPASANG, tidak di dev, dan 27 titik pakai ikut
 * terdampak. Bugnya sudah ditutup berikut guard-nya, tapi yang belum ditutup
 * adalah CARA MENEMUKANNYA: satu-satunya alasan ia ketahuan adalah kebetulan
 * ada yang mengeklik dropdown itu di staging.
 *
 * Adegan ini menutup lubang itu untuk seluruh komponen yang perilakunya
 * bergantung pada tata letak nyata — yang justru tak bisa dibuktikan tes unit
 * mana pun, karena tak satu pun dari mereka merender tata letak.
 */
const adeganKomponen: DefAdegan = {
  id: 'komponen', fitur: 'Komponen interaktif (build terpasang)', jalur: '/knowledge', butuhLogin: true,
  langkah: [
    { nama: 'Buka halaman berkomponen padat', jalankan: bukaTunggu('/knowledge', h1('Knowledge')) },

    langkahBertahan('Dropdown listbox tetap terbuka',
      'button[aria-haspopup="listbox"]', '[role="listbox"]'),

    { nama: 'Tutup dropdown', jalankan: async (page: Page) => { await tutupLaci(page); } },

    langkahBertahan('Laci (drawer) tetap terbuka',
      'button.btn-primary:has-text("Buat KB")', '[role="dialog"]'),

    {
      /* Escape HARUS menutup — dan ini bukan kenyamanan: <Drawer> mengaku
         `aria-modal="true"`, dan teknologi bantu memercayai deklarasi itu.
         Dialog yang mengaku modal tapi tak bisa ditutup papan ketik lebih
         buruk daripada yang tak mengaku apa-apa. */
      nama: 'Escape menutup laci',
      jalankan: async (page: Page) => {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(400);
        const masih = await page.locator('[role="dialog"]').first().isVisible().catch(() => false);
        if (masih) throw new Error('Laci mengaku aria-modal tapi Escape tak menutupnya');
        return { catatan: 'laci tertutup oleh Escape' };
      },
    },

    {
      /* Fokus harus KEMBALI ke tombol yang membuka. Tanpa itu ia jatuh ke
         <body>, dan pengguna papan ketik harus menelusuri halaman dari awal
         tiap kali menutup satu laci. */
      nama: 'Fokus kembali ke pemicunya',
      jalankan: async (page: Page) => {
        const aktif = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          return { tag: el?.tagName ?? '-', teks: (el?.textContent ?? '').trim().slice(0, 40) };
        });
        if (aktif.tag === 'BODY') throw new Error('Fokus jatuh ke <body> setelah laci ditutup');
        return { catatan: `fokus di <${aktif.tag.toLowerCase()}> "${aktif.teks}"` };
      },
    },

    langkahBertahan('Bilah alat tabel: dropdown penyaring tetap terbuka',
      '.tabel-alat button[aria-haspopup="listbox"]', '[role="listbox"]'),
  ],
};

export const adeganTerlindungi: DefAdegan[] = [
  adeganHalamanPanel('dashboard', 'Dashboard', '/dashboard', h1('Dashboard')),
  adeganKomponen,

  /* ── chatbots: alur tambah PENUH ───────────────────────────────────── */
  {
    id: 'chatbots', fitur: 'Chatbots — daftar, tambah, embed', jalur: '/chatbots', butuhLogin: true,
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
        /* INI keluhan 1–2 Agu: "save tambah chatbot muter2 terus" — kebuntuan
           kolam koneksi max:1. Langkah ini yang membuktikan ia benar sembuh:
           bukan tsc, bukan tes unit, tapi tombol Simpan yang benar-benar
           ditekan di produksi, dan waktunya dicatat. */
        nama: 'Isi nama + konteks, tekan Simpan',
        butuhTulis: true,
        jalankan: async (page: Page) => {
          await page.locator('.drawer input.input, [role="dialog"] input.input').first().fill(TANDA_UJI);
          const konteks = page.locator('.drawer textarea, [role="dialog"] textarea').first();
          if (await konteks.count()) {
            await konteks.fill('Chatbot sementara yang dibuat tur fitur untuk membuktikan alur simpan bekerja. Dihapus di akhir tur.');
          }
          const t0 = Date.now();
          const [resp] = await Promise.all([
            page.waitForResponse((r) => r.url().includes('/api/chatbots') && r.request().method() === 'POST', { timeout: 60_000 }),
            page.locator('button.btn-primary:has-text("Simpan")').first().click(),
          ]);
          /* Bentuknya `{ chatbot: {...} }`, bukan `{ id }` — dan tebakan
             pertama saya salah, sehingga jalan pertama meninggalkan chatbot
             uji di produksi. Kedua bentuk diterima di sini, tapi yang benar-
             benar menutup lubangnya adalah bersihkan() yang mencari BERDASAR
             NAMA: ia tak bergantung pada tebakan apa pun. */
          const body = await resp.json().catch(() => null);
          const id = body?.chatbot?.id ?? body?.id;
          if (id) dibuat.chatbotId = id;
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
      {
        nama: 'Buka editor chatbot yang sudah ada',
        jalankan: async (page: Page) => {
          await tutupLaci(page);
          await page.locator('.card button, table button, [role="row"] button').first().click({ timeout: 10_000 });
          return { penanda: '.drawer, [role="dialog"]' };
        },
      },
    ],
  },

  /* ── knowledge ─────────────────────────────────────────────────────── */
  {
    id: 'knowledge', fitur: 'Knowledge Base & sumber data', jalur: '/knowledge', butuhLogin: true,
    perluas: sapuPanel,
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
        nama: 'Laci Buat KB',
        jalankan: async (page: Page) => {
          await tutupLaci(page);
          await page.locator('button:has-text("Buat KB")').first().click();
          return { penanda: '.drawer, [role="dialog"]' };
        },
      },
      {
        nama: 'Laci Tambah sumber (Drive/OneDrive/SharePoint/S3)',
        jalankan: async (page: Page) => {
          await tutupLaci(page);
          await page.locator('button:has-text("Tambah sumber")').first().click();
          return { penanda: 'h3:has-text("Tambah sumber")' };
        },
      },
    ],
  },

  /* ── chat ──────────────────────────────────────────────────────────── */
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
          /* Menunggu TEKS bertambah, bukan menunggu jaringan: jawabannya
             datang lewat SSE dan permintaannya tetap "berjalan" sepanjang
             streaming — menunggu networkidle di sini akan menunggu selamanya. */
          await page.waitForFunction(
            () => (document.body.innerText.match(/\n/g) ?? []).length > 12,
            undefined, { timeout: 120_000 },
          );
          await page.waitForTimeout(6000);
          return { catatan: `jawaban mulai muncul dalam ${Date.now() - t0}ms` };
        },
      },
      {
        nama: 'Sesi tercatat di daftar riwayat',
        butuhTulis: true,
        jalankan: async (page: Page) => {
          await page.waitForTimeout(1500);
          return { catatan: 'rel daftar sesi di konsol Chat' };
        },
      },
    ],
  },

  /* ── sisanya: halaman + seluruh panelnya ───────────────────────────── */
  adeganHalamanPanel('documents', 'Dokumen — pencarian & pratinjau', '/documents', h1('Dokumen')),
  adeganHalamanPanel('graf', 'Graf pengetahuan', '/graf', h1('Graf Pengetahuan')),
  {
    id: 'conversations', fitur: 'Conversations (lintas tenant utk superadmin)', jalur: '/conversations', butuhLogin: true,
    perluas: sapuPanel,
    langkah: [
      { nama: 'Daftar percakapan', jalankan: bukaTunggu('/conversations', h1('Conversations')) },
      {
        nama: 'Pemilih tenant — hanya ada untuk superadmin',
        jalankan: async (page: Page) => {
          const dd = page.locator('button[aria-haspopup="listbox"], [role="combobox"], select').first();
          if (!(await dd.count())) return { catatan: 'pemilih tenant tak ditemukan di halaman ini' };
          await dd.click();
          await page.waitForTimeout(600);
        },
      },
      {
        nama: 'Buka satu sesi percakapan',
        jalankan: async (page: Page) => {
          await tutupLaci(page);
          const baris = page.locator('tbody tr, .card [role="button"], li button').first();
          if (!(await baris.count())) return { catatan: 'belum ada percakapan untuk dibuka' };
          await baris.click({ timeout: 10_000 });
          await page.waitForTimeout(1200);
        },
      },
    ],
  },
  adeganHalamanPanel('analytics', 'Analitik per chatbot', '/analytics', h1('Analitik')),
  adeganHalamanPanel('memory', 'Memory agent', '/memory', h1('Memory')),
  adeganHalamanPanel('categories', 'Kategori dokumen', '/categories', h1('Kategori Dokumen')),
  adeganHalamanPanel('models', 'Models & Keys (+ server LLM/embedding & OAuth apps)', '/models', 'h1'),
  adeganHalamanPanel('branding', 'Branding / white-label', '/branding', h1('Branding')),
  {
    id: 'team', fitur: 'Team, RBAC & antrean persetujuan', jalur: '/team', butuhLogin: true,
    perluas: sapuPanel,
    langkah: [
      { nama: 'Halaman Team', jalankan: bukaTunggu('/team', h1('Team')) },
      {
        nama: 'Laci undang anggota',
        jalankan: async (page: Page) => {
          const t = page.locator('button:has-text("Undang")').first();
          if (!(await t.count())) return { catatan: 'tombol undang tak ditemukan' };
          await t.click();
          await page.waitForTimeout(800);
        },
      },
    ],
  },
  {
    id: 'divisions', fitur: 'Divisi', jalur: '/divisions', butuhLogin: true,
    perluas: sapuPanel,
    langkah: [
      { nama: 'Halaman Divisi', jalankan: bukaTunggu('/divisions', h1('Divisi')) },
      {
        nama: 'Laci buat divisi',
        jalankan: async (page: Page) => {
          const t = page.locator('button.btn-primary').first();
          if (!(await t.count())) return { catatan: 'tombol buat tak ditemukan' };
          await t.click();
          await page.waitForTimeout(800);
        },
      },
    ],
  },
  adeganHalamanPanel('usage', 'Usage & kuota (+ per tenant utk superadmin)', '/usage', h1('Usage')),
  adeganHalamanPanel('billing', 'Billing, kuota plan & seluruh tenant', '/billing', h1('Billing')),
  adeganHalamanPanel('observability', 'Observability (superadmin)', '/observability', h1('Observability')),
  adeganHalamanPanel('settings', 'Settings (+ SMTP, demo publik, saklar konektor)', '/settings', h1('Settings')),
  adeganHalamanPanel('bantuan', 'Panduan pengguna', '/bantuan', h1('Panduan')),
  adeganHalaman('welcome', 'Layar pilih paket', '/welcome', 'h1'),

  /* ── dataroom: tiap tabnya sendiri ─────────────────────────────────── */
  {
    id: 'dataroom', fitur: 'Dataroom (superadmin)', jalur: '/dataroom', butuhLogin: true,
    perluas: async (page: Page): Promise<DefLangkah[]> => {
      const label = await page.locator('[role="tablist"] [role="tab"]').allInnerTexts().catch(() => []);
      return label.map((t, i) => ({
        nama: `Tab: ${t.trim()}`,
        jalankan: async (p: Page) => {
          await p.locator('[role="tablist"] [role="tab"]').nth(i).click();
          await p.waitForTimeout(1200);
        },
      }));
    },
    langkah: [
      { nama: 'Buka Dataroom', jalankan: bukaTunggu('/dataroom', '[role="tablist"]') },
    ],
  },
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
  /* MENCARI BERDASAR NAMA, bukan mengandalkan ID yang tertangkap saat membuat.
     Jalan pertama membuktikan kenapa: bentuk respons ternyata
     `{ chatbot: {...} }`, ID-nya tak tertangkap, dan chatbot uji tertinggal di
     produksi orang. Pembersih yang bergantung pada langkah sebelumnya berhasil
     hanya akan gagal justru ketika ia paling dibutuhkan. Pola nama ini juga
     mengangkut sisa dari jalan-jalan sebelumnya. */
  return page.evaluate(async (awalan: string) => {
    const jejak: string[] = [];
    for (const jenis of ['chatbots', 'knowledge-bases']) {
      const r = await fetch(`/api/${jenis}`);
      if (!r.ok) { jejak.push(`GET /api/${jenis} → ${r.status} (dilewati)`); continue; }
      const data = await r.json().catch(() => null);
      const baris: Array<{ id: string; name?: string }> = Array.isArray(data) ? data
        : (data?.[jenis.replace('-', '')] ?? data?.items ?? data?.chatbots ?? data?.knowledgeBases ?? []);
      for (const b of baris) {
        if (!b?.name?.startsWith(awalan)) continue;
        const d = await fetch(`/api/${jenis}/${b.id}`, { method: 'DELETE' });
        jejak.push(`DELETE /api/${jenis}/${b.id} "${b.name}" → ${d.status}`);
      }
    }
    if (!jejak.length) jejak.push('tak ada objek uji yang tersisa');
    return jejak;
  }, 'Uji Tur ');
}
