# Progress — Nalar (RAG Engine)

> **Source of truth progress project. Update setiap kali ada perubahan status fase.**
> Mengikuti Sainskerta Loop Workflow (`loop/`).

---

## Ringkasan

| Item | Status |
|------|--------|
| **Project** | `Nalar — Multi-tenant RAG Engine` |
| **Fase Aktif** | `03-BACKEND` (mockup approved; re-skin D4v2 selesai) |
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

### ➡️ Fase 03: Backend — `In Progress (inti selesai)`
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
- [ ] Worker sync Drive/OneDrive/SharePoint (crawl storage → ingest → trigger memory.run)
- [ ] API documentation (OpenAPI)

### ⬜ Fase 04: Frontend — `Belum`
- [ ] Sidebar 1-color icon
- [ ] CRUD pages (list + right drawer modal)
- [ ] Integrasi API (no dummy data)
- [ ] Loading/error/empty states

### ⬜ Fase 05: Audit — `Belum`
### ⬜ Fase 06: Deployment — `Belum`
### ⬜ Fase 07: Improvement — `Belum`

---

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
| 2026-07-23 | 02 | **RE-SKIN SEMUA surface ke Editorial Ledger** (`nalar-ds.css`): dashboard (+ halaman Memory graph baru, chart ber-axis/tooltip, footnote-sitasi di Conversations), landing (masthead + proof-card streaming), embed-demo (widget paper + footnote + preset ink editorial), auth (split terbitan), branding (preview ink). Gap dim-7 surfaces & data-viz tertutup |
