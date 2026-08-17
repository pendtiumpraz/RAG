/**
 * DATAROOM — isi kedua pitch deck (superadmin).
 *
 * Data-driven: satu model slide dirender ke DOM (page.tsx), diekspor ke PPTX
 * (export.ts), dan dicetak ke PDF — dari sumber yang sama, tak ada dua versi.
 *
 * ANGKA: harga model Anthropic diambil dari registry (resmi); provider lain
 * memakai harga publik per Januari 2026 dan DITANDAI estimasi. Biaya bulanan
 * DIHITUNG di berkas ini (bukan diketik manual) dari skenario pemakaian yang
 * sama untuk semua provider — apples to apples.
 */
import type { SceneId } from './scene-text';
import { umkm } from './decks-umkm';

export type Slide =
  | { kind: 'cover'; kicker: string; title: string; subtitle: string; foot: string }
  | { kind: 'bullets'; kicker: string; title: string; bullets: string[]; note?: string }
  | { kind: 'twocol'; kicker: string; title: string; cols: Array<{ h: string; bullets: string[] }>; note?: string }
  | { kind: 'stats'; kicker: string; title: string; stats: Array<{ v: string; l: string; n?: string }>; note?: string }
  | { kind: 'flow'; kicker: string; title: string; steps: Array<{ t: string; d?: string }>; note?: string }
  | { kind: 'table'; kicker: string; title: string; headers: string[]; rows: string[][]; note?: string; small?: boolean }
  /**
   * Slide ILUSTRASI beranimasi (dek HLA). Adegannya SVG + CSS murni di
   * `scenes.tsx` — bukan gambar, jadi ia ikut menskala, ikut tema, dan tetap
   * terbaca saat dicetak (animasinya mati, isinya tampil penuh).
   */
  | { kind: 'anim'; kicker: string; title: string; scene: SceneId; note?: string }
  | { kind: 'closing'; title: string; subtitle: string; foot: string };

export interface Deck {
  id: 'hla' | 'technical' | 'business' | 'proposal' | 'umkm';
  /** Judul lengkap — dipakai judul dokumen & nama berkas ekspor PPTX. */
  label: string;
  /**
   * Label pendek untuk chip tab.
   *
   * Terpisah dari `label` karena keduanya punya tugas berbeda: judul PPTX
   * harus berdiri sendiri di luar aplikasi ("Pitch Deck — Technical"),
   * sedangkan chip tab hidup di deretan berisi delapan dan hanya perlu
   * membedakan. Menyamakannya membuat teks di dalam tab membungkus dua baris.
   */
  tab: string;
  slides: Slide[];
}

/* ── skenario biaya (dipakai SEMUA provider — apples to apples) ─────── */
/** Per giliran chat RAG: ±3.000 token masuk (konteks retrieval + riwayat +
 *  system prompt) + ±500 token keluar. Grounded pada EXEC_LIMITS produksi
 *  (cap prompt ±6k token, cap output ±2k token; tipikal jauh di bawah cap). */
export const TOK_IN = 3000;
export const TOK_OUT = 500;
const CHATS = 10_000; // skenario utama: 10.000 chat/bulan

interface PriceRow { model: string; provider: string; in: number; out: number; est?: boolean }
/** USD per 1 juta token. `est` = estimasi harga publik per Jan 2026 —
 *  verifikasi ulang sebelum dipakai di penawaran. Anthropic: dari registry. */
const PRICES: PriceRow[] = [
  { model: 'Claude Haiku 4.5',      provider: 'Anthropic', in: 1,    out: 5 },
  { model: 'Claude Sonnet 5',       provider: 'Anthropic', in: 3,    out: 15 },
  { model: 'Claude Opus 4.8',       provider: 'Anthropic', in: 5,    out: 25 },
  { model: 'GPT-5.6 Luna',          provider: 'OpenAI',    in: 0.05, out: 0.40, est: true },
  { model: 'GPT-5.6 Terra',         provider: 'OpenAI',    in: 0.25, out: 2.00, est: true },
  { model: 'GPT-5.6 Sol',           provider: 'OpenAI',    in: 1.25, out: 10,   est: true },
  { model: 'Gemini 3.5 Flash',      provider: 'Google',    in: 0.30, out: 2.50, est: true },
  { model: 'Gemini 3 Pro',          provider: 'Google',    in: 1.25, out: 10,   est: true },
  { model: 'DeepSeek V4 Flash',     provider: 'DeepSeek',  in: 0.15, out: 0.60, est: true },
  { model: 'DeepSeek V4 Pro',       provider: 'DeepSeek',  in: 0.55, out: 2.20, est: true },
  { model: 'Mistral Large 2',       provider: 'Mistral',   in: 2,    out: 6,    est: true },
  { model: 'Llama 3.3 70B (Groq)',  provider: 'Groq',      in: 0.59, out: 0.79, est: true },
  { model: 'Grok 4',                provider: 'xAI',       in: 3,    out: 15,   est: true },
  { model: 'Command R+',            provider: 'Cohere',    in: 2.50, out: 10,   est: true },
];

const usd = (n: number) =>
  n >= 100 ? `$${Math.round(n).toLocaleString('en-US')}` : `$${n.toFixed(n >= 10 ? 1 : 2)}`;

/* ── kurs ────────────────────────────────────────────────────────────
   SATU tempat, dipakai seluruh deck. Angka dolar dipertahankan karena
   itulah satuan tagihan penyedia LLM & GPU yang sebenarnya; Rupiah
   ditambahkan karena calon pelanggan menyusun anggaran dalam Rupiah dan
   memaksa mereka mengalikan sendiri di tengah presentasi bukan cara
   menjual.

   ASUMSI, bukan kurs hidup: deck ini dirender statis dan dicetak ke PDF,
   jadi menariknya dari API justru membuat dua salinan dokumen yang sama
   menampilkan angka berbeda. Perbarui satu baris ini sebelum penawaran —
   tanggalnya ikut tercetak di catatan kaki slide harga.               */
const USD_IDR = 18_000;
const RATE_AT = '30 Jul 2026';

/** Rupiah ringkas: "Rp1,2 jt" / "Rp165 rb" — deck dibaca dari jauh, deret
 *  digit penuh tak terbaca dan tak menambah informasi apa pun. */
const idr = (usdAmount: number): string => {
  const v = usdAmount * USD_IDR;
  if (v >= 1_000_000_000) return `Rp${(v / 1_000_000_000).toFixed(1).replace('.', ',')} M`;
  if (v >= 1_000_000) return `Rp${(v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1).replace('.', ',')} jt`;
  if (v >= 1_000) return `Rp${Math.round(v / 1_000).toLocaleString('id-ID')} rb`;
  return `Rp${Math.round(v).toLocaleString('id-ID')}`;
};

/** Dua satuan berdampingan — dolar tetap yang utama, Rupiah pendamping. */
const both = (usdAmount: number) => `${usd(usdAmount)} · ${idr(usdAmount)}`;

/** Bilangan bulat tak perlu desimal — "$20", bukan "$20.0". */
const usdShort = (n: number) =>
  Number.isInteger(n) ? `$${n.toLocaleString('en-US')}` : usd(n);

/** Rentang "$60–150" → "$60–150 · Rp990 rb–2,5 jt". */
const bothRange = (lo: number, hi: number) =>
  `${usdShort(lo)}–${usdShort(hi).replace('$', '')} · ${idr(lo)}–${idr(hi).replace('Rp', '')}`;

/** Biaya bulanan utk `chats` giliran: chats × (in×3k + out×0.5k) / 1jt. */
const monthly = (p: PriceRow, chats: number) =>
  (chats * (p.in * TOK_IN + p.out * TOK_OUT)) / 1_000_000;

const costRows = (chats: number) =>
  [...PRICES].sort((a, b) => monthly(a, chats) - monthly(b, chats)).map((p) => [
    p.model + (p.est ? ' *' : ''),
    p.provider,
    `$${p.in}/${p.out}`,
    usd(monthly(p, chats) / chats * 1000),
    both(monthly(p, chats)),
  ]);


/* ── skenario enterprise utk proposal on-premise ──────────────────── */
/** Pemakaian enterprise menengah: dipakai lintas divisi, tiap hari kerja. */
const ENTERPRISE_CHATS = 20_000;
const findPrice = (model: string) => PRICES.find((p) => p.model === model)!;
const entCost = (model: string) => monthly(findPrice(model), ENTERPRISE_CHATS);
const entPer1k = (model: string) => monthly(findPrice(model), 1000);
/** Biaya per 1.000 pertanyaan — DIEKSPOR agar adegan HLA memakai angka yang
 *  sama persis dengan tabel biaya di dek lain. Satu sumber, tak ada dua versi. */
export const per1kUsd = (model: string) => monthly(findPrice(model), 1000);
export const per1kIdr = (model: string) => idr(per1kUsd(model));
export const usdFmt = usd;
/**
 * Biaya listrik bulanan dari beban rata-rata (watt), tarif industri
 * Rp1.500/kWh. Memakai beban RATA-RATA, bukan puncak: GPU inferensi
 * menganggur sebagian besar waktu, dan menghitungnya pada TDP penuh 24 jam
 * akan melebih-lebihkan biaya operasional dua sampai tiga kali lipat.
 */
const listrik = (wattRata: number) =>
  `Rp${Math.round((wattRata * 24 * 30 / 1000) * 1500 / 1000).toLocaleString('id-ID')} rb`;

/* ── UKURAN PENYIMPANAN — satu sumber untuk SEMUA dek ────────────────
 *
 * Ditaruh di atas karena dek technical mengutipnya juga. Sebelumnya dek itu
 * menulis "20GB SSD" tanpa menyebut korpus apa pun, dan "NVMe" tanpa
 * kapasitas sama sekali — angka yang tak salah maupun benar karena tak ada
 * yang bisa dibandingkan dengannya. Pembaca dengan 700 GB SharePoint membaca
 * 20 GB dan menyimpulkan produknya tak paham skala mereka.
 *
 * Semua terukur di produksi dengan pg_column_size setelah migrasi 0035.
 */
/** Byte satu baris potongan (teks + vektor halfvec + metadata). */
const BYTE_BARIS_UMUM = 2_852;
/** Byte indeks vektor per potongan. */
const BYTE_INDEKS_UMUM = 804;
/** Karakter efektif per potongan (800 dikurangi tumpang tindih 120). */
const CHAR_PER_POTONGAN_UMUM = 680;
/** Cadangan WAL, bloat, autovacuum. 40% konservatif. */
const OVERHEAD_UMUM = 1.4;
/**
 * Bagian berkas sumber yang benar-benar jadi teks.
 *
 * 3%, bukan 2%: yang ini dipakai MERENCANAKAN disk, dan merencanakan dengan
 * nilai tengah adalah cara paling rapi untuk kehabisan ruang enam bulan
 * setelah pemasangan.
 */
const RASIO_RENCANA = 0.03;

/** Byte basis data (baris + indeks + cadangan) untuk sekian byte berkas sumber. */
const diskDariSumber = (byteSumber: number) =>
  ((byteSumber * RASIO_RENCANA) / CHAR_PER_POTONGAN_UMUM)
  * (BYTE_BARIS_UMUM + BYTE_INDEKS_UMUM) * OVERHEAD_UMUM;

/** Kapasitas NVMe wajar untuk korpus sebesar itu — dibulatkan ke atas ke
 *  ukuran yang benar-benar dijual, dengan ruang tumbuh minimal 2×. */
const nvmeUntuk = (byteSumber: number) => {
  const perlu = (diskDariSumber(byteSumber) * 2) / 1e9;
  const dijual = [50, 100, 250, 512, 1_000, 2_000, 4_000];
  const pilih = dijual.find((d) => d >= perlu) ?? 8_000;
  return pilih >= 1_000 ? `${pilih / 1_000} TB` : `${pilih} GB`;
};

/* Di bawah 1 GB tampil sebagai MB. Membulatkan 0,3 GB jadi "0 GB" membuat
   baris korpus terkecil terbaca seolah tak memakan apa pun. */
const gbBulat = (byte: number) =>
  byte < 1e9
    ? `${Math.round(byte / 1e6).toLocaleString('id-ID')} MB`
    : `${Math.round(byte / 1e9).toLocaleString('id-ID')} GB`;

/* ═══ DECK 1 · TECHNICAL ══════════════════════════════════════════════ */
const technical: Slide[] = [
  { kind: 'cover', kicker: 'TECHNICAL DECK · CONFIDENTIAL', title: 'Nalar',
    subtitle: 'Mesin RAG multi-tenant — reasoning, sourced. SaaS & on-premise dari satu codebase.',
    foot: 'Nalar — RAG Nalar' },

  { kind: 'flow', kicker: 'ARSITEKTUR', title: 'Modular monolith — satu deploy, batas modul tegas',
    steps: [
      { t: 'Next.js 15 + React 19', d: 'App Router; API = wrapper tipis atas service' },
      { t: '9 modul', d: 'core · auth · chatbot · chat · knowledge · connections · memory · settings · usage' },
      { t: 'Event bus in-process', d: 'modul tak saling impor utk side-effect' },
      { t: 'Postgres + pgvector', d: 'Drizzle ORM · HNSW · satu DB utk data + vektor' },
    ],
    note: 'Job latar lewat runner internal yang selamat di serverless (after + jobsSettled) — tanpa Redis, ramah on-prem.' },

  { kind: 'stats', kicker: 'ISOLASI TENANT', title: 'Row-Level Security — bukan WHERE clause, tapi kebijakan database',
    stats: [
      { v: '16', l: 'tabel ber-RLS FORCE', n: 'bocor mustahil bahkan utk query yang buggy' },
      { v: '22', l: 'policy Postgres', n: 'termasuk escape-hatch ber-GUC utk lintas-tenant sah' },
      { v: 'NOBYPASSRLS', l: 'role aplikasi nalar_app', n: 'owner DB tak pernah dipakai runtime' },
      { v: '100%', l: 'akses via withTenant()', n: 'pin app.current_tenant dalam transaksi' },
    ],
    note: 'Smoke test lintas-tenant berjalan di CI dan terhadap produksi — regresi isolasi ketahuan sebelum pengguna.' },

  { kind: 'flow', kicker: 'PIPELINE CHAT', title: 'Dari pertanyaan ke jawaban bersitasi',
    steps: [
      { t: 'Widget / API', d: 'publicKey + cek origin' },
      { t: 'Guardrails L1–L2', d: 'sanitasi input & konteks' },
      { t: 'Retrieval pgvector', d: 'union KB ter-assign · cosine top-k' },
      { t: 'LLM streaming', d: '14 model · 8 provider · self-hosted' },
      { t: 'Blok terstruktur', d: 'text/list/cards/chart + sitasi [n]' },
    ] },

  { kind: 'table', kicker: 'KEAMANAN', title: 'Guardrails 5 lapis — di jalur setiap giliran chat',
    headers: ['Lapis', 'Fungsi', 'Contoh nyata'],
    rows: [
      ['L1 Input', 'Sanitasi & batas masukan pengguna', 'kontrol char dibuang, cap 4.000 karakter'],
      ['L2 Context', 'Dokumen = DATA, bukan instruksi', 'pola injeksi dinetralkan; trigger blok palsu disaring'],
      ['L3 Execution', 'Budget eksekusi', 'cap konteks/output, timeout 60 dtk'],
      ['L4 Output', 'Redaksi secret + sitasi', 'API key/JWT diredaksi; jawaban tanpa [n] ditandai'],
      ['L5 Audit', 'Semua giliran tercatat', 'audit_logs → halaman Observability'],
    ] },

  { kind: 'twocol', kicker: 'KNOWLEDGE', title: 'KB mandiri · delta sync · N:M ke chatbot',
    cols: [
      { h: 'Knowledge base (D11)', bullets: [
        'KB entitas mandiri — di-ingest sekali, dipakai banyak chatbot',
        'Assignment N:M; retrieval = union KB ter-assign',
        'Konteks divisi per chatbot masuk system prompt',
        'Soft delete + restore di semua entitas',
      ] },
      { h: 'Sync Google Drive / Microsoft', bullets: [
        'Delta sync: hanya file baru/berubah yang diunduh & di-embed',
        'Mode Picker (drive.file, tanpa verifikasi berat) atau full-scan',
        'Ekstraksi PDF · DOCX · Google Docs/Sheets/Slides',
        'Listing terpotong tak pernah memicu penghapusan',
      ] },
    ] },

  { kind: 'stats', kicker: 'PERFORMA', title: 'Terukur di produksi (Neon + pgvector, DB p50)',
    stats: [
      { v: '1,2 ms', l: '750 chunk', n: 'HNSW index scan terkonfirmasi' },
      { v: '2,2 ms', l: '1.500 chunk' },
      { v: '4,5 ms', l: '3.000 chunk' },
      { v: '0,5 dtk', l: 'embedding query (warm)', n: 'MiniLM lokal di lambda · 3,8 dtk cold' },
    ],
    note: `Kapasitas plan DB 512 MB ±${Math.round(512e6 / (BYTE_BARIS_UMUM + BYTE_INDEKS_UMUM) / 1e3)} rb potongan setelah halfvec — sebelumnya ±30 rb, dan angka lama itu masih tersebar di catatan lama. Mode bertingkat menyala sendiri di 200 rb potongan per knowledge base.` },

  { kind: 'table', kicker: 'SPESIFIKASI · SAAS', title: 'Infrastruktur produksi saat ini',
    headers: ['Komponen', 'Spesifikasi', 'Catatan'],
    rows: [
      ['Compute', 'Vercel serverless · Node.js · ±2GB RAM/fungsi', 'maxDuration 60 dtk utk sync/memory'],
      ['Database', 'Neon Postgres 17 + pgvector 0.8', 'pool max:1 + prepare:false (serverless)'],
      ['Vektor', 'HNSW · halfvec tanpa batas dimensi', 'padding dihapus (0035): 6.148 → 776 byte/vektor, peringkat identik'],
      ['Model host', 'Vercel Blob 10GB (publik)', 'bobot ONNX ditarik transformers.js'],
      ['Embedding berat', 'VPS terpisah (BGE-M3 2,16GB, transformers v3)', 'protokol OpenAI-compatible, wajib HTTPS'],
      ['Edge', 'embed.js statis + SSE streaming', 'rate limit 2 lapis + kuota bulanan'],
    ] },

  { kind: 'table', kicker: 'SPESIFIKASI · ON-PREMISE', title: 'Kebutuhan server on-premise (docker-compose)',
    small: true,
    headers: ['Komponen', 'Minimal', 'Direkomendasikan', 'Estimasi harga perangkat'],
    rows: [
      ['App + Postgres', `2 vCPU · 8 GB RAM · ${nvmeUntuk(50e9)} NVMe`,
        `8 vCPU · 32 GB RAM · ${nvmeUntuk(700e9)} NVMe`, bothRange(600, 1200)],
      ['Embedding lokal (MiniLM/BGE-M3)', 'CPU 4 vCPU · 8GB', '8 vCPU · 16GB (atau GPU kecil)', 'menumpang server app'],
      ['LLM lokal 7–8B (Q4)', 'GPU 8GB VRAM (RTX 3060/4060)', 'RTX 4060 Ti 16GB', bothRange(300, 550)],
      ['LLM lokal 32B (Q4)', 'GPU 24GB (RTX 4090/A5000)', 'RTX 4090', bothRange(1800, 2200)],
      ['LLM lokal 70B (Q4)', '48GB VRAM (2×4090 / A6000)', 'A100 80GB', bothRange(4000, 15000)],
      ['Server LLM', 'Ollama / vLLM / LM Studio / LocalAI', 'protokol OpenAI-compatible — tinggal daftar URL', 'gratis (sumber terbuka)'],
    ],
    note: `Kolom minimum mengasumsikan korpus ±50 GB berkas sumber; kolom rekomendasi ±700 GB. DISK MENGIKUTI KORPUS — lihat tabel berikutnya, jangan pakai satu angka untuk semua ukuran. Tanpa GPU pun jalan penuh: LLM via API + embedding CPU lokal. GPU hanya utk LLM yang sepenuhnya on-prem. Harga perangkat = ESTIMASI pasar ${RATE_AT}, kurs asumsi Rp${USD_IDR.toLocaleString('id-ID')}/USD — verifikasi sebelum penawaran.` },

  { kind: 'table', kicker: 'UKURAN DISK', title: 'Berapa NVMe yang cukup — mengikuti besar korpus, bukan satu angka',
    small: true,
    headers: ['Berkas sumber', 'Teks terekstrak', 'Potongan', 'Basis data', 'NVMe', 'RAM indeks (bertingkat)'],
    rows: ([10e9, 100e9, 700e9, 1e12]).map((b) => {
      const potongan = (b * RASIO_RENCANA) / CHAR_PER_POTONGAN_UMUM;
      const ramTingkat = (potongan / 10) * BYTE_INDEKS_UMUM;
      return [
        b >= 1e12 ? '1 TB' : gbBulat(b),
        gbBulat(b * RASIO_RENCANA),
        potongan >= 1e6
          ? `${(potongan / 1e6).toFixed(1).replace('.', ',')} jt`
          : `${Math.round(potongan / 1e3)} rb`,
        gbBulat(diskDariSumber(b)),
        nvmeUntuk(b),
        ramTingkat >= 1e9
          ? `${(ramTingkat / 1e9).toFixed(1).replace('.', ',')} GB`
          : `${Math.round(ramTingkat / 1e6)} MB`,
      ];
    }),
    note: `Dasarnya ${BYTE_BARIS_UMUM.toLocaleString('id-ID')} byte per potongan + ${BYTE_INDEKS_UMUM} byte indeks (diukur pg_column_size di produksi setelah halfvec), rasio teks ${RASIO_RENCANA * 100}% dan cadangan ${Math.round((OVERHEAD_UMUM - 1) * 100)}% untuk WAL, bloat, dan autovacuum. Rasio 3% dipakai MERENCANAKAN, bukan memperkirakan — nilai tengah perkantoran 2%, dan merencanakan dengan nilai tengah adalah cara paling rapi untuk kehabisan ruang enam bulan setelah pemasangan. Kolom NVMe sudah menyisakan ruang tumbuh 2× dan dibulatkan ke kapasitas yang benar-benar dijual. BERKAS ASLINYA TIDAK DISALIN: yang disimpan hanya teks terekstrak beserta vektornya, jadi 700 GB SharePoint tidak menuntut 700 GB disk.` },

  { kind: 'bullets', kicker: 'KEAMANAN DATA', title: 'Data tenant tidak pernah telanjang',
    bullets: [
      'API key provider & token OAuth: AES-256-GCM at rest — tak pernah menyentuh browser',
      'Password: scrypt; login akun pending identik dgn password salah (anti enumerasi email)',
      'Soft delete di SEMUA tabel + endpoint /trashed & /restore',
      'Secret redaction pada keluaran LLM (per-string blok + full-text)',
      'Verifikasi superadmin sebelum akun baru bisa masuk — di jalur kredensial DAN OAuth',
    ] },

  { kind: 'closing', title: 'Reasoning, sourced.',
    subtitle: 'Satu codebase — SaaS multi-tenant dan on-premise penuh. Setiap klaim di deck ini bisa ditelusuri ke kode dan pengukuran produksinya.',
    foot: 'Nalar — GET /api/openapi' },
];

/* ═══ DECK 2 · BUSINESS ═══════════════════════════════════════════════ */
const business: Slide[] = [
  { kind: 'cover', kicker: 'BUSINESS DECK · CONFIDENTIAL', title: 'Nalar',
    subtitle: 'Tanya dokumen perusahaanmu sendiri — jawaban selalu menyebut sumbernya.',
    foot: 'Nalar — RAG Nalar' },

  { kind: 'bullets', kicker: 'MASALAH', title: 'Pengetahuan perusahaan terkubur di dalam folder',
    bullets: [
      'SOP, kontrak, dan kebijakan tersebar di Drive/SharePoint — pencarian keyword tak menjawab pertanyaan',
      'Karyawan bertanya ke orang, bukan ke dokumen: senior jadi bottleneck, onboarding lambat',
      'Chatbot AI generik menjawab PD tanpa sumber — berbahaya utk keputusan bisnis',
      'Solusi enterprise search mahal dan datanya harus keluar ke vendor',
    ] },

  { kind: 'flow', kicker: 'SOLUSI', title: 'Tiga langkah dari folder ke jawaban',
    steps: [
      { t: 'Hubungkan', d: 'Google Drive · OneDrive · SharePoint · unggah' },
      { t: 'Dipetakan', d: 'teks diekstrak, di-embed, diindeks per KB' },
      { t: 'Tanya', d: 'jawaban terstruktur + sitasi [n] ke dokumen' },
    ],
    note: 'Setiap jawaban menyebut dokumen sumber + skor kemiripan — bisa diverifikasi, bukan ditelan mentah.' },

  { kind: 'twocol', kicker: 'PRODUK', title: 'Dibangun untuk organisasi, bukan satu pengguna',
    cols: [
      { h: 'Untuk tiap divisi', bullets: [
        'Chatbot per divisi dgn konteks & wataknya sendiri',
        'KB dibagi antar chatbot — ingest sekali, dipakai semua',
        'Widget embed white-label di situs/portal mana pun',
        'Analitik per chatbot: topik, dokumen terpakai, celah KB',
      ] },
      { h: 'Untuk organisasi', bullets: [
        'Verifikasi admin utk tiap akun baru + undangan tim',
        'Kuota & rate limit per plan — biaya LLM terkendali',
        'Memory agent menyusun catatan pengetahuan otomatis',
        'Observability: audit semua aktivitas platform',
      ] },
    ] },

  { kind: 'bullets', kicker: 'DIFERENSIASI', title: 'Kenapa Nalar, bukan chatbot AI biasa',
    bullets: [
      'Sitasi DIPAKSA oleh guardrail — jawaban tanpa sumber ditandai, bukan dibiarkan',
      'Isolasi tenant di lapisan database (RLS), bukan sekadar filter aplikasi',
      'On-premise PENUH: app + embedding + LLM lokal — data tak pernah keluar',
      'Bebas pilih model: 14 model · 8 provider · atau server LLM sendiri — tanpa vendor lock-in',
      'Jawaban terstruktur (kartu, daftar, chart) — bukan tembok teks',
    ] },

  { kind: 'table', kicker: 'BIAYA AI / BULAN', title: `Biaya LLM — ${CHATS.toLocaleString('id-ID')} chat/bulan, semua provider`,
    small: true,
    headers: ['Model', 'Provider', '$/1M tok (in/out)', 'Per 1.000 chat', 'Per bulan'],
    rows: costRows(CHATS),
    note: `Skenario sama utk semua: ±${TOK_IN.toLocaleString('id-ID')} token masuk + ${TOK_OUT} keluar per giliran. * = estimasi harga publik per Jan 2026 — verifikasi sebelum penawaran. Embedding MiniLM lokal = $0. Kurs asumsi Rp${USD_IDR.toLocaleString('id-ID')}/USD (${RATE_AT}).` },

  { kind: 'stats', kicker: 'BIAYA AI / BULAN', title: 'Rentang praktisnya — 10.000 chat per bulan',
    stats: [
      { v: both(monthly(PRICES.find((p) => p.model.includes('Luna'))!, CHATS)), l: 'paling hemat', n: 'GPT-5.6 Luna — chatbot FAQ volume tinggi' },
      { v: both(monthly(PRICES.find((p) => p.model.includes('V4 Flash'))!, CHATS)), l: 'hemat & mampu', n: 'DeepSeek V4 Flash' },
      { v: both(monthly(PRICES.find((p) => p.model.includes('Sonnet'))!, CHATS)), l: 'kualitas tinggi', n: 'Claude Sonnet 5' },
      { v: both(monthly(PRICES.find((p) => p.model.includes('Opus'))!, CHATS)), l: 'flagship', n: 'Claude Opus 4.8' },
    ],
    note: 'Tenant memakai API key-nya sendiri (BYO key) — biaya LLM transparan di tangan mereka, bukan markup tersembunyi.' },

  { kind: 'table', kicker: 'BIAYA ON-PREMISE', title: 'On-prem: biaya tetap/bulan — bukan per token',
    headers: ['Skenario', 'Perangkat', 'Estimasi biaya/bulan', 'Kapasitas'],
    rows: [
      ['Hemat (LLM via API)', 'VPS 4 vCPU/8GB (app+DB+embedding CPU)', `${bothRange(20, 40)} + biaya API`, 'ratusan ribu chat'],
      ['LLM lokal kecil (7–8B)', 'VPS GPU 8–16GB VRAM', bothRange(60, 150), 'FAQ & dokumen internal'],
      ['LLM lokal menengah (32B)', 'RTX 4090 24GB (sewa)', bothRange(250, 400), 'kualitas mendekati API kelas menengah'],
      ['LLM lokal besar (70B)', '2×4090 / A100 80GB (sewa)', bothRange(700, 1500), 'kualitas tinggi, data 100% lokal'],
      ['Beli sendiri (capex)', `Server + RTX 4090: ±${both(4000)} sekali`, `listrik ±${bothRange(30, 60)}`, 'balik modal < 1 thn vs sewa'],
    ],
    note: `Estimasi harga sewa GPU cloud per Jan 2026. Kurs asumsi Rp${USD_IDR.toLocaleString('id-ID')}/USD (${RATE_AT}) — perbarui sebelum penawaran. Di atas ±50rb chat/bulan dgn model menengah, on-prem mulai lebih murah daripada API — plus kedaulatan data penuh.` },

  { kind: 'table', kicker: 'MODEL BISNIS', title: 'Harga sederhana, kuota ditegakkan sistem',
    headers: ['Plan', 'Chat/bulan', 'Chatbot', 'Anggota', 'Untuk siapa'],
    rows: [
      ['Free', '1.000', '1', '2', 'uji coba tim kecil'],
      ['Pro', '50.000', '10', '15', 'perusahaan menengah, multi-divisi'],
      ['Enterprise', 'Tanpa batas', 'Tanpa batas', 'Tanpa batas', 'SLA & dukungan khusus'],
      ['On-premise', 'Tanpa batas', 'Tanpa batas', 'Tanpa batas', 'lisensi + instalasi di server sendiri'],
    ],
    note: 'BYO API key: biaya LLM di tangan tenant. Pendapatan = langganan platform + lisensi on-prem + jasa implementasi.' },

  { kind: 'stats', kicker: 'STATUS', title: 'Bukan rencana — sudah berjalan di produksi',
    stats: [
      { v: 'LIVE', l: 'SaaS multi-tenant', n: 'berjalan di Vercel + Neon' },
      { v: '14 / 8', l: 'model / provider LLM', n: '+ server LLM & embedding self-hosted' },
      { v: '5 lapis', l: 'guardrails keamanan', n: 'diuji unit + smoke di CI' },
      { v: '2 mode', l: 'SaaS & on-premise', n: 'satu codebase, docker-compose siap' },
    ] },

  { kind: 'bullets', kicker: 'ROADMAP', title: 'Yang sedang dan akan dikerjakan',
    bullets: [
      'Gateway pembayaran (saat ini aktivasi plan manual oleh admin)',
      'Verifikasi Google full-scan Drive (CASA) utk SaaS — mode Picker sudah jalan tanpa itu',
      'Partisi vektor per-KB saat mendekati 100rb chunk per tenant',
      'Konektor tambahan (Notion, Slack, email) lewat pola Connector yang sudah ada',
      'SSO enterprise (SAML/OIDC) di atas fondasi NextAuth',
    ] },

  { kind: 'closing', title: 'Dokumenmu. Jawabanmu. Servermu — kalau mau.',
    subtitle: 'Nalar menjual kepercayaan: jawaban yang selalu bisa ditelusuri ke sumbernya, di infrastruktur yang kamu pilih sendiri.',
    foot: 'Nalar — demo tersedia' },
];


/* ═══ DECK 3 · PROPOSAL ON-PREMISE ════════════════════════════════════
   Untuk calon pelanggan dengan korpus SharePoint besar (±1 TB) yang WAJIB
   on-premise. Angka teknis di sini DITURUNKAN dari pengukuran nyata pada
   basis data produksi (2.852 byte/potongan terukur lewat pg_column_size),
   bukan taksiran — lihat catatan kaki tiap slide.

   ANGKA DI BAWAH TURUN DRASTIS pada 2026-07-31 setelah migrasi 0035
   (halfvec tanpa batas dimensi). Yang berubah bukan cara menghitungnya,
   melainkan ukuran vektornya sendiri: 6.148 → 776 byte, dengan ketelitian
   yang DIUKUR tetap sama (50/50 posisi peringkat identik). Karena itu
   spesifikasi server yang ditawarkan ikut turun — dan selisihnya jadi
   keuntungan pelanggan, bukan margin yang disimpan diam-diam.            */

/* TIGA keadaan, bukan dua. Ditulis eksplisit karena dek ini memperbandingkan
   "sebelum vs sesudah optimasi", dan sejak halfvec ada dua tahap optimasi:

     awal      vector(1536) fp32, indeks penuh   8.189 + 6.400 byte
     tahap 1   indeks berdimensi asli (0028)     8.189 + 1.572 byte
     tahap 2   halfvec tanpa padding (0035)      2.852 +   804 byte   ← kini

   Membaginya dengan satu faktor seperti versi sebelumnya akan menghasilkan
   angka yang tak berarti begitu tahap keduanya masuk. */

/** Keadaan AWAL — dipakai kolom "sebelum optimasi" di tabel perbandingan. */
const BYTES_ROW_AWAL = 8_189;
const BYTES_IDX_AWAL = 6_400;

/** Keadaan ANTARA — tahap 1 saja (indeks berdimensi asli, baris belum halfvec). */
const BYTES_IDX_TAHAP1 = 1_572;

/** Keadaan SEKARANG, terukur di produksi setelah migrasi 0035. */
const BYTES_ROW = 2_852;
const BYTES_IDX = 804;
/** Cadangan WAL, bloat, autovacuum — 40% adalah angka konservatif. */
const OVERHEAD = 1.4;
/** Karakter efektif per potongan (800 − overlap 120), terukur 676. */
const CHARS_PER_CHUNK = 680;

/** GB teks → jumlah potongan. */
const chunksFor = (gbText: number) => (gbText * 1024 ** 3) / CHARS_PER_CHUNK;
/** Disk pada keadaan AWAL (tabel + indeks + cadangan), dalam GB. */
const diskFor = (gbText: number) =>
  (chunksFor(gbText) * (BYTES_ROW_AWAL + BYTES_IDX_AWAL) * OVERHEAD) / 1024 ** 3;
/** RAM pada keadaan AWAL — indeks HNSW harus residen agar cepat. */
const ramFor = (gbText: number) => (chunksFor(gbText) * BYTES_IDX_AWAL) / 1024 ** 3;

/** Disk SEKARANG: kolom vektornya ikut mengecil, bukan indeksnya saja. */
const diskFor2 = (gbText: number) =>
  (chunksFor(gbText) * (BYTES_ROW + BYTES_IDX) * OVERHEAD) / 1024 ** 3;
/** RAM SEKARANG pada mode langsung — seluruh potongan terindeks. */
const ramFor2 = (gbText: number) => (chunksFor(gbText) * BYTES_IDX) / 1024 ** 3;
/**
 * RAM pada mode BERTINGKAT — hanya satu vektor per DOKUMEN yang residen.
 *
 * Inilah angka yang menentukan spesifikasi server, dan yang paling sering
 * disalahpahami: ia bukan "vektor yang sedang dibaca", melainkan INDEKS
 * PENYARING tahap pertama. Potongan dokumen terpilih dibaca dari disk
 * sesudahnya, dan itu tak menuntut residensi.
 */
const ramTiered = (gbText: number) =>
  ((chunksFor(gbText) / 10) * BYTES_IDX) / 1024 ** 3;

/** Keadaan antara — dipakai baris "tahap 1" di tabel arsitektur penyimpanan. */
const ramTahap1 = (gbText: number) => (chunksFor(gbText) * BYTES_IDX_TAHAP1) / 1024 ** 3;
const diskTahap1 = (gbText: number) =>
  (chunksFor(gbText) * (BYTES_ROW_AWAL + BYTES_IDX_TAHAP1) * OVERHEAD) / 1024 ** 3;

/**
 * Perkiraan ATAS korpus 1 TB SharePoint — 30 GB teks terekstrak (rasio 3%,
 * nilai perencanaan, bukan nilai tengah). Seluruh spesifikasi server di dek
 * ini diturunkan dari angka ini, jadi ia ditulis sekali di sini dan tak
 * pernah diketik ulang.
 */
const TEKS_ATAS = 30;

/* Di bawah 10 GB satu desimal DIPERTAHANKAN. Membulatkan 3,5 jadi "4" pada
   angka yang justru jadi alasan menurunkan spesifikasi server terasa seperti
   dibulatkan ke atas demi kenyamanan sendiri — dan pembacanya berhak
   membandingkannya persis dengan angka di dek HLA. */
const gb = (n: number) => n < 10 && n > 0
  ? `${n.toFixed(1).replace('.', ',')} GB`
  : `${Math.round(n).toLocaleString('id-ID')} GB`;
const jt = (n: number) => `Rp ${n.toLocaleString('id-ID')} jt`;

const proposal: Slide[] = [
  { kind: 'cover', kicker: 'PROPOSAL ON-PREMISE · CONFIDENTIAL', title: 'Nalar',
    subtitle: 'Mesin RAG untuk korpus SharePoint ±1 TB — terpasang penuh di server Anda. Tak ada dokumen yang keluar.',
    foot: 'Nalar — RAG Nalar' },

  { kind: 'bullets', kicker: 'KEBUTUHAN', title: 'Yang kami pahami dari kebutuhan Anda',
    bullets: [
      '±1 TB dokumen di SharePoint — kontrak, SOP, laporan, arsip perizinan',
      'WAJIB on-premise: dokumen tidak boleh meninggalkan infrastruktur perusahaan',
      'Dicari jawaban yang bisa DITELUSURI ke dokumen sumbernya, bukan ringkasan yang mengarang',
      'Dipakai lintas divisi — tiap divisi punya cakupan dokumen sendiri',
      'Perlu kepastian biaya: satu kali di depan, atau berlangganan — bukan tagihan yang mengambang',
    ],
    note: 'Proposal ini menyebut angka teknisnya apa adanya, termasuk yang membatasi. Tak ada yang disembunyikan untuk dipersoalkan setelah kontrak.' },

  { kind: 'flow', kicker: 'YANG TERJADI PADA 1 TB', title: 'Dari 1 TB berkas menjadi pengetahuan yang bisa ditanya',
    steps: [
      { t: '1 TB di SharePoint', d: 'PDF, DOCX, XLSX, gambar pindaian' },
      { t: '10–30 GB teks', d: 'hanya teks terekstrak; gambar & pindaian tanpa OCR dilewati' },
      { t: '15–45 juta potongan', d: '±680 karakter per potongan' },
      { t: 'Indeks vektor', d: 'pencarian makna + kata kunci (hybrid)' },
      { t: '6 potongan / pertanyaan', d: 'itulah yang benar-benar dibaca AI' },
    ],
    note: 'BERKAS ASLINYA TIDAK DISALIN. Yang disimpan hanya teks terekstrak beserta vektornya — 1 TB SharePoint Anda tetap tinggal di tempatnya.' },

  { kind: 'table', kicker: 'KAPASITAS', title: 'Kebutuhan penyimpanan & memori — dihitung, bukan ditaksir',
    small: true,
    headers: ['Teks terekstrak', 'Potongan', 'Disk Postgres', 'RAM utk indeks', 'Skenario'],
    rows: [
      ['10 GB', `${Math.round(chunksFor(10) / 1e6)} juta`, gb(diskFor(10)), gb(ramFor(10)), 'korpus dokumen teks (perkiraan bawah)'],
      ['20 GB', `${Math.round(chunksFor(20) / 1e6)} juta`, gb(diskFor(20)), gb(ramFor(20)), 'campuran dokumen Office + PDF teks'],
      ['30 GB', `${Math.round(chunksFor(30) / 1e6)} juta`, gb(diskFor(30)), gb(ramFor(30)), 'perkiraan atas 1 TB SharePoint'],
    ],
    note: 'Angka pada tabel ini adalah keadaan AWAL, sebelum dua tahap optimasi — dipakai sebagai pembanding di slide berikutnya. Dasarnya 8.189 byte/potongan terukur di produksi + indeks HNSW 6,4 kB + cadangan 40% untuk WAL dan autovacuum. Indeks harus residen di RAM agar pencarian tetap di bawah satu detik; itulah sebabnya RAM, bukan disk, yang menentukan kelas server.' },

  { kind: 'table', kicker: 'OPTIMASI TERPASANG', title: 'Dua tahap optimasi — RAM turun 8×, hasil pencarian tak berubah',
    small: true,
    headers: ['Teks', 'RAM awal', 'RAM kini (langsung)', 'RAM kini (bertingkat)', 'Disk awal', 'Disk kini'],
    rows: [
      ['10 GB', gb(ramFor(10)), gb(ramFor2(10)), gb(ramTiered(10)), gb(diskFor(10)), gb(diskFor2(10))],
      ['20 GB', gb(ramFor(20)), gb(ramFor2(20)), gb(ramTiered(20)), gb(diskFor(20)), gb(diskFor2(20))],
      ['30 GB', gb(ramFor(30)), gb(ramFor2(30)), gb(ramTiered(30)), gb(diskFor(30)), gb(diskFor2(30))],
    ],
    note: 'KEDUANYA SUDAH TERPASANG, bukan rencana. Tahap 1: model embedding menghasilkan 384 dimensi tetapi kolomnya berukuran tetap 1.536 — sisanya nol, dan nol tak menyumbang apa pun pada perhitungan jarak, jadi indeks cukup dibangun atas dimensi aslinya (4,07× lebih kecil, hasil identik, selisih persis 0). Tahap 2: presisi setengah (halfvec) DAN kolomnya berhenti diberi padding — 6.148 → 776 byte per vektor, dengan ketelitian yang diukur bukan diasumsikan: 50 dari 50 posisi peringkat teratas identik pada dokumen sungguhan. Kolom "bertingkat" adalah yang menentukan spesifikasi server: pada mode itu yang residen hanya SATU vektor per dokumen, bukan per potongan.' },

  { kind: 'table', kicker: 'SPESIFIKASI SERVER', title: 'Server yang kami rekomendasikan',
    small: true,
    headers: ['Komponen', 'Minimum', 'Direkomendasikan', 'Catatan'],
    rows: [
      ['CPU', '16 core', '32 core', 'ingest awal & embedding memakai seluruh core; menjawab hanya butuh 2–4'],
      ['RAM', '32 GB', '64 GB',
        `mode bertingkat butuh ${gb(ramTiered(TEKS_ATAS))} indeks + ±3 GB dasar sistem; ${gb(64)} memuat mode langsung (${gb(ramFor2(TEKS_ATAS))}) seutuhnya sebagai jalan mundur`],
      ['Disk data', '512 GB NVMe', '1 TB NVMe', `perkiraan atas ${gb(diskFor2(TEKS_ATAS))}; bukan HDD — pencarian vektor sensitif pada IOPS acak`],
      ['Disk backup', '1 TB', '2 TB (terpisah)', 'snapshot Postgres + WAL archive'],
      ['GPU (opsional)', 'tidak perlu', 'RTX 4090 24GB', 'hanya bila LLM ikut dijalankan lokal'],
      ['Jaringan', '1 Gbps internal', '10 Gbps', 'egress keluar hanya bila menarik dari SharePoint Online'],
      ['OS', 'Ubuntu 22.04 LTS', 'Ubuntu 24.04 LTS', 'Docker + docker-compose'],
    ],
    note: `SPESIFIKASI INI TURUN dari revisi sebelumnya (64/128 GB), dan sebabnya perlu dibaca terbuka. Angka lama diturunkan sebelum dua optimasi masuk; sesudahnya, perkiraan atas ${TEKS_ATAS} GB teks menuntut ${gb(ramFor2(TEKS_ATAS))} pada mode langsung dan hanya ${gb(ramTiered(TEKS_ATAS))} pada mode bertingkat — bukan ${gb(ramFor(TEKS_ATAS))} seperti sebelum optimasi. Kami menurunkan penawarannya alih-alih menyimpan selisihnya; itu keputusan yang disengaja. Yang tetap kami tulis apa adanya: KEBENARAN mode bertingkat sudah diuji pada basis data sungguhan (hasilnya identik dengan mode langsung), tetapi korpus ujinya kecil — yang terbukti adalah jalurnya benar, BUKAN berapa recall-nya di puluhan juta potongan. Karena itu 64 GB tetap kami rekomendasikan: ia memuat mode langsung seutuhnya, sehingga bila pengukuran pada korpus Anda mengecewakan, mode bertingkat tinggal dimatikan tanpa membeli perangkat lagi. Tanpa GPU pun berjalan penuh: embedding di CPU, LLM lewat API. Memori untuk MELAYANI pengguna tak masuk hitungan ini secara berarti — seribu pertanyaan bersamaan menambah sekitar 2 GB, dan itu sudah tertutup ruang di atas.` },

  { kind: 'table', kicker: 'ARSITEKTUR PENYIMPANAN', title: 'Tidak semua harus tinggal di memori',
    small: true,
    headers: ['Rancangan', 'Yang residen di RAM', 'RAM', 'Disk', 'Status'],
    rows: [
      ['Datar 1.536 dim fp32 — keadaan awal', 'seluruh 47 jt vektor, tiga perempatnya nol',
        gb(ramFor(TEKS_ATAS)), gb(diskFor(TEKS_ATAS)), 'ditinggalkan'],
      ['Datar dimensi asli — tahap 1', 'seluruh 47 jt vektor, indeksnya 4× lebih kecil',
        gb(ramTahap1(TEKS_ATAS)), gb(diskTahap1(TEKS_ATAS)), 'dilewati'],
      ['Datar halfvec — tahap 2', 'seluruh 47 jt vektor, 2 byte per angka tanpa padding',
        gb(ramFor2(TEKS_ATAS)), gb(diskFor2(TEKS_ATAS)), 'jalan mundur bila perlu'],
      ['BERTINGKAT — indeks di level dokumen', 'hanya ±4,7 jt vektor DOKUMEN, bukan potongan',
        gb(ramTiered(TEKS_ATAS)), gb(diskFor2(TEKS_ATAS)), 'TERPASANG — menyala otomatis'],
    ],
    note: 'Berkas asli SELALU tinggal di SharePoint — tak pernah disalin. Yang dibahas di sini hanya indeks pencariannya. Pada mode bertingkat, pencarian menyaring di tingkat DOKUMEN lebih dulu (indeks kecil, residen), lalu potongan dokumen terpilih dibaca dari disk sesuai kebutuhan — jadi RAM tak lagi tumbuh mengikuti besar korpus. Modenya menyala SENDIRI begitu sebuah knowledge base melewati ±200 ribu potongan; tak ada yang perlu dipilih operator, karena memilih mode retrieval menuntut penilaian yang pemilik data tak punya dasar untuk membuatnya. Dua hal yang perlu dibaca apa adanya: (1) KEBENARANNYA sudah diuji pada basis data sungguhan — hasil mode bertingkat identik dengan mode datar; tapi korpus ujinya kecil, jadi yang terbukti adalah jalurnya benar, BUKAN berapa recall-nya di ratusan ribu dokumen. Pengukuran itu terjadwal sebelum go-live. (2) Tukar-tambahnya nyata: dokumen yang terlewat di tingkat pertama tak akan dibaca di tingkat kedua. Dua penahan sudah terpasang — kandidat diambil jauh lebih banyak dari yang dipakai, dan pencarian kata/nomor/nama persis TIDAK ikut disaring sama sekali, sehingga tetap menyapu seluruh korpus apa pun modenya.' },

  { kind: 'table', kicker: 'BIAYA AI — PIHAK KETIGA', title: `Biaya model bahasa lewat API — ${ENTERPRISE_CHATS.toLocaleString('id-ID')} pertanyaan/bulan`,
    small: true,
    headers: ['Model', 'Penyedia', 'Per bulan', 'Per 1.000 pertanyaan', 'Catatan'],
    rows: [
      ['DeepSeek V4 Flash', 'DeepSeek', both(entCost('DeepSeek V4 Flash')), both(entPer1k('DeepSeek V4 Flash')), 'termurah; kualitas memadai utk FAQ & pencarian dokumen'],
      ['GPT-5.6 Terra', 'OpenAI', both(entCost('GPT-5.6 Terra')), both(entPer1k('GPT-5.6 Terra')), 'seimbang harga & kemampuan'],
      ['Claude Haiku 4.5', 'Anthropic', both(entCost('Claude Haiku 4.5')), both(entPer1k('Claude Haiku 4.5')), 'cepat, patuh format, murah'],
      ['Gemini 3 Pro', 'Google', both(entCost('Gemini 3 Pro')), both(entPer1k('Gemini 3 Pro')), 'konteks panjang'],
      ['Claude Sonnet 5', 'Anthropic', both(entCost('Claude Sonnet 5')), both(entPer1k('Claude Sonnet 5')), 'kualitas penalaran tertinggi di kelasnya'],
    ],
    note: `Skenario: ±${TOK_IN.toLocaleString('id-ID')} token masuk + ${TOK_OUT} keluar per pertanyaan, sesuai batas produksi. Kunci API milik Anda sendiri — kami tidak menambah markup, dan tagihannya langsung dari penyedia. PERINGATAN KEDAULATAN DATA: memakai API pihak ketiga berarti potongan dokumen Anda dikirim ke server penyedia. Bila kebijakan melarangnya, gunakan model lokal di slide berikutnya.` },

  { kind: 'table', kicker: 'BIAYA AI — ON-PREMISE', title: 'Model bahasa berjalan di server Anda — nol data keluar',
    small: true,
    headers: ['Konfigurasi', 'Perangkat', 'Sekali beli', 'Listrik / bulan', 'Kemampuan'],
    rows: [
      ['LLM 7–8B (Q4)', 'RTX 4060 Ti 16GB', bothRange(500, 800), listrik(200), 'FAQ, tanya-jawab dokumen sederhana'],
      ['LLM 32B (Q4)', 'RTX 4090 24GB', bothRange(2_000, 3_000), listrik(350), 'setara API kelas menengah — pilihan utama kami'],
      ['LLM 70B (Q4)', '2×RTX 4090 / A6000', bothRange(4_500, 9_000), listrik(700), 'kualitas tinggi, seluruhnya di dalam ruangan'],
      ['Embedding saja', 'CPU server (tanpa GPU)', 'termasuk server', listrik(60), 'cukup; hanya ingest awal jadi lama'],
    ],
    note: 'Listrik dihitung pada tarif industri Rp1.500/kWh dengan beban rata-rata realistis (bukan beban puncak 24 jam). Titik impas terhadap API: pada 20.000 pertanyaan/bulan dengan model kelas menengah, GPU sekali beli setara ±10–14 bulan biaya API — dan sesudahnya nyaris gratis, sekaligus menghapus seluruh risiko kedaulatan data.' },

  { kind: 'table', kicker: 'SERVER EMBEDDING', title: 'Yang mengubah dokumen jadi vektor — dan berapa lama ingest awalnya',
    small: true,
    headers: ['Jalur', 'Model', 'Biaya', 'Ingest awal 47 jt potongan', 'Data keluar?'],
    rows: [
      ['CPU server (bawaan)', 'MiniLM 384 dim', 'Rp 0 — termasuk', '±40–60 jam', 'TIDAK'],
      ['GPU server', 'BGE-M3 1024 dim', 'pakai GPU yang sama', '±3–5 jam', 'TIDAK'],
      ['API pihak ketiga', 'OpenAI / Cohere', bothRange(120, 200) + ' (sekali)', '±6–10 jam', 'YA — seluruh teks dikirim'],
    ],
    note: 'Untuk deployment yang WAJIB on-premise, jalur API otomatis gugur betapa pun murahnya: seluruh isi dokumen harus dikirim ke penyedia untuk di-embed. Rekomendasi kami: GPU di server — bukan demi model bahasa, melainkan demi memangkas ingest awal dari berhari-hari jadi beberapa jam. Sesudah ingest awal, embedding hanya berjalan untuk dokumen baru dan berubah.' },

  { kind: 'table', kicker: 'ANGGARAN PERANGKAT KERAS', title: 'Perkiraan biaya server — dibeli sekali, milik Anda',
    small: true,
    headers: ['Jalur', 'Isi', 'Perkiraan harga', 'Pertimbangan'],
    rows: [
      ['Baru bermerek', 'Dell PowerEdge / HPE ProLiant · 2×Xeon Gold 32c · 64 GB · 1 TB NVMe · dual PSU · garansi pabrik 3 thn',
        bothRange(8_000, 12_000), 'paling aman utk pengadaan & audit; suku cadang terjamin'],
      ['Refurbished enterprise', 'Dell R740/R750 rekondisi · spesifikasi sama · garansi reseller 1 thn',
        bothRange(2_800, 5_000), 'sepertiga harga; perlu vendor rekondisi yang jelas'],
      ['Rakitan', 'AMD EPYC / Threadripper · 64 GB ECC · NVMe konsumen',
        bothRange(3_000, 5_500), 'termurah per-performa; garansi terpisah per komponen'],
      ['GPU (opsional)', 'RTX 4090 24GB — hanya bila LLM ikut lokal',
        bothRange(2_000, 3_000), 'tak perlu bila model bahasa lewat API'],
      ['Pendukung', 'UPS, rack, jaringan, instalasi fisik', bothRange(1_500, 4_000), 'sering terlewat saat menyusun anggaran'],
    ],
    note: `PERKIRAAN PASAR ${RATE_AT}, kurs Rp${USD_IDR.toLocaleString('id-ID')}/USD — WAJIB diverifikasi dengan penawaran resmi vendor sebelum masuk anggaran. ANGKA INI TURUN dari revisi sebelumnya karena spesifikasi RAM-nya turun, bukan karena vendornya berubah: konfigurasi lama 256 GB, sekarang 64 GB. Harga RAM server 2026 sedang tinggi, jadi justru di komponen itulah selisihnya paling terasa. Pilih slot RAM yang masih menyisakan ruang kosong: menambah kapasitas setelah ukuran korpus nyata terukur pada minggu pertama jauh lebih murah daripada membeli berlebih di depan, dan pada arsitektur bertingkat kemungkinan besar tak perlu ditambah sama sekali.` },

  { kind: 'twocol', kicker: 'RUANG LINGKUP', title: 'Yang termasuk — dan yang tidak',
    cols: [
      { h: 'Termasuk', bullets: [
        'Instalasi & konfigurasi di server Anda',
        'Koneksi SharePoint + ingest awal seluruh korpus',
        'Penyetelan model embedding & LLM sesuai kebijakan Anda',
        'Pembuatan chatbot per divisi + pembagian knowledge base',
        'Pelatihan admin (2 sesi) + dokumentasi operasional',
        'Uji terima: akurasi diukur pada pertanyaan nyata Anda',
      ] },
      { h: 'Tidak termasuk', bullets: [
        'Perangkat keras server (dibeli/disediakan Anda)',
        'Biaya API model bahasa bila memakai penyedia cloud',
        'OCR dokumen hasil pindaian (bisa ditambahkan)',
        'Migrasi data di luar SharePoint',
        'Integrasi ke sistem internal lain (dikerjakan terpisah)',
      ] },
    ],
    note: 'Ingest awal 1 TB memakan waktu BERHARI-HARI, bukan berjam-jam. Ini disampaikan di muka, bukan ditemukan saat pemasangan.' },

  { kind: 'table', kicker: 'TIGA OPSI', title: 'Pilih struktur yang paling sesuai kebijakan Anda',
    small: true,
    headers: ['', 'A · Berlangganan', 'B · Lisensi Perpetual', 'C · Lisensi Kode Sumber'],
    rows: [
      ['Biaya di muka', jt(75) + ' (instalasi)', jt(550), jt(1200)],
      ['Biaya berjalan', jt(15) + ' / bulan', 'maintenance opsional', 'maintenance opsional'],
      ['Masa pakai', 'selama berlangganan', 'selamanya', 'selamanya'],
      ['Pembaruan versi', 'termasuk', '1 tahun, lalu opsional', '1 tahun, lalu opsional'],
      ['Akses kode sumber', 'tidak', 'escrow (bila kami berhenti)', 'PENUH — bebas dimodifikasi'],
      ['Modifikasi sendiri', 'tidak', 'tidak', 'ya, tanpa batas'],
      ['Lisensi berlaku', '1 badan hukum', '1 badan hukum', '1 badan hukum, tak boleh dijual ulang'],
      ['Cocok bila', 'ingin mulai cepat, belanja modal terbatas', 'ingin biaya berhenti setelah setahun', 'punya tim IT sendiri & ingin kendali penuh'],
    ],
    note: 'Semua opsi WAJIB on-premise sesuai kebutuhan Anda. Harga belum termasuk PPN. Opsi C mencakup penyerahan repositori, dokumentasi arsitektur, dan alih pengetahuan 3 sesi.' },

  { kind: 'table', kicker: 'MAINTENANCE', title: 'Dukungan bulanan — terpisah, bisa dihentikan kapan saja',
    headers: ['Tingkat', 'Isi', 'Respons', 'Biaya / bulan'],
    rows: [
      ['Dasar', 'Pembaruan keamanan, perbaikan bug, pemantauan dasar', '2 hari kerja', jt(8)],
      ['Standar', '+ pembaruan fitur, penyetelan akurasi triwulanan, backup terkelola', '1 hari kerja', jt(15)],
      ['Prioritas', '+ SLA tertulis, kanal khusus, pendampingan saat perubahan besar', '4 jam kerja', jt(25)],
    ],
    note: 'Tanpa maintenance, sistem TETAP BERJALAN — tak ada yang dimatikan dari jarak jauh. Yang berhenti hanyalah pembaruan dan dukungan kami.' },

  { kind: 'flow', kicker: 'IMPLEMENTASI', title: 'Dari kontrak sampai dipakai',
    steps: [
      { t: 'Minggu 1', d: 'penyiapan server, instalasi, koneksi SharePoint' },
      { t: 'Minggu 2–3', d: 'ingest awal korpus (berjalan latar)' },
      { t: 'Minggu 4', d: 'chatbot per divisi + penyetelan akurasi' },
      { t: 'Minggu 5', d: 'pelatihan admin & uji terima' },
      { t: 'Minggu 6', d: 'serah terima + masa pendampingan' },
    ],
    note: 'Durasi ingest bergantung jumlah berkas nyata dan kecepatan jaringan ke SharePoint; angka di atas untuk ±1 TB dengan koneksi 1 Gbps.' },

  { kind: 'bullets', kicker: 'KENAPA ON-PREMISE', title: 'Yang Anda dapatkan dengan memasang sendiri',
    bullets: [
      'Dokumen tidak pernah meninggalkan jaringan Anda — termasuk saat AI membacanya',
      'Tidak ada tagihan yang mengambang: biaya diketahui sejak awal',
      'Isolasi antar-divisi ditegakkan DATABASE (Row-Level Security), bukan sekadar filter aplikasi',
      'Model bahasa bisa ikut lokal — nol ketergantungan pada penyedia mana pun',
      'Audit lengkap: setiap pertanyaan, jawaban, dan dokumen yang dipakai tercatat',
    ],
    note: 'Kedaulatan data bukan fitur tambahan di sini — mode on-premise dan SaaS berbagi satu basis kode yang sama, jadi tak ada versi "yang dikurangi".' },

  { kind: 'closing', title: 'Dokumen Anda. Jawaban Anda. Server Anda.',
    subtitle: 'Kami siap memulai dengan sesi teknis bersama tim IT Anda untuk memastikan spesifikasi server dan jalur akses SharePoint sebelum kontrak.',
    foot: 'Nalar — RAG Nalar' },
];

/* ══════════════════════════════════════════════════════════════════
   HLA — DOKUMENTASI ARSITEKTUR BERANIMASI
   ══════════════════════════════════════════════════════════════════

   Dek ini menjelaskan CARA KERJA, bukan menjual. Sasarannya tim IT klien
   dan siapa pun yang harus paham apa yang terjadi pada dokumen mereka.

   Tiap slide ilustrasi memakai adegan SVG beranimasi di `scenes.tsx` —
   bukan gambar diam dan bukan tangkapan layar, sehingga ia ikut menskala,
   ikut tema terang/gelap, dan tetap terbaca saat dicetak jadi PDF. */
const hla: Slide[] = [
  { kind: 'cover', kicker: 'HIGH-LEVEL ARCHITECTURE', title: 'Cara Nalar Bekerja',
    subtitle: 'Dari berkas di SharePoint sampai jawaban bersitasi — setiap tahap, dan apa yang terjadi pada dokumen Anda di dalamnya.',
    foot: 'Nalar — dokumentasi arsitektur' },

  { kind: 'bullets', kicker: 'RINGKASAN', title: 'Dua jalur yang berbeda sama sekali',
    bullets: [
      'JALUR MASUK — berjalan saat sync, sekali per berkas. Berkas dibaca, teksnya diambil, dipotong, diubah jadi vektor, lalu disimpan. Mahal, tapi hanya sekali.',
      'JALUR TANYA — berjalan tiap pertanyaan, dalam hitungan detik. Tak ada berkas yang dibaca ulang di sini; yang dicari adalah potongan yang sudah tersimpan.',
      'Berkas ASLI tak pernah disalin ke mana pun. Ia tetap tinggal di Drive atau SharePoint Anda; yang tersimpan adalah teksnya, di basis data Anda sendiri.',
      'Semua yang digambarkan di dek ini berjalan pada SATU basis kode yang sama untuk mode SaaS maupun on-premise — tak ada versi "yang dikurangi".',
    ],
    note: 'Memisahkan dua jalur ini penting untuk membaca biaya: yang menentukan tagihan bulanan adalah jalur tanya, sedangkan yang menentukan spesifikasi server adalah jalur masuk.' },

  { kind: 'anim', kicker: 'JALUR MASUK', scene: 'ingest',
    title: 'Dari berkas ke potongan yang bisa dicari',
    note: 'Berkas memang harus diunduh — teks di dalam PDF tidak ada di metadata. Tapi ia hanya singgah di memori selama ekstraksi dan tak pernah ditulis ke disk. Yang tersimpan adalah teksnya: PDF 40 MB berisi 30 halaman menjadi sekitar 60 KB.' },

  { kind: 'anim', kicker: 'REDUNDANSI', scene: 'dedupe',
    title: 'Berkas kembar tak dibayar dua kali',
    note: 'Berkas kembar dicatat dan ditampilkan, tidak dibuang diam-diam — kalau sebuah berkas hilang begitu saja, pemiliknya akan mengira sync-nya gagal, dan tak ada cara mengetahui bedanya. Lingkupnya satu knowledge base: dokumen yang sama sengaja boleh hidup di dua KB berbeda, karena masing-masing melayani chatbot divisi yang berbeda.' },

  { kind: 'anim', kicker: 'JALUR TANYA', scene: 'legs',
    title: 'Tiga cara mencari, satu jawaban',
    note: 'Kaki vektor menangkap MAKNA ("aturan cuti" menemukan dokumen yang menyebut "hak istirahat tahunan"), kaki leksikal menangkap yang PERSIS (nomor kontrak, nama, kode pasal), kaki memory menangkap yang MENYELURUH. Ketiganya digabung dengan pemeringkatan gabungan, bukan dijumlahkan skornya — skor dari mesin pencari yang berbeda tak setara dan tak boleh dijumlahkan.' },

  { kind: 'anim', kicker: 'DUA MODE', scene: 'tiers',
    title: 'Mode hemat menyala sendiri, tak perlu dipilih',
    note: 'Memilih mode retrieval menuntut penilaian yang pemilik data tak punya dasar untuk membuatnya, dan salah pilih berarti jawaban yang diam-diam kehilangan dokumen. Karena itu ambangnya ditentukan sistem saat memasukkan dokumen, bukan disodorkan sebagai saklar.' },

  { kind: 'anim', kicker: 'PERILAKU JAWABAN', scene: 'policy',
    title: 'Empat tuas per chatbot — termasuk rem anti-karangan',
    note: 'Pada mode kepatuhan KETAT, pertanyaan yang jawabannya tak ada di dokumen dijawab "tidak ada di dokumen" — dan itu jawaban yang benar. Bot yang mengarang jawaban meyakinkan jauh lebih berbahaya daripada bot yang mengaku tak tahu.' },

  { kind: 'anim', kicker: 'PENJAGA', scene: 'guardrails',
    title: 'Lima lapis yang dilewati setiap pertanyaan',
    note: 'Kelimanya berjalan pada tiap giliran, bukan hanya pada mode tertentu. Jejak audit di lapis kelima mencatat pertanyaan, jawaban, dan dokumen mana yang dipakai — sehingga setiap jawaban bisa ditelusuri kembali ke sumbernya, bahkan berbulan-bulan kemudian.' },

  { kind: 'anim', kicker: 'ISOLASI', scene: 'rls',
    title: 'Batas antar pelanggan dijaga database, bukan kode',
    note: 'Perbedaannya besar: batas yang dijaga kode aplikasi bisa bocor karena satu kueri yang lupa menyaring. Batas yang dijaga database tak bisa — kebijakannya melekat pada tabel, dan aplikasi menyambung sebagai peran yang tak berhak melewatinya.' },

  { kind: 'anim', kicker: 'MEMORY', scene: 'memory',
    title: 'Ringkasan yang jadi peta pengetahuan',
    note: 'Ringkasannya ditandai tegas sebagai tulisan AI. Model boleh memakainya untuk gambaran umum, tapi angka, tanggal, nama, dan nomor pasal SELALU wajib diambil dari teks asli — sebab ringkasan adalah tafsiran, bukan kutipan.' },

  { kind: 'anim', kicker: 'BIAYA', scene: 'tokens',
    title: 'Ke mana token pergi dalam satu pertanyaan',
    note: 'Ini kesalahpahaman yang paling mahal: banyak yang mengira seluruh korpus dibaca model tiap kali ditanya, lalu menyimpulkan korpus 1 TB berarti tagihan raksasa. Pencarian berjalan di basis data dan tidak memakai token model sama sekali — yang ditagih hanya potongan terpilih yang benar-benar masuk ke konteks.' },

  { kind: 'anim', kicker: 'BIAYA', scene: 'costs',
    title: 'Dibayar sekali, dan dibayar tiap kali',
    note: 'Memisahkan keduanya penting saat menyusun anggaran: biaya sekali menentukan berapa lama pemasangan awal, sedangkan biaya berulang menentukan tagihan bulanan. Angka per 1.000 pertanyaan di slide ini diambil dari tabel harga yang sama dengan dek Technical — bukan diketik ulang, sehingga tak mungkin menyimpang.' },

  { kind: 'anim', kicker: 'DASAR', scene: 'dims',
    title: 'Vektor, dan arti angka 384 · 768 · 1024 · 1536',
    note: 'Angka itu adalah berapa bilangan dipakai untuk menggambarkan satu potongan teks. Semakin banyak, semakin halus nuansa yang bisa dibedakan — dan semakin besar memori serta waktu yang dimakan. Untuk dokumen perkantoran, selisih ketepatan antara 384 dan 1536 sering tak terasa, sementara selisih biayanya empat kali lipat. Itulah sebabnya model 384 dipakai secara bawaan di sini.' },

  { kind: 'anim', kicker: 'DASAR', scene: 'halfvec',
    title: 'halfvec — separuh ukuran, peringkat tetap sama',
    note: 'Keputusan ini diambil setelah diukur, bukan sebelum: 50 dari 50 posisi peringkat teratas identik antara presisi penuh dan presisi setengah, pada dokumen sungguhan. Yang menarik, penghematan terbesarnya justru bukan dari presisinya melainkan dari berhenti memberi padding — model 384 dimensi dulu dipaksa disimpan sebagai 1.536, dan tiga perempatnya nol yang tetap dibayar penuh di disk maupun memori.' },

  { kind: 'anim', kicker: 'PENYIMPANAN', scene: 'storage',
    title: '1 GB berkas Drive jadi berapa di basis data',
    note: 'Dulu yang memenuhi basis data BUKAN teks dokumennya melainkan vektornya — 6.148 byte melawan 680 byte, sembilan kali lipat. Setelah halfvec dan berhentinya padding, vektornya tinggal 776 byte dan keduanya nyaris seimbang. Itulah sebabnya optimasi dimensi vektor berdampak sebesar itu: yang dipangkas adalah bagian yang paling besar. Semua angka di slide ini diukur dengan pg_column_size pada data produksi.' },

  { kind: 'anim', kicker: 'PENYIMPANAN', scene: 'scale',
    title: 'Dari 1 GB sampai 1 TB',
    note: 'Dua rasio ditampilkan dengan sengaja: 2% untuk MEMPERKIRAKAN, 3% untuk MERENCANAKAN server. Merencanakan dengan nilai tengah adalah cara paling rapi untuk kehabisan memori enam bulan setelah pemasangan. Angka 3% inilah yang dipakai proposal on-premise, jadi kedua dek tak pernah berselisih. Spesifikasi server memang ditentukan oleh berapa banyak yang diambil — dan tabel inilah penerjemahnya.' },

  { kind: 'anim', kicker: 'BATAS LANGGANAN', scene: 'plans',
    title: 'Apa yang dibatasi tiap paket',
    note: 'Seluruh angka di slide ini dibaca langsung dari core/limits.ts, tempat kuotanya benar-benar ditegakkan — bukan diketik ulang. Penegakannya di knowledgeService.ingest(), satu jalur yang dilewati sync, unggahan manual, konektor URL, dan API publik sekaligus; kuota yang hanya dijaga satu rute adalah kuota yang punya pintu belakang. Baris terakhir tabel adalah TERJEMAHAN, bukan kuota: ia memperkirakan berapa GB berkas yang muat, dan angkanya berubah besar mengikuti jenis berkasnya.' },

  { kind: 'anim', kicker: 'KAPASITAS', scene: 'capacity',
    title: 'Berapa banyak yang muat — Vercel, on-premise, AWS',
    note: 'Semua angka diturunkan dari pengukuran nyata: 2.852 byte per potongan di tabel dan ±804 byte indeksnya, diukur dengan pg_column_size pada data produksi setelah migrasi halfvec. Yang perlu dibaca: mode langsung dibatasi RAM, mode bertingkat dibatasi disk — dan menaikkan disk jauh lebih murah daripada menaikkan RAM. Angka Neon dan AWS adalah atap paket tertinggi masing-masing, bukan yang dipakai hari ini.' },

  { kind: 'anim', kicker: 'MEMORI', scene: 'ramShape',
    title: 'Memori terbagi tiga — hanya satu yang mengikuti jumlah pengguna',
    note: 'Slide ini menjawab pertanyaan yang selalu datang dan paling mudah dijawab keliru: "kalau korpusnya sebesar itu, RAM-nya berapa?" Membaca ketiga bagian sebagai satu angka adalah sebab paling lazim orang salah menaksir server — terlalu besar di bagian yang tak perlu, terlalu kecil di bagian yang menentukan. Dua jenis angka dibedakan tegas di sini: byte per potongan dan per indeks TERUKUR dengan pg_column_size pada data produksi; kebutuhan per permintaan DITURUNKAN dari bentuk datanya dan belum diukur di bawah beban. Mencampur keduanya akan membuat yang terukur ikut diragukan, jadi keduanya ditandai apa adanya.' },

  { kind: 'anim', kicker: 'MEMORI', scene: 'ramQuery',
    title: 'Saat dicari — apa yang bertambah, dan berapa lama',
    note: 'Yang paling penting di slide ini bukan angka manapun, melainkan baris terakhirnya: setelah jawaban selesai, semuanya dilepas. Memori tidak menumpuk mengikuti jumlah pertanyaan yang pernah dijawab. Yang tersisa hanya page cache, dan itu memang gunanya — pertanyaan berikutnya jadi lebih cepat karena potongan yang sama sudah ada di sana. Perhatikan juga tahap terakhir: sebagian besar umur sebuah permintaan dihabiskan MENUNGGU jawaban model, tidak memakai memori maupun CPU. Itulah yang membuat slide berikutnya angkanya sekecil itu.' },

  { kind: 'anim', kicker: 'MEMORI', scene: 'ramUsers',
    title: '100 · 500 · 1.000 pengguna bersamaan',
    note: 'Sepuluh kali penggunanya, memorinya naik ±40% — bukan sepuluh kali lipat. Dua batas struktural yang membuatnya begitu: kolam koneksi basis data memberi ATAP pada berapa kueri benar-benar berjalan serentak, dan satu pertanyaan hanya memakai ±15 milidetik kerja basis data di dalam rentang ±3 detik menunggu model. Seribu pengguna bersamaan menuntut sekitar dua inti CPU, bukan seribu. Yang perlu dibaca pemilik anggaran: yang tumbuh mengikuti pengguna bukan spesifikasi server, melainkan tagihan model bahasa — kapasitas dibayar sekali, menjawab dibayar tiap kali. "Bersamaan" di sini berarti pertanyaan yang sedang berjalan pada detik yang sama, bukan jumlah pengguna terdaftar; keduanya biasanya berbeda dua sampai tiga angka nol.' },

  { kind: 'anim', kicker: 'BATAS PLATFORM', scene: 'vercel',
    title: 'Batas Vercel yang benar-benar terasa',
    note: 'Bukan daftar spesifikasi — hanya empat batas yang benar-benar menyentuh produk ini, dan semuanya sudah punya jalan keluar hari ini. Satu yang belum: atap Neon di 16 CU. Melewatinya bukan soal membayar lebih, melainkan harus pindah ke server sendiri atau ke AWS.' },

  { kind: 'anim', kicker: 'BATAS PLATFORM', scene: 'vercelBesar',
    title: 'Korpus 700 GB di Vercel — yang sudah muat, dan yang belum',
    note: 'Slide ini ada karena jawabannya TERBELAH, dan menjawabnya dengan satu kata akan menyesatkan ke dua arah sekaligus. Setelah halfvec dan mode bertingkat, korpus 700 GB benar-benar bisa DILAYANI dari Vercel + Neon — indeksnya tinggal 2,5 GB, jauh di bawah atap Neon 64 GB. Menjawab "tidak bisa" hari ini berarti mengulang batas yang sudah tidak ada lagi. Tetapi MEMASUKKAN 700 GB tetap tak bisa lewat sana, dan penghalangnya sama sekali bukan kapasitas melainkan tak adanya proses latar yang hidup terus: lambda dibekukan begitu respons terkirim. Ketiga angka penghalangnya dibaca dari kode produksi, bukan diperkirakan — bila batasnya suatu saat dinaikkan, angka di slide ini ikut berubah dengan sendirinya. Jalan tengahnya bukan tambalan: basis datanya memang sama, jadi menjalankan ingest dari VPS sementara penyajian tetap di Vercel tak menuntut satu baris kode baru.' },

  { kind: 'flow', kicker: 'RANGKUMAN', title: 'Satu pertanyaan, ujung ke ujung',
    steps: [
      { t: 'Pertanyaan masuk', d: 'widget, API, atau dashboard' },
      { t: 'Penjaga & kuota', d: 'sanitasi + batas laju' },
      { t: 'Cari tiga kaki', d: 'satu perjalanan database' },
      { t: 'Susun konteks', d: '6 potongan terpilih' },
      { t: 'Model menjawab', d: 'sesuai kebijakan chatbot' },
      { t: 'Sitasi & audit', d: 'sumber ikut dikirim' },
    ],
    note: 'Seluruh rantai ini berjalan dalam hitungan detik, dan setiap mata rantainya tercatat — termasuk dokumen mana yang dipakai untuk menyusun jawaban.' },

  { kind: 'closing', title: 'Tak ada kotak hitam.',
    subtitle: 'Setiap jawaban bisa ditelusuri ke potongan dokumen yang melahirkannya, dan setiap tahap di dek ini berjalan di server yang Anda kendalikan.',
    foot: 'Nalar — RAG Nalar' },
];

export const DECKS: Deck[] = [
  { id: 'hla', label: 'HLA — Cara Nalar Bekerja', tab: 'HLA', slides: hla },
  { id: 'technical', label: 'Pitch Deck — Technical', tab: 'Technical', slides: technical },
  { id: 'business', label: 'Pitch Deck — Business', tab: 'Business', slides: business },
  { id: 'proposal', label: 'Proposal — On-Premise 1 TB', tab: 'Proposal', slides: proposal },
  { id: 'umkm', label: 'Proposal — UMKM Lite 500rb/bulan', tab: 'UMKM Lite', slides: umkm },
];
