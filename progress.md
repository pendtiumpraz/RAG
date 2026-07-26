# Progress — Nalar (RAG Engine)

> **Source of truth progress project. Update setiap kali ada perubahan status fase.**
> Mengikuti Sainskerta Loop Workflow (`loop/`).

---

## Ringkasan

| Item | Status |
|------|--------|
| **Project** | `Nalar — Multi-tenant RAG Engine` |
| **Fase Aktif** | `04-FRONTEND` (Fase 03 SELESAI ✅ 2026-07-23) |
| **Status Loop** | `active` |
| **Dimulai** | `2026-07-23` |
| **Target Selesai** | `TBD (menunggu keputusan arsitektur)` |
| **Progress** | `~20% (scaffold engine ada, pre-loop; butuh refactor kepatuhan)` |

---

## Fase

### ✅ Fase 00: Prerequisites — `Sebagian`
- [x] Requirement dasar dari user (terkumpul dari percakapan)
- [x] Framework di-scaffold awal (Next.js) — **perlu approval ulang via Loop**
- [ ] Database credentials dari user (Rule #8) — **belum**
- [ ] Environment setup final
- [ ] Git initialized (git baru dipasang di sesi ini)

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
- [ ] Verifikasi end-to-end (npm install + DB) → Fase 05 Audit
- [ ] Landing page publik React (mockup ada) · halaman Branding lengkap

### ➡️ Fase 05: Audit — `In Progress`
- [x] **Build + typecheck LULUS** (`next build` exit 0, 28 rute) — fix: tipe pdf-parse
- [x] **Smoke test runtime** (no-DB): /api/openapi, /embed.js, /auth → 200
- [x] **2 bug pgvector ditemukan & fixed**: dimensi vektor (kolom→vector(1536)+zero-pad), HNSW ≤2000 (registry di-cap, Qwen-8B dihapus, OpenAI-large@1536)
- [x] Laporan audit → `audit-report.md`
- [ ] Verifikasi runtime DB (Postgres+pgvector) — **butuh user (Docker/cloud)**
- [x] **Unit test 8/8 LULUS** (`npm test`, Node test runner): password, crypto AES-GCM, rate-limit, guardrails L1/L2/L4, wikilink parser, padVector
- [x] **Verifikasi runtime DB di Neon nyata (PG 17.10 + pgvector 0.8.0)** — db:push+db:migrate+smoke LULUS: signup→tenant, login, **isolasi RLS terbukti**, ingest→embed→pgvector→retrieve (skor 0.752)
- [x] **2 bug runtime fixed**: (D) RLS bocor krn owner BYPASSRLS → role `nalar_app` NOBYPASSRLS; (E) model-host caching http/local
- [ ] Integration/e2e formal (CI); security scan (deps); performance/load

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
- [ ] Billing, observability

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
| 2 | Tabel belum punya `deleted_at` + endpoint restore | high | 🔄 schema fixed; endpoint /trashed+/restore pending |
| 3 | Struktur `src/lib/*` belum Modular Monolith (`Modules/`) — Rule #1 | medium | open (D1 approved, restrukturisasi berikutnya) |
| 4 | Arah UI dashboard vs standar Sainskerta | high | ✅ resolved (D3=Hybrid) |
| 5 | DB credentials belum diberikan user (Rule #8) | medium | open |
| 6 | White-label (theme_config per tenant/chatbot: logo, warna, radius, font, focus, dll) | high | 🔄 mockup demo jadi; implementasi backend pending |
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
