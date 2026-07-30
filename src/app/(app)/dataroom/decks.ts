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

export interface Deck { id: 'hla' | 'technical' | 'business' | 'proposal'; label: string; slides: Slide[] }

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

/* ═══ DECK 1 · TECHNICAL ══════════════════════════════════════════════ */
const technical: Slide[] = [
  { kind: 'cover', kicker: 'TECHNICAL DECK · CONFIDENTIAL', title: 'Nalar',
    subtitle: 'Mesin RAG multi-tenant — reasoning, sourced. SaaS & on-premise dari satu codebase.',
    foot: 'rag.sainskerta.net · PT Sainskerta Solusi Nusantara' },

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
    note: 'Kapasitas plan DB 512MB ±30rb chunk (±20MB teks bersih); partisi per-KB disiapkan bila mendekati 100rb.' },

  { kind: 'table', kicker: 'SPESIFIKASI · SAAS', title: 'Infrastruktur produksi saat ini (rag.sainskerta.net)',
    headers: ['Komponen', 'Spesifikasi', 'Catatan'],
    rows: [
      ['Compute', 'Vercel serverless · Node.js · ±2GB RAM/fungsi', 'maxDuration 60 dtk utk sync/memory'],
      ['Database', 'Neon Postgres 17 + pgvector 0.8', 'pool max:1 + prepare:false (serverless)'],
      ['Vektor', 'HNSW · vector(1536) · zero-pad', 'model <1536d di-pad, cap 2000d pgvector'],
      ['Model host', 'Vercel Blob 10GB (publik)', 'bobot ONNX ditarik transformers.js'],
      ['Embedding berat', 'VPS terpisah (BGE-M3 2,16GB, transformers v3)', 'protokol OpenAI-compatible, wajib HTTPS'],
      ['Edge', 'embed.js statis + SSE streaming', 'rate limit 2 lapis + kuota bulanan'],
    ] },

  { kind: 'table', kicker: 'SPESIFIKASI · ON-PREMISE', title: 'Kebutuhan server on-premise (docker-compose)',
    small: true,
    headers: ['Komponen', 'Minimal', 'Direkomendasikan', 'Estimasi harga perangkat'],
    rows: [
      ['App + Postgres', '2 vCPU · 4GB RAM · 20GB SSD', '4 vCPU · 8–16GB RAM · NVMe', bothRange(600, 1200)],
      ['Embedding lokal (MiniLM/BGE-M3)', 'CPU 4 vCPU · 8GB', '8 vCPU · 16GB (atau GPU kecil)', 'menumpang server app'],
      ['LLM lokal 7–8B (Q4)', 'GPU 8GB VRAM (RTX 3060/4060)', 'RTX 4060 Ti 16GB', bothRange(300, 550)],
      ['LLM lokal 32B (Q4)', 'GPU 24GB (RTX 4090/A5000)', 'RTX 4090', bothRange(1800, 2200)],
      ['LLM lokal 70B (Q4)', '48GB VRAM (2×4090 / A6000)', 'A100 80GB', bothRange(4000, 15000)],
      ['Server LLM', 'Ollama / vLLM / LM Studio / LocalAI', 'protokol OpenAI-compatible — tinggal daftar URL', 'gratis (sumber terbuka)'],
    ],
    note: `Tanpa GPU pun jalan penuh: LLM via API + embedding CPU lokal. GPU hanya utk LLM yang sepenuhnya on-prem. Harga perangkat = ESTIMASI pasar ${RATE_AT}, kurs asumsi Rp${USD_IDR.toLocaleString('id-ID')}/USD — verifikasi sebelum penawaran.` },

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
    foot: 'rag.sainskerta.net · GET /api/openapi' },
];

/* ═══ DECK 2 · BUSINESS ═══════════════════════════════════════════════ */
const business: Slide[] = [
  { kind: 'cover', kicker: 'BUSINESS DECK · CONFIDENTIAL', title: 'Nalar',
    subtitle: 'Tanya dokumen perusahaanmu sendiri — jawaban selalu menyebut sumbernya.',
    foot: 'rag.sainskerta.net · PT Sainskerta Solusi Nusantara' },

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
      { v: 'LIVE', l: 'rag.sainskerta.net', n: 'SaaS multi-tenant di Vercel + Neon' },
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
    foot: 'rag.sainskerta.net · demo tersedia' },
];


/* ═══ DECK 3 · PROPOSAL ON-PREMISE ════════════════════════════════════
   Untuk calon pelanggan dengan korpus SharePoint besar (±1 TB) yang WAJIB
   on-premise. Angka teknis di sini DITURUNKAN dari pengukuran nyata pada
   basis data produksi (8.189 byte/potongan terukur lewat pg_column_size),
   bukan taksiran — lihat catatan kaki tiap slide.                       */

/** Ukuran satu potongan di tabel `documents`, TERUKUR di produksi. */
const BYTES_ROW = 8_189;
/** Indeks HNSW menyimpan salinan vektornya lagi + tautan graf. */
const BYTES_IDX = 6_400;
/** Cadangan WAL, bloat, autovacuum — 40% adalah angka konservatif. */
const OVERHEAD = 1.4;
/** Karakter efektif per potongan (800 − overlap 120), terukur 676. */
const CHARS_PER_CHUNK = 680;

/** GB teks → jumlah potongan. */
const chunksFor = (gbText: number) => (gbText * 1024 ** 3) / CHARS_PER_CHUNK;
/** GB teks → disk Postgres (tabel + indeks + cadangan), dalam GB. */
const diskFor = (gbText: number) =>
  (chunksFor(gbText) * (BYTES_ROW + BYTES_IDX) * OVERHEAD) / 1024 ** 3;
/** GB teks → RAM yang dibutuhkan indeks HNSW agar tetap residen, dalam GB. */
const ramFor = (gbText: number) => (chunksFor(gbText) * BYTES_IDX) / 1024 ** 3;
/** Indeks berdimensi asli — TERUKUR 4,07x lebih kecil setelah migrasi 0028. */
const BYTES_IDX_OPT = Math.round(BYTES_IDX / 4.07);
/** Disk SESUDAH optimasi: indeksnya mengecil, kolomnya tidak. */
const diskFor2 = (gbText: number) =>
  (chunksFor(gbText) * (BYTES_ROW + BYTES_IDX_OPT) * OVERHEAD) / 1024 ** 3;

const gb = (n: number) => `${Math.round(n).toLocaleString('id-ID')} GB`;
const jt = (n: number) => `Rp ${n.toLocaleString('id-ID')} jt`;

const proposal: Slide[] = [
  { kind: 'cover', kicker: 'PROPOSAL ON-PREMISE · CONFIDENTIAL', title: 'Nalar',
    subtitle: 'Mesin RAG untuk korpus SharePoint ±1 TB — terpasang penuh di server Anda. Tak ada dokumen yang keluar.',
    foot: 'PT Sainskerta Solusi Nusantara · rag.sainskerta.net' },

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
    note: 'Dasar hitungan: 8.189 byte/potongan TERUKUR di basis data produksi (pg_column_size), + indeks HNSW 6,4 kB, + cadangan 40% utk WAL & autovacuum. Indeks harus residen di RAM agar pencarian tetap di bawah satu detik.' },

  { kind: 'table', kicker: 'OPTIMASI TERPASANG', title: 'Indeks berdimensi asli — RAM 4× lebih kecil, hasil tak berubah sedikit pun',
    small: true,
    headers: ['Teks', 'RAM sebelum', 'RAM sesudah', 'Disk sebelum', 'Disk sesudah'],
    rows: [
      ['10 GB', gb(ramFor(10)), gb(ramFor(10) / 4.07), gb(diskFor(10)), gb(diskFor2(10))],
      ['20 GB', gb(ramFor(20)), gb(ramFor(20) / 4.07), gb(diskFor(20)), gb(diskFor2(20))],
      ['30 GB', gb(ramFor(30)), gb(ramFor(30) / 4.07), gb(diskFor(30)), gb(diskFor2(30))],
    ],
    note: 'SUDAH TERPASANG, bukan rencana. Model embedding menghasilkan 384 dimensi tetapi kolomnya berukuran tetap 1.536 — sisanya nol. Karena nol tak menyumbang apa pun pada perhitungan jarak, indeks cukup dibangun atas dimensi aslinya: hasil pencarian IDENTIK (diverifikasi selisih persis 0 terhadap data nyata), sementara indeksnya 4,07× lebih kecil. Perhatikan disk hanya turun ±1,5×: yang mengecil adalah indeksnya, sedangkan kolomnya masih menyimpan padding — itu memang disengaja, karena RAM-lah yang menentukan kelas server, dan disk jauh lebih murah daripada waktu re-embed jutaan potongan.' },

  { kind: 'table', kicker: 'SPESIFIKASI SERVER', title: 'Server yang kami rekomendasikan',
    small: true,
    headers: ['Komponen', 'Minimum', 'Direkomendasikan', 'Catatan'],
    rows: [
      ['CPU', '16 core', '32 core', 'ingest awal & embedding memakai seluruh core'],
      ['RAM', '64 GB', '128 GB', '64 GB cukup sampai ±25 GB teks; 128 GB menutup perkiraan atas (69 GB) dengan ruang lega'],
      ['Disk data', '1 TB NVMe', '2 TB NVMe', 'bukan HDD: pencarian vektor sensitif pada IOPS acak'],
      ['Disk backup', '2 TB', '4 TB (terpisah)', 'snapshot Postgres + WAL archive'],
      ['GPU (opsional)', 'tidak perlu', 'RTX 4090 24GB', 'hanya bila LLM ikut dijalankan lokal'],
      ['Jaringan', '1 Gbps internal', '10 Gbps', 'egress keluar hanya bila menarik dari SharePoint Online'],
      ['OS', 'Ubuntu 22.04 LTS', 'Ubuntu 24.04 LTS', 'Docker + docker-compose'],
    ],
    note: 'Rekomendasi ini SUDAH memperhitungkan optimasi dimensi vektor di slide sebelumnya. Tanpa optimasi itu, perkiraan atas (30 GB teks) menuntut 288 GB RAM — karena itu optimasinya kami jadikan syarat, bukan pilihan. Tanpa GPU pun berjalan penuh: embedding di CPU, LLM lewat API. Catatan yang disengaja: angka RAM di atas BELUM memperhitungkan mode bertingkat, walaupun mode itu sudah terpasang dan secara rancangan menurunkan indeks residen ke 1–3 GB. Kami menahannya sampai recall-nya terukur pada korpus sebesar milik Anda — menjual spesifikasi yang lebih murah di atas angka yang belum diukur bukan kebiasaan kami. Bila pengukuran itu sesuai harapan, kebutuhan RAM turun jauh dan selisihnya menjadi keuntungan Anda, bukan tagihan tambahan.' },

  { kind: 'table', kicker: 'ARSITEKTUR PENYIMPANAN', title: 'Tidak semua harus tinggal di memori',
    small: true,
    headers: ['Rancangan', 'Yang residen di RAM', 'RAM', 'Disk', 'Status'],
    rows: [
      ['Datar 1.536 dim — sebelum optimasi', 'seluruh 47 jt vektor', '282 GB', '901 GB', 'ditinggalkan'],
      ['Datar dimensi asli — TERPASANG', 'seluruh 47 jt vektor, 4× lebih kecil', '69 GB', '603 GB', 'berjalan hari ini'],
      ['BERTINGKAT — indeks di level dokumen', 'hanya ±200 rb vektor dokumen', '1–3 GB', '603 GB', 'TERPASANG — menyala otomatis'],
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
      ['Baru bermerek', 'Dell PowerEdge / HPE ProLiant · 2×Xeon Gold 32c · 256 GB · 2 TB NVMe · dual PSU · garansi pabrik 3 thn',
        bothRange(12_000, 18_000), 'paling aman utk pengadaan & audit; suku cadang terjamin'],
      ['Refurbished enterprise', 'Dell R740/R750 rekondisi · spesifikasi sama · garansi reseller 1 thn',
        bothRange(4_000, 7_500), 'sepertiga harga; perlu vendor rekondisi yang jelas'],
      ['Rakitan', 'AMD EPYC / Threadripper · 256 GB ECC · NVMe konsumen',
        bothRange(4_500, 8_000), 'termurah per-performa; garansi terpisah per komponen'],
      ['GPU (opsional)', 'RTX 4090 24GB — hanya bila LLM ikut lokal',
        bothRange(2_000, 3_000), 'tak perlu bila model bahasa lewat API'],
      ['Pendukung', 'UPS, rack, jaringan, instalasi fisik', bothRange(1_500, 4_000), 'sering terlewat saat menyusun anggaran'],
    ],
    note: `PERKIRAAN PASAR ${RATE_AT}, kurs Rp${USD_IDR.toLocaleString('id-ID')}/USD — WAJIB diverifikasi dengan penawaran resmi vendor sebelum masuk anggaran. Catatan penting: harga RAM server 2026 sedang tinggi, dan 256 GB adalah komponen termahal di konfigurasi ini. Setelah optimasi dimensi vektor, 128 GB sudah memadai untuk perkiraan atas — selisihnya besar, jadi tetapkan kapasitas setelah ukuran korpus nyata terukur pada minggu pertama.` },

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
    foot: 'PT Sainskerta Solusi Nusantara · rag.sainskerta.net' },
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
    foot: 'PT Sainskerta Solusi Nusantara · dokumentasi arsitektur' },

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

  { kind: 'anim', kicker: 'BATAS LANGGANAN', scene: 'plans',
    title: 'Apa yang dibatasi tiap paket — dan apa yang belum',
    note: 'Angka di slide ini diambil langsung dari core/limits.ts, tempat kuotanya benar-benar ditegakkan. Yang belum punya kuota disebut apa adanya: jumlah knowledge base, jumlah dokumen, dan besar penyimpanan. Untuk on-premise itu memang benar — batasnya server pelanggan. Untuk SaaS ia perlu ditambahkan sebelum pelanggan berbayar pertama masuk, karena satu tenant Free bisa mengunggah puluhan gigabyte tanpa tertahan apa pun.' },

  { kind: 'anim', kicker: 'KAPASITAS', scene: 'capacity',
    title: 'Berapa banyak yang muat — Vercel, on-premise, AWS',
    note: 'Semua angka diturunkan dari satu pengukuran nyata: 8.189 byte per potongan di tabel, diukur dengan pg_column_size pada data produksi. Yang perlu dibaca: mode langsung dibatasi RAM, mode bertingkat dibatasi disk — dan menaikkan disk jauh lebih murah daripada menaikkan RAM. Angka Neon dan AWS adalah atap paket tertinggi masing-masing, bukan yang dipakai hari ini.' },

  { kind: 'anim', kicker: 'BATAS PLATFORM', scene: 'vercel',
    title: 'Batas Vercel yang benar-benar terasa',
    note: 'Bukan daftar spesifikasi — hanya empat batas yang benar-benar menyentuh produk ini, dan semuanya sudah punya jalan keluar hari ini. Satu yang belum: atap Neon di 16 CU. Melewatinya bukan soal membayar lebih, melainkan harus pindah ke server sendiri atau ke AWS.' },

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
    foot: 'PT Sainskerta Solusi Nusantara · rag.sainskerta.net' },
];

export const DECKS: Deck[] = [
  { id: 'hla', label: 'HLA — Cara Nalar Bekerja', slides: hla },
  { id: 'technical', label: 'Pitch Deck — Technical', slides: technical },
  { id: 'business', label: 'Pitch Deck — Business', slides: business },
  { id: 'proposal', label: 'Proposal — On-Premise 1 TB', slides: proposal },
];
