# Progress — Nalar (RAG Engine)

> **Source of truth progress project. Update setiap kali ada perubahan status fase.**
> Mengikuti Sainskerta Loop Workflow (`loop/`).

---

## Ringkasan

| Item | Status |
|------|--------|
| **Project** | `Nalar — Multi-tenant RAG Engine` |
| **Fase Aktif** | `07-IMPROVEMENT` — Fase 03/04/06 SELESAI, Fase 05 tersisa uji beban |
| **Status Loop** | `active` |
| **Dimulai** | `2026-07-23` |
| **Live sejak** | `2026-07-24` di `rag.sainskerta.net` (Vercel + Neon PG17/pgvector 0.8) |
| **Terakhir diperbarui** | `2026-07-27` |
| **Progress** | `~90% — semua fitur roadmap tayang & terverifikasi di produksi; sisa: uji beban, optimasi storage vektor, integrasi pembayaran (menunggu pilihan penyedia)` |

---

## Fase

### ✅ Fase 00: Prerequisites — `Sebagian`
- [x] Requirement dasar dari user (terkumpul dari percakapan)
- [x] Framework di-scaffold awal (Next.js) — **perlu approval ulang via Loop**
- [x] Database credentials dari user (Rule #8) — Neon PG17 + pgvector 0.8
- [x] Environment setup final (`.env` + `.env.example`; Vercel Blob utk model host)
- [x] Git initialized + remote `pendtiumpraz/RAG`

### ➡️ Fase 01: Planning — `In Progress`
- [x] Analisa requirement
- [x] Tanya jawab arsitektur dengan user — **D1/D2/D3 APPROVED** (lihat `architecture-decisions.md`)
- [x] Project structure awal dibuat (restrukturisasi Modular Monolith = task berikutnya)
- [ ] Roadmap final disepakati

### ➡️ Fase 02: Wireframe & Audit — `In Progress`
- [x] Wireframe low fidelity → `wireframes/dashboard-wireframe.html` (7 screen + mobile)
- [x] User approve wireframe (2026-07-23)
- [x] Mockup high fidelity dashboard → `wireframes/dashboard-mockup.html` (7 halaman, revisi elegan dark-first)
- [x] Mockup landing page → `wireframes/landing-mockup.html`
- [x] Mockup embed widget + **white-label customizer live** → `wireframes/embed-demo.html`
- [x] Mockup auth (login/register) → `wireframes/auth-mockup.html`
- [x] Mockup halaman Branding (white-label + live preview) → `wireframes/branding-mockup.html`
- [👀] User approve SEMUA mockup — **GATE menunggu approve/revisi → lalu Fase 03**

### ✅ Fase 03: Backend — `SELESAI (2026-07-23)`
- [x] Schema compliant: No-FK + `deleted_at` semua tabel + theme_config + tabel memory (notes/edges)
- [x] Restrukturisasi Modular Monolith → `src/modules/{core,chatbot,knowledge,chat,settings,memory}`
- [x] Repository + Service + Event bus per module; integritas referensial + cascade soft-delete di service
- [x] API: CRUD chatbots + `/trashed` + `/:id/restore`; documents delete/trashed/restore; ingest; settings; chat SSE + GET theme (white-label served)
- [x] Memory primitives: wikilink parser, upsert note+edges, graph, export vault
- [x] **Auth nyata NextAuth** (`src/modules/auth/`): Credentials (scrypt) + Google + Microsoft; JWT session bawa userId/tenantId/role; `signup→tenant` transaksi RLS-aware; OAuth email baru = provisioning tenant otomatis; policy `users_auth_lookup` (migrations/0002) utk lookup lintas-tenant yang aman; `core/auth.ts` ganti stub → getServerSession + requireRole; `middleware.ts` proteksi route (embed/chat tetap publik)
- [x] **Rate limit + kuota per plan** (`core/limits.ts` + `modules/usage/`): token-bucket in-memory (2 lapis: per-chatbot sesuai plan + per-IP), PLAN_LIMITS (free/pro/enterprise/onprem), tabel `usage_counters` (+RLS 0003, upsert atomik), guard kuota bulanan di endpoint chat (429 + Retry-After), metering token per giliran, `GET /api/usage`, enforcement maxChatbots di create, anti-abuse signup 5/menit/IP, batas panjang pesan 4000
- [x] **Guardrails 5 lapis** (`core/guardrails.ts`, terpasang di pipeline chat + auth):
      L1 input sanitize · L2 anti prompt-injection (chunk=data, filter pola, hardening) ·
      L3 execution budget (cap chunk/output/timeout) · L4 redaksi secret + enforcement sitasi ·
      L5 audit_logs (RLS, migration 0004) dgn flag pelanggaran per giliran
- [x] **Memory Agent L1–L4** (`memory/memory-agent.service.ts` + job runner `core/jobs.ts`):
      L1 capture (dok→note) · L2 distill (LLM abstrak+poin) · L3 link (entitas→[[wikilink]]+MOC) ·
      L4 graph (edges wikilink+similarity cosine≥0.82, API run/graph/vault, export Obsidian).
      **L5 self-evolving = keputusan user: TIDAK diimplement dulu**
- [x] **OAuth token store per-user** (`modules/connections/` + tabel `oauth_connections` RLS 0005):
      token Drive/Microsoft terenkripsi, capture otomatis di NextAuth (scope drive.readonly /
      Files.Read + offline), refresh otomatis Google & Microsoft
- [x] **Sync worker** (`knowledge/sync.service.ts`, job 'source.sync'): crawl gdrive/onedrive/
      sharepoint → ekstrak teks (txt/md/csv/json/html; PDF/DOCX diskip TERCATAT) → ingest →
      status per source → **auto-trigger memory.run**. API: /api/sources (buat+list),
      /api/sources/:id/sync, /api/connections
- [x] **Memory L5 self-evolving** (di-greenlight user): merge near-duplicate ≥0.93 (edges
      dialihkan, duplikat soft-delete) + prune MOC yatim; hasil di audit log
- [x] Ekstraksi **PDF (pdf-parse) + DOCX (mammoth)** — dynamic import, gagal-parse tak mematikan sync
- [x] **Vault write-back ke Google Drive** user (`_nalar-memory/`, scope drive.file, upsert by-name) — `POST /api/memory/vault`
- [x] Halaman **/auth nyata** (React) ter-wire `signIn()` credentials/Google/Microsoft + signup→auto-login
- [x] **OpenAPI 3.1** satu sumber (`core/openapi.ts`) dilayani publik di `GET /api/openapi`

<!-- Fase 04 dimulai 2026-07-23; detail di atas -->

### ➡️ Fase 04: Frontend — `In Progress (inti selesai)`
- [x] **DS v4 Official Brand** (`src/app/nalar-ds.css`): light-first, Deep Navy+Royal Blue+Emerald+Amber, Manrope/Inter/JetBrains Mono via **next/font**; token diremap, kontras diverifikasi
- [x] Providers (SessionProvider + tema) + layout + **next/font** self-host + metadata/logo resmi
- [x] API client (`_lib/api.ts`: fetch wrapper + useApi hook loading/error/refetch) + UI atoms (Icon outline-2px, Logo PNG resmi, Toast, Skeleton, Empty/Error states)
- [x] Shell `(app)/` — sidebar terang (sesuai product UI resmi) + topbar + tema toggle + logout
- [x] **8 halaman wired ke API NYATA (Rule #7 no dummy)**: Dashboard (usage), Chatbots (CRUD penuh + drawer + Sampah/restore), Knowledge (sumber+koneksi+connect drawer), Memory (run+graph SVG+vault sync), Models&Keys (settings), Conversations/Team/Settings (state jujur + branding save)
- [x] **embed.js produksi**: GET themeConfig → white-label scoped + SSE streaming + sitasi + rate-limit aware
- [x] Verifikasi end-to-end (npm install + DB) — `npm run smoke` terhadap Neon, dan
      sejak 2026-07-27 otomatis di CI terhadap Postgres+pgvector sungguhan
- [x] Landing page publik React · **halaman Branding lengkap** (2026-07-26): `/branding`
      per-chatbot (nama merek, inisial logo, warna utama & sitasi, radius, tema, posisi,
      sapaan, jejak retrieval) + **pratinjau langsung** yang meniru embed.js, plus snippet
      pasang & tautan ke demo.

### ➡️ Fase 05: Audit — `In Progress`
- [x] **Build + typecheck LULUS** (`next build` exit 0, 28 rute) — fix: tipe pdf-parse
- [x] **Smoke test runtime** (no-DB): /api/openapi, /embed.js, /auth → 200
- [x] **2 bug pgvector ditemukan & fixed**: dimensi vektor (kolom→vector(1536)+zero-pad), HNSW ≤2000 (registry di-cap, Qwen-8B dihapus, OpenAI-large@1536)
- [x] Laporan audit → `audit-report.md`
- [x] Verifikasi runtime DB (Postgres+pgvector) — Neon PG17/pgvector 0.8 sejak
      2026-07-24; kini juga otomatis tiap push lewat job `integration` di CI
- [x] **Unit test 8/8 LULUS** (`npm test`, Node test runner): password, crypto AES-GCM, rate-limit, guardrails L1/L2/L4, wikilink parser, padVector
- [x] **Verifikasi runtime DB di Neon nyata (PG 17.10 + pgvector 0.8.0)** — db:push+db:migrate+smoke LULUS: signup→tenant, login, **isolasi RLS terbukti**, ingest→embed→pgvector→retrieve (skor 0.752)
- [x] **2 bug runtime fixed**: (D) RLS bocor krn owner BYPASSRLS → role `nalar_app` NOBYPASSRLS; (E) model-host caching http/local
- [x] **CI GitHub Actions** (2026-07-26): lint + unit test + build (typecheck) tiap push/PR,
      sengaja TANPA database agar PR dari luar tetap terverifikasi; audit dependensi
      sebagai job non-blocking. **Temuan: `npm run lint` tak pernah berfungsi** — tanpa
      config ESLint, `next lint` masuk mode interaktif dan tak memeriksa apa pun. Dipasang
      eslint 8 + eslint-config-next 15 (versi diselaraskan dgn Next 15.5.21); 3 temuan
      pertama diperbaiki: 2 unused var/import + a11y `aria-selected` pada button tanpa
      `role="tab"`.
- [x] 🔴 **BUG PRODUKSI KRITIS ditemukan & diperbaiki** (2026-07-26): **setiap widget embed
      membalas 404**. `resolveChatbotByPublicKey()` mencari tanpa konteks tenant sementara
      `chatbots` FORCE RLS → nol baris, TANPA galat, jadi gagalnya senyap. Fitur andalan
      produk mati di produksi dan tak ada tes yang menyentuh jalur itu. Fix: policy
      `chatbots_public_lookup` via GUC `app.embed_context` (migrasi 0013, pola sama dgn
      `users_auth_lookup`) + unique index `public_key`. Isolasi RLS diverifikasi TETAP utuh.
      Tes regresi ditambahkan ke `npm run smoke`.
- [x] **CI menjalankan uji BER-DATABASE** (2026-07-27): job `integration` menyalakan
      Postgres+pgvector sungguhan, `drizzle-kit push` → migrasi → **migrasi dijalankan
      ULANG** (uji idempotensi) → buat role `nalar_app` NOBYPASSRLS → `smoke` sebagai
      role itu. Alasannya konkret: bug widget embed lolos justru karena unit test tak
      bisa menyentuh kelas bug RLS. Ditambah `SMOKE_STRICT=1` — bagian yang gagal
      dihitung GAGAL, bukan "dilewati", supaya pipeline tak bisa hijau sambil tak
      menguji apa pun. Diverifikasi dua arah: bersih → lulus, embedding dirusak → gagal.
- [x] **4 skrip DB tak bisa dipakai di luar cloud** (2026-07-27): `create-app-role`,
      `apply-migration`, `db-setup`, `diag-rls` mematok `ssl:'require'` sehingga gagal
      terhadap Postgres lokal — termasuk docker-compose on-prem yang didokumentasikan
      README. Kini mendeteksi TLS seperti `migrate.ts`.
- [x] **Security scan dependensi** (2026-07-27, `docs/SECURITY-AUDIT.md`): 13 temuan
      ditelusuri sampai apakah jalurnya benar-benar dieksekusi. **1 diperbaiki**:
      `drizzle-orm` <0.45.2 SQL-injection lewat identifier tak di-escape [HIGH] — satu-
      satunya yang ada di jalur query kita; dinaikkan ke 0.45.2 + drizzle-kit 0.31.10,
      diverifikasi build + 24/24 test + smoke ketat terhadap Neon (skor retrieval tetap
      0.752). Sisanya transitif & jalurnya mati: `protobufjs` [CRITICAL] lewat
      onnxruntime-**web** (kita pakai onnxruntime-node), `sharp` lewat model gambar +
      Next (kita hanya embedding teks, `images.unoptimized`), `postcss` build-time,
      `uuid` cacat di v3/v5/v6 padahal pemakainya v4. `audit fix --force` DITOLAK karena
      akan memundurkan transformers ke v1.4.2 dan memecah jalur embedding yang terbukti.
- [x] **Bug urutan setup DB** (2026-07-27): `db:push` pada database BARU pasti gagal —
      schema.ts memuat kolom `vector(1536)` + index HNSW, sedangkan ekstensi `vector`
      baru dibuat di migrasi 0001 yang jalannya SESUDAH push. Tak pernah kelihatan di
      Neon (ekstensi sudah lama ada); yang kena adalah CI dan pemasangan on-prem baru —
      persis alur yang ditulis README. Fix: `scripts/ensure-extensions.mjs`, dipasang di
      depan `db:push`.
- [x] 🔴 **BUG KRITIS: API key provider tak pernah terbaca** (2026-07-27) — kelas yang
      SAMA dengan bug widget embed 404.  memakai  tanpa konteks
      tenant padahal  FORCE RLS ⇒ nol baris TANPA galat, jatuh ke
      env, lalu chat melaporkan "No API key configured" APA PUN yang sudah disimpan
      pengguna. Jadi fitur simpan API key rusak total sejak awal. Fix: .
      Ditambah yang membuat bug ini tak terlihat: UI tak punya penanda apakah key
      tersimpan (input sengaja dikosongkan setelah simpan) →  kini
      membalas  (nama provider saja) + badge "tersimpan", dan tombol **Test**
      () yang menembak endpoint daftar-model tiap penyedia
      (gratis, tak memakan kuota token) memakai kunci TERSIMPAN. Terverifikasi: key palsu
      ditolak 401 oleh Anthropic sungguhan. Tes regresi ditambahkan ke smoke.
- [x] **LLM on-premise** (2026-07-27, migrasi 0015): celah nyata — embedding sudah punya
      jalur lokal/VPS penuh, tapi LLM hanya 8 provider cloud, sehingga
      DEPLOYMENT_MODE=onprem sebenarnya menyesatkan (jawaban tetap harus menempuh API
      cloud). Tabel PLATFORM  +  + katalog LLM dinamis
      (, model berawalan ). Satu jalur 
      melayani Ollama/vLLM/LM Studio/LocalAI/llama.cpp sekaligus karena semuanya
      berbicara protokol OpenAI. Token OPSIONAL (jaringan tertutup lazim tanpa auth),
      tapi https tetap diwajibkan kecuali loopback.  tak lagi menuntut
      API key untuk provider selfhosted.
      E2E dgn Ollama tiruan: daftar → deteksi 2 model → muncul di katalog → **streamChat
      menjawab TANPA API key cloud** → hapus → model hilang dari katalog.
- [x] **Kredensial OAuth pindah dari ENV ke DATABASE** (2026-07-27, migrasi 0014):
      tabel PLATFORM `oauth_apps` (tanpa tenant_id/RLS — ini kredensial APLIKASI),
      client_secret terenkripsi AES-256-GCM, hanya superadmin, TAK PERNAH ke browser.
      Bagian tersulit: `authOptions` NextAuth dievaluasi sekali saat modul dimuat,
      jadi daftar provider tak bisa dibaca dari DB begitu saja → dipecah jadi
      `authOptions` (dasar, untuk getServerSession) + `buildAuthOptions()` async yang
      dibangun PER-REQUEST di route handler. Cache 30 dtk agar tak memukul DB tiap
      pengecekan sesi. ENV tetap jadi cadangan (on-prem/dev/pemulihan saat DB bermasalah).
      DIVERIFIKASI lewat server produksi lokal: login kredensial nyata BERHASIL
      (sesi membawa role superadmin), /api/auth/csrf & /session 200, dan provider Google
      MUNCUL tanpa restart setelah kredensial disimpan dari proses lain (±10 dtk).
- [x] **Halaman legal publik** (2026-07-27): /privacy + /terms — sebelumnya TIDAK ADA
      sama sekali (dicek: 404 di produksi, nol rujukan di kode), padahal pendaftaran
      sudah terbuka untuk umum DAN verifikasi OAuth Google mensyaratkan URL kebijakan
      privasi publik. Ditulis dari apa yang sistem BENAR-BENAR lakukan (RLS per tenant,
      scrypt, AES-256-GCM, aliran ke penyedia model, soft delete) — dan menyebut apa
      adanya yang BELUM ada: tak ada purge otomatis, tak ada tombol hapus akun mandiri,
      tak ada SLA, pembayaran masih manual. Tertaut di footer landing dan di halaman
      daftar (sebelum orang membuat akun, bukan disembunyikan).
- [x] **Panduan OAuth + fallback** (2026-07-27, `public/docs/oauth-setup.html`): panduan
      Google Drive & Microsoft SharePoint, scope/redirect URI diambil LANGSUNG dari kode.
      Menekankan hal yang paling sering terlewat: **dua** redirect URI per provider
      (login NextAuth vs connect storage). Fallback saat env kosong: `/auth` tak lagi
      menampilkan tombol OAuth yang pasti gagal (dicek via `/api/auth/providers`),
      halaman Knowledge mengganti tautan buntu dengan keterangan + tautan panduan
      (endpoint baru `/api/connections/providers`).
- [x] **Pagination + Analitik per chatbot** (2026-07-27):
      · `core/pagination.ts` — `{rows,total,page,pageSize,pages}`; `pageSize` dibatasi
        DI SERVER (kalau hanya di UI, `?pageSize=100000` bisa menjatuhkan DB). Dipasang
        di `/api/conversations` (sebelumnya dipatok `limit 50` diam-diam sehingga
        percakapan lama tak pernah bisa dilihat) dan `/api/admin/users`. `<Pager>`
        menyebut TOTAL, bukan sekadar maju-mundur.
      · `/analytics` PER CHATBOT: pertanyaan terbanyak, topik/kata kunci (stopword
        ID+EN disaring), **dokumen paling sering jadi sumber jawaban**, pertanyaan per
        hari, dan **jawaban tanpa sitasi** sebagai penunjuk celah KB. Semua dari data
        yang sudah ditulis pipeline (`messages.citations`) — tanpa pelacakan baru.
        Dinyatakan jujur di UI: sistem tak melacak "berkas dibuka".
      Terverifikasi dgn data nyata: pertanyaan berulang terdeteksi, kata kunci bersih
      dari stopword, garansi.pdf ×3 skor 0.87, pagination 2 halaman.
- [x] **Uji beban retrieval** (2026-07-27, `docs/PERFORMANCE.md`, `npm run bench`):
      query IDENTIK dengan `retrieval.service` di bawah RLS, terhadap Neon produksi.
      Terukur: 750→1,2 ms · 1.500→2,2 ms · 3.000→4,5 ms (DB p50; `Index Scan` HNSW
      terkonfirmasi). **Temuan: latensi tumbuh LINEAR, bukan logaritmik** — index HNSW
      hanya pada `embedding` sedangkan query memfilter `chatbot_id`, jadi Postgres
      post-filter. Yang menentukan bukan jumlah vektor, melainkan seberapa kecil porsi
      satu chatbot di tabel. Ekstrapolasi: ±45 ms @30rb chunk (batas plan 512 MB),
      ±750 ms @500rb — perlu partisi per chatbot bila mendekati 100rb.
      **Ukuran nyata 16,6 KB/chunk**; ¾ ruang vektor adalah NOL karena MiniLM 384 dim
      di-pad ke 1536 → kolom 384-dim akan menaikkan kapasitas ±3,6× (30rb → 110rb chunk)
      tanpa ganti paket. Kapasitas efektif sekarang: ±20 MB teks bersih SELURUH tenant.
      Wall-clock ±1.700 ms/query murni jarak Indonesia→us-east-1 (4 round-trip karena
      withTenant membuka transaksi) — tak berlaku di produksi (Vercel & Neon se-region).
      Skrip membersihkan datanya sendiri + VACUUM FULL (diverifikasi 25 MB → 576 kB).

### ✅ Fase 06: Deployment — `LIVE di rag.sainskerta.net`
- [x] Vercel + Neon Postgres (PG17 + pgvector 0.8), tanpa Docker
- [x] Penyesuaian serverless (db pool, lazy embeddings, vercel.json) + `docs/DEPLOY-VERCEL.md`
- [x] DB dimigrasi ke Neon (0001–0006); role `nalar_app` NOBYPASSRLS utk RLS
- [x] Push GitHub `pendtiumpraz/RAG` + deploy production **rag.sainskerta.net** (landing light + auth light + PNG logo LIVE, diverifikasi via HTTP)

### Fitur pasca-deploy (2026-07-24/25)
- [x] **Multi-akun** Google/Microsoft (connect banyak akun) + **scan seluruh Drive rekursif** (scope all/folder)
- [x] Landing page publik `/` (bukan redirect ke login) + `/auth` di-relight ke brand resmi
- [x] Halaman **Chat + Citations** nyata + demo page per chatbot `/demo/[publicKey]`
- [x] Halaman **Conversations** nyata (list + transcript + sitasi)
- [x] **Google-native export** (Docs/Sheets/Slides → teks) masuk pipeline KB
- [x] **Incremental / delta sync** (2026-07-25): `documents.external_id` + `external_version`
      (migrasi 0007) + `planDelta()` murni. Satu run = listing metadata (murah) →
      diff manifest DB → hanya file **baru/berubah** yang diunduh & di-embed; file
      hilang di upstream chunk-nya di-soft-delete; format tak didukung disaring
      **sebelum** download (`isExtractable`). Pengaman: listing terpotong ⇒ penghapusan
      dilewati; chunk warisan pra-delta dibuang sekali; `?full=1` utk ingest ulang penuh.
      UI Knowledge menampilkan hasil (+baru ~ubah −hapus · tetap/dilewati/antre).
      **Menutup bug**: sebelumnya tiap re-sync menduplikasi seluruh KB + bayar embedding ulang.
      **LIVE di production** 2026-07-26 (commit `d8df7a0` → rag.sainskerta.net; migrasi 0007
      diterapkan ke Neon SEBELUM push, jadi tak ada jendela kode-baru vs skema-lama).
- [x] **Model host di Vercel Blob** (2026-07-26, D6): bobot embedding diunggah ke
      blob publik 10 GB dengan tata letak `models/<hfRepo>/…`; sisi baca hanya
      mengarahkan `env.remoteHost`/`remotePathTemplate` transformers.js — tanpa kode
      unduh sendiri. `npm run models:push` (CLI superadmin, multipart >50 MB, lewati
      berkas yang sudah ada) + `npm run models:verify [-- --live --all]`.
      **3 model terunggah & TERBUKTI dimuat dari blob** (cache kosong):
      MiniLM 22,8 MB→384 dim (22 dtk) · nomic 130,9 MB→768 dim (109 dtk) ·
      bge-m3 543,3 MB→1024 dim (377 dtk) · total 718,2 MB (7% dari 10 GB).
      **2 koreksi fakta registry**: repo `Xenova/nomic-…` kini 401 → `nomic-ai/…`;
      BGE-M3 "2,2 GB" ternyata `model.onnx` 0,6 MB + `model.onnx_data` 2,16 GB (bobot
      EKSTERNAL) yang **tak bisa dimuat** transformers.js v2 → dipakai varian
      terkuantisasi 543 MB yang mandiri. Varian 2 GB butuh upgrade ke
      `@huggingface/transformers` v3 — **keputusan user, belum dikerjakan**.
- [x] **Server embedding sendiri di VPS** (2026-07-26, D7): jenis embedder baru
      `selfhosted` (`embeddings/selfhosted.ts`) memanggil `POST /v1/embeddings`
      **kompatibel OpenAI**, jadi server boleh ditukar ke HF TEI/vLLM. Service-nya
      `services/embedding-server/` — paket TERPISAH dengan transformers **v3** +
      `use_external_data_format`, sehingga **BGE-M3 presisi penuh 2,16 GB akhirnya
      bisa dipakai** (app utama tetap v2 agar bundle Next.js ramping).
      Pengaman: URL non-https ditolak (kecuali loopback) & wajib token — yang
      melintas adalah isi dokumen tenant. Dimensi balasan diperiksa agar KB tak
      tercemar vektor tak sebanding.
      Terverifikasi: server sehat, token salah/absen → 401, dimensi meleset ditolak,
      19/19 unit test, build lulus. **BGE-M3 fp32 2.266.820.608 B TERBUKTI JALAN**:
      3×1024 dim, norma 1,0000, similarity garansi↔tanya-garansi 0,8918 vs
      garansi↔pengiriman 0,6081; permintaan 0,87 dtk (vs cold-start 377 dtk di
      serverless). Jalur app penuh: 1024 dim → zero-pad 1536, 476 ms.
- [x] **Kelola server embedding VPS dari dashboard** (2026-07-26, D8): tabel PLATFORM
      `embedding_servers` (migrasi 0008, tanpa tenant_id/RLS — infrastruktur bersama,
      dijaga `requireRole('superadmin')`), CRUD + `/trashed` + `/restore` (Rule #3),
      tombol **Test koneksi** memanggil `/v1/models` ber-auth di server → menguji
      jaringan+token sekaligus lalu **mendeteksi model + dimensinya**. Katalog model
      jadi DINAMIS (`embeddings/catalog.ts`): registry statis + model VPS berawalan
      `vps:` — **tambah model di VPS tak perlu deploy ulang**. Token terenkripsi
      AES-256-GCM, tak pernah dikirim ke browser (`hasToken` saja). Model >1536 dim
      ditolak saat deteksi (kolom pgvector).
      E2E LULUS: daftar→deteksi(384d)→muncul di katalog→embed via `vps:` (norma
      1.0000)→token tak bocor→server dihapus, model hilang dari katalog.
      20/20 unit test, build lulus (33 rute), migrasi diterapkan ke Neon.
      Panduan agen VPS: `services/embedding-server/SETUP-VPS.md`.
- [x] **Akun demo superadmin** (`npm run demo:account`, `--reset` utk password baru):
      signup publik selalu memberi peran `admin`, jadi promosi ke `superadmin`
      dilakukan skrip ini oleh pemegang akses DB. **Bug ditemukan & diperbaiki saat
      verifikasi**: `users` ber-FORCE RLS sehingga `UPDATE` di luar `withTenant()`
      tak mengenai baris apa pun DAN TIDAK error — skrip tampak sukses padahal peran
      tetap `admin`. Sekarang promosi lewat `withTenant()` + `.returning()`, dan peran
      yang ditampilkan dibaca ULANG dari DB.
- [x] **Pendaftaran terbuka + verifikasi superadmin** (req #10, D9, 2026-07-26):
      `users.status` + `approved_at`/`approved_by` (migrasi 0009; akun lama
      di-backfill `active` agar tak ikut terkunci). Gerbang berlaku di SEMUA jalur
      **termasuk OAuth** (callback `signIn`) — kalau tidak, orang tinggal lewat Google.
      Login pending ditolak PERSIS seperti password salah (anti penebakan email);
      alasannya hanya lewat `POST /api/auth/login-status` yang baru menjawab setelah
      password benar. Antrean lintas-tenant lewat policy `users_platform_admin_*`
      (GUC `app.admin_context`, pola sama dgn `users_auth_lookup`). Panel verifikasi
      di halaman Team (superadmin). Signup **tak lagi auto-login** — UI menampilkan
      "menunggu verifikasi". Pengaman: superadmin aktif terakhir tak bisa mengunci
      dirinya sendiri.
      E2E LULUS (di smoke): daftar=pending → login ditahan → muncul di antrean →
      diverifikasi → bisa masuk → ditolak → tertahan lagi.
- [x] **Auth 500→401 + matcher middleware dilengkapi** (2026-07-26): ketahuan saat
      verifikasi PRODUKSI — `/api/admin/*` tanpa sesi membalas 500 karena tak ada di
      matcher middleware dan `requireRole()` melempar tanpa ditangkap. Menelusurinya
      ketemu gap lebih lama: matcher cuma memuat `/settings` & `/dashboard` dari grup
      `(app)`, sehingga chat/chatbots/knowledge/memory/models/conversations/team bisa
      dibuka tanpa sesi (data tak bocor — API tetap dijaga — tapi cangkang aplikasi
      tampil alih-alih diarahkan ke login). Fix: matcher dilengkapi + `superadminRoute()`
      membungkus 7 rute admin (401/422). Diverifikasi di produksi: semua rute
      terlindungi → 307, `/`, `/auth`, `/embed.js`, `/api/openapi` tetap 200, dan
      **`/api/chat/<publicKey>` tetap publik (404, bukan 307)** — widget embed pelanggan
      tidak ikut terkunci.
- [x] **Migrasi jadi idempoten** (2026-07-26): `db:migrate` menerapkan ULANG semua
      berkas, tapi 0001–0005 punya `CREATE POLICY` tanpa pengaman sehingga jalan
      kedua PASTI gagal ("policy already exists") — padahal README menyuruhnya sebagai
      langkah setup normal. Semua dibungkus cek `pg_policies`. Diverifikasi: 0001–0009
      lulus dua kali berturut-turut.
- [x] **Team invite** (2026-07-26): tabel `invitations` (migrasi 0010, RLS + policy
      `invitations_accept_lookup` utk penerimaan sebelum tenant diketahui — pola sama
      dgn `users_auth_lookup`). Token 256-bit, disimpan sbg **SHA-256** (bocornya tabel
      tak memberi akses), ditampilkan SEKALI, sekali pakai, kedaluwarsa 7 hari.
      Yang diundang **masuk ke tenant pengundang** (bukan tenant baru) dan **langsung
      aktif** — undangan itu sendiri yang jadi verifikasinya, jadi tak menunggu
      superadmin. `maxMembers` per plan ditambahkan (free 2 / pro 15 / enterprise ∞);
      kursi terpakai = anggota + undangan yang masih berlaku, mencegah mengundang
      banyak orang sekaligus di plan free. Halaman /invite/[token] publik + UI Team
      (daftar anggota nyata, undangan, drawer kanan Rule #5, cabut/trashed/restore).
      E2E LULUS: undang → pratinjau tanpa sesi → terima → masuk tenant pengundang →
      langsung bisa login → token ditolak saat dipakai ulang → kuota kursi ditegakkan
      dan kembali saat undangan dicabut.
- [x] **Billing** (2026-07-26): `tenants.plan_expires_at` (migrasi 0011) +
      `effectivePlan()` — plan berbayar yang lewat masa berlaku TURUN ke free, dihitung
      di service sehingga benar-benar menegakkan kuota (bukan label). `maxMembers` per
      plan. Halaman `/billing`: meter pemakaian vs kuota (pesan/chatbot/kursi), katalog
      paket, peringatan saat kedaluwarsa; panel superadmin menyetel plan + tanggal
      berakhir semua tenant (satu query agregat, bukan N+1). **SENGAJA belum**: tabel
      invoice/langganan — bentuknya ditentukan penyedia pembayaran yang dipilih user.
      Terverifikasi: free(2 kursi)→pro(15)→enterprise(∞); kedaluwarsa turun ke free;
      plan ngawur & tanggal lampau ditolak.
- [x] **Observability** (2026-07-26): `GET /api/health` publik & minim (503 bila DB
      tak terjangkau — 200+"ok:false" akan terbaca sehat oleh monitor). Log terstruktur
      JSON ke stdout (`core/observability.ts`) dengan **redaksi otomatis** kunci
      token/password/apikey dan pemotongan teks panjang — log dibaca lebih banyak orang
      daripada DB. `recordError()` menulis ke stdout + audit_logs; job yang gagal
      permanen (sync Drive, memory agent) tak lagi hilang di stdout. Halaman
      `/observability` (superadmin): kesehatan, aksi per jenis, galat terakhir,
      pemakaian, tenant tersibuk — semua dari data NYATA (audit_logs + usage_counters,
      lintas tenant via policy `audit_logs_platform_admin_read`, migrasi 0012).
      Tanpa vendor pihak ketiga: stdout sudah ditangkap Vercel/journalctl.
      Terverifikasi dgn data nyata + 2 unit test yang mengunci redaksi rahasia.

### ⬜ Fase 06: Deployment — `Belum`
### ⬜ Fase 07: Improvement — `Belum`

---

## Ringkasan Fase 03 (tutup 2026-07-23)

**9 commit**: modular monolith (6 module + repo/service/events) · schema compliant
(No-FK, soft-delete, RLS, 5 migrasi) · endpoint trashed/restore · theme_config
white-label served · NextAuth + signup→tenant + OAuth provisioning · rate-limit
2 lapis + kuota + metering · **guardrails 5 lapis** · **Memory Agent L1–L5** ·
OAuth token store + sync worker gdrive/onedrive/sharepoint + PDF/DOCX ·
vault write-back Drive · halaman /auth nyata · OpenAPI 3.1.
Catatan: belum diuji end-to-end terhadap DB nyata (npm install + verifikasi = bagian Fase 05 Audit).

## Issue & Blocker

| # | Issue | Severity | Status |
|---|-------|----------|--------|
| 1 | Schema Drizzle pakai FK `.references()` — langgar Rule #2 (No FK) | high | ✅ fixed (schema.ts) |
| 2 | Tabel belum punya `deleted_at` + endpoint restore | high | ✅ selesai — /trashed + /restore ada di chatbots, documents, invitations, embedding-servers |
| 3 | Struktur `src/lib/*` belum Modular Monolith — Rule #1 | medium | ✅ selesai (Fase 03) — semua di `src/modules/*` |
| 4 | Arah UI dashboard vs standar Sainskerta | high | ✅ resolved (D3=Hybrid) |
| 5 | DB credentials belum diberikan user (Rule #8) | medium | open |
| 6 | White-label (theme_config per chatbot) | high | ✅ selesai 2026-07-26 — halaman /branding + pratinjau langsung; tipe ThemeConfig diselaraskan dgn embed.js |
| 7 | Server-to-server API key per client (key tak pernah ke browser) | high | ✅ arsitektur ada (providerCredentials + apiKeyResolver); didokumentasi di docs/idea.md |

---

## Catatan

- **Scaffold engine dibangun SEBELUM mengadopsi Loop Engineering.** Sekarang proyek dis/selaraskan dengan RULES-OF-THE-GAME. File engine (`src/lib/*`, `docs/*`) tetap dipertahankan sebagai referensi, tapi backend akan direstrukturisasi agar compliant.
- Brand identity **Nalar** sudah jadi (`docs/brand-identity.html`, `docs/idea.html`).
- Model catalog di `src/lib/models/registry.ts` (per 2026-07-23) lebih baru dari `loop/standards/AI-PROVIDERS.md` (Juni 2026) — pakai yang lebih baru.

---

## Log Perubahan

| Tanggal | Fase | Perubahan |
|---------|------|-----------|
| 2026-07-23 | 00→01 | Adopsi Sainskerta Loop Workflow; instantiate file-as-interface; identifikasi 5 gap kepatuhan; angkat 3 keputusan arsitektur ke user |
| 2026-07-23 | 01 | D1/D2/D3 di-approve user; refactor `schema.ts` compliant (No-FK + soft-delete + index) |
| 2026-07-23 | 02 | Wireframe low-fi dashboard dibuat (7 screen: dashboard, chatbots CRUD, right-drawer, KB, conversations, models&keys, sampah+mobile); menunggu approval |
| 2026-07-23 | 02 | Wireframe di-approve; mockup high-fi interaktif dibuat (7 halaman, hybrid: struktur Sainskerta + warna Nalar, dark-mode, drawer, toast); menunggu approval mockup |
| 2026-07-23 | 02 | Revisi elegan dashboard (dark-first premium, sparkline, chart glow); + mockup landing, + embed widget dengan white-label customizer live; requirement white-label & server-to-server key dicatat; docs/idea.md ditulis |
| 2026-07-23 | 02 | Mockup auth (login/register, split brand + retrieval-field) + halaman Branding white-label (live preview navbar/sidebar/widget). Semua mockup Fase 02 lengkap; menunggu approval final |
| 2026-07-23 | 02 | UI/UX assessment (~6.4/10). Arah desain baru **Editorial Ledger** (D4) untuk anti AI-slop + target 10. Design system `nalar-ds.css` + referensi `design-system.html` dibuat. TODO: re-skin semua surface ke DS ini |
| 2026-07-23 | 02 | Requirement baru: **Obsidian Memory Agent** (Drive/OneDrive/SharePoint → vault markdown [[wikilink]] + graph-RAG) dicatat di user_requirement + idea.md. **Full gap assessment 14 dimensi** ditulis di `docs/assessment.md` (rata-rata ~5.3/10). `git init` + commit pertama `11f6bac` (Rule #15 ✅) |
| 2026-07-23 | 02→03 | Fase 02 APPROVED → Fase 03 backend inti selesai (modular monolith, soft-delete endpoints, theme_config, memory). **D4v2 pivot: "Retrieval Instrument"** (user: editorial = "museum") — DS v3 + SEMUA surface di-re-skin: trace retrieval + skor similarity + streaming sebagai bahasa visual. Commit: 4c55dd6 + berikutnya |
| 2026-07-26 | pasca-deploy | **Model host Vercel Blob** (D6): `blob-host.ts` + sumber `blob` di `model-host.ts` + remoteHost transformers, skrip `models:push` (multipart) & `models:verify`, `docs/MODEL-HOSTING.md`. 16/16 unit test, build lulus, embedding nyata dari blob LULUS. Registry dikoreksi (repo nomic 401→nomic-ai; bge-m3 pakai varian mandiri 543 MB, bukan varian bobot-eksternal 2,16 GB yang tak bisa dimuat) |
| 2026-07-25 | pasca-deploy | **Delta sync**: kolom `external_id`/`external_version` + migrasi 0007 (diterapkan ke Neon), `planDelta()` + 4 unit test baru (13/13 lulus), build lulus, **smoke e2e di Neon nyata LULUS** (manifest→plan→remove→buang warisan, di bawah RLS). Re-sync tak lagi menduplikasi KB; UI Knowledge menampilkan ringkasan perubahan + tombol "Penuh". `CLAUDE.md` dibuat (panduan repo utk Claude Code) |
| 2026-07-23 | 02 | **RE-SKIN SEMUA surface ke Editorial Ledger** (`nalar-ds.css`): dashboard (+ halaman Memory graph baru, chart ber-axis/tooltip, footnote-sitasi di Conversations), landing (masthead + proof-card streaming), embed-demo (widget paper + footnote + preset ink editorial), auth (split terbitan), branding (preview ink). Gap dim-7 surfaces & data-viz tertutup |
