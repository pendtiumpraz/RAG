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

export type Slide =
  | { kind: 'cover'; kicker: string; title: string; subtitle: string; foot: string }
  | { kind: 'bullets'; kicker: string; title: string; bullets: string[]; note?: string }
  | { kind: 'twocol'; kicker: string; title: string; cols: Array<{ h: string; bullets: string[] }>; note?: string }
  | { kind: 'stats'; kicker: string; title: string; stats: Array<{ v: string; l: string; n?: string }>; note?: string }
  | { kind: 'flow'; kicker: string; title: string; steps: Array<{ t: string; d?: string }>; note?: string }
  | { kind: 'table'; kicker: string; title: string; headers: string[]; rows: string[][]; note?: string; small?: boolean }
  | { kind: 'closing'; title: string; subtitle: string; foot: string };

export interface Deck { id: 'technical' | 'business'; label: string; slides: Slide[] }

/* ── skenario biaya (dipakai SEMUA provider — apples to apples) ─────── */
/** Per giliran chat RAG: ±3.000 token masuk (konteks retrieval + riwayat +
 *  system prompt) + ±500 token keluar. Grounded pada EXEC_LIMITS produksi
 *  (cap prompt ±6k token, cap output ±2k token; tipikal jauh di bawah cap). */
const TOK_IN = 3000;
const TOK_OUT = 500;
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

/** Biaya bulanan utk `chats` giliran: chats × (in×3k + out×0.5k) / 1jt. */
const monthly = (p: PriceRow, chats: number) =>
  (chats * (p.in * TOK_IN + p.out * TOK_OUT)) / 1_000_000;

const costRows = (chats: number) =>
  [...PRICES].sort((a, b) => monthly(a, chats) - monthly(b, chats)).map((p) => [
    p.model + (p.est ? ' *' : ''),
    p.provider,
    `$${p.in}/${p.out}`,
    usd(monthly(p, chats) / chats * 1000),
    usd(monthly(p, chats)),
  ]);

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
    headers: ['Komponen', 'Minimal', 'Direkomendasikan'],
    rows: [
      ['App + Postgres', '2 vCPU · 4GB RAM · 20GB SSD', '4 vCPU · 8–16GB RAM · NVMe'],
      ['Embedding lokal (MiniLM/BGE-M3)', 'CPU 4 vCPU · 8GB', '8 vCPU · 16GB (atau GPU kecil)'],
      ['LLM lokal 7–8B (Q4)', 'GPU 8GB VRAM (RTX 3060/4060)', 'RTX 4060 Ti 16GB'],
      ['LLM lokal 32B (Q4)', 'GPU 24GB (RTX 4090/A5000)', 'RTX 4090'],
      ['LLM lokal 70B (Q4)', '48GB VRAM (2×4090 / A6000)', 'A100 80GB'],
      ['Server LLM', 'Ollama / vLLM / LM Studio / LocalAI', 'protokol OpenAI-compatible — tinggal daftar URL'],
    ],
    note: 'Tanpa GPU pun jalan penuh: LLM via API + embedding CPU lokal. GPU hanya utk LLM yang sepenuhnya on-prem.' },

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
    note: `Skenario sama utk semua: ±${TOK_IN.toLocaleString('id-ID')} token masuk + ${TOK_OUT} keluar per giliran. * = estimasi harga publik per Jan 2026 — verifikasi sebelum penawaran. Embedding MiniLM lokal = $0.` },

  { kind: 'stats', kicker: 'BIAYA AI / BULAN', title: 'Rentang praktisnya — 10.000 chat per bulan',
    stats: [
      { v: usd(monthly(PRICES.find((p) => p.model.includes('Luna'))!, CHATS)), l: 'paling hemat', n: 'GPT-5.6 Luna — chatbot FAQ volume tinggi' },
      { v: usd(monthly(PRICES.find((p) => p.model.includes('V4 Flash'))!, CHATS)), l: 'hemat & mampu', n: 'DeepSeek V4 Flash' },
      { v: usd(monthly(PRICES.find((p) => p.model.includes('Sonnet'))!, CHATS)), l: 'kualitas tinggi', n: 'Claude Sonnet 5' },
      { v: usd(monthly(PRICES.find((p) => p.model.includes('Opus'))!, CHATS)), l: 'flagship', n: 'Claude Opus 4.8' },
    ],
    note: 'Tenant memakai API key-nya sendiri (BYO key) — biaya LLM transparan di tangan mereka, bukan markup tersembunyi.' },

  { kind: 'table', kicker: 'BIAYA ON-PREMISE', title: 'On-prem: biaya tetap/bulan — bukan per token',
    headers: ['Skenario', 'Perangkat', 'Estimasi biaya/bulan', 'Kapasitas'],
    rows: [
      ['Hemat (LLM via API)', 'VPS 4 vCPU/8GB (app+DB+embedding CPU)', '$20–40 + biaya API', 'ratusan ribu chat'],
      ['LLM lokal kecil (7–8B)', 'VPS GPU 8–16GB VRAM', '$60–150', 'FAQ & dokumen internal'],
      ['LLM lokal menengah (32B)', 'RTX 4090 24GB (sewa)', '$250–400', 'kualitas mendekati API kelas menengah'],
      ['LLM lokal besar (70B)', '2×4090 / A100 80GB (sewa)', '$700–1.500', 'kualitas tinggi, data 100% lokal'],
      ['Beli sendiri (capex)', 'Server + RTX 4090: ±$4.000 sekali', 'listrik ±$30–60', 'balik modal < 1 thn vs sewa'],
    ],
    note: 'Estimasi harga sewa GPU cloud per Jan 2026. Di atas ±50rb chat/bulan dgn model menengah, on-prem mulai lebih murah daripada API — plus kedaulatan data penuh.' },

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

export const DECKS: Deck[] = [
  { id: 'technical', label: 'Pitch Deck — Technical', slides: technical },
  { id: 'business', label: 'Pitch Deck — Business', slides: business },
];
