# Nalar — Full Gap Assessment (target: 10/10 semua dimensi)

> Dinilai jujur & kritis per 2026-07-23. Skor = kondisi SEKARANG di repo,
> bukan rencana. "Gap ke 10" = daftar konkret yang harus dikerjakan.
> Skala: 1–10. Status: 🔴 <5 · 🟡 5–7 · 🟢 8–9 · ⭐ 10.

---

## Ringkasan skor

| # | Dimensi | Skor | Status |
|---|---------|:----:|:------:|
| 1 | Engine RAG (pipeline inti) | 6.5 | 🟡 |
| 2 | Database & isolasi tenant | 7.5 | 🟡 |
| 3 | Keamanan | 6.5 ⬆ (was 5.0) | 🟡 |
| 4 | Auth & SaaS multi-tenancy | 6.5 ⬆ (was 3.0) | 🟡 |
| 5 | Agentic (memory agent, workers, orkestrasi) | 2.5 | 🔴 |
| 6 | UI/UX — design system | 8.5 | 🟢 |
| 7 | UI/UX — surfaces (halaman nyata) | 5.5 | 🟡 |
| 8 | White-label | 6.0 | 🟡 |
| 9 | Embed & widget | 6.5 | 🟡 |
| 10 | Data source connectors | 5.5 | 🟡 |
| 11 | Observability & reliability | 2.0 | 🔴 |
| 12 | Testing & quality gates | 1.5 | 🔴 |
| 13 | DevOps & deployment | 6.0 | 🟡 |
| 14 | Dokumentasi & proses (Loop) | 8.5 | 🟢 |

**Rata-rata tertimbang: ~5.3/10.** Fondasi & desain kuat; eksekusi produksi
(auth, agentic, testing, observability) adalah gap terbesar.

---

## 1 · Engine RAG — 6.5/10
**Ada:** chunking + ingest, pgvector retrieval per-chatbot, multi-provider
streaming (`llm/index.ts`), history + sitasi, registry model 2026-07-23,
embedding lokal (transformers.js) + API, model host dari Drive/SharePoint.

**Gap ke 10:**
- [ ] Belum pernah **dijalankan/diuji end-to-end** (npm install pun belum).
- [ ] Chunking naif — perlu semantic/structure-aware (heading, tabel) + overlap adaptif.
- [ ] Tanpa **re-ranking** (mis. Cohere Rerank / cross-encoder) — kualitas retrieval mentok.
- [ ] Tanpa **hybrid search** (BM25/full-text + vektor) — pgvector saja lemah utk keyword eksak.
- [ ] Tanpa **graph-RAG** (menunggu Memory Agent §5).
- [ ] Ekstraksi dokumen (PDF/DOCX/HTML) belum ada — baru terima teks mentah.
- [ ] Vector kolom fixed 4096d utk semua model → boros; perlu partial index / tabel per dimensi.
- [ ] Tanpa eval harness (RAGAS-style: faithfulness, answer relevancy) — tak bisa ukur kualitas.

## 2 · Database & isolasi — 7.5/10
**Ada:** Postgres+pgvector, RLS `tenant_id` + `withTenant()`, schema Sainskerta-compliant
(No-FK, soft-delete, timestamps, snake_case, index), migrasi RLS.

**Gap ke 10:**
- [ ] Migrasi belum pernah dijalankan ke DB nyata; belum diverifikasi RLS-nya benar.
- [ ] Endpoint `/trashed` + `/restore` belum dibuat (soft-delete baru di schema).
- [ ] Integritas referensial di Service layer belum ditulis (konsekuensi No-FK).
- [ ] `theme_config JSONB` (white-label) belum ada di schema.
- [ ] Tabel memory/graph (notes, edges) belum ada.
- [ ] Backup routine + restore test (DATABASE-RULES) belum ada.
- [ ] Connection pooling utk serverless (pgbouncer) belum dikonfigurasi.

## 3 · Keamanan — 5.0/10
**Ada:** AES-256-GCM utk API key, RLS, allowed-origins per chatbot, server-to-server
key (key tak pernah ke browser), publicKey pattern.

**Update 2026-07-23:** ✅ rate limit 2 lapis (per-chatbot plan-based + per-IP) di
endpoint embed & signup; ✅ kuota bulanan per plan + metering token (`usage_counters`);
✅ maxChatbots per plan; ✅ batas panjang pesan.

**Gap ke 10:**
- [ ] Limiter masih in-memory (single-instance) — tukar ke Redis utk SaaS multi-instance.
- [ ] Tanpa CSRF protection di API dashboard; tanpa audit log.
- [ ] Prompt injection: konteks RAG belum di-sandbox (perlu system prompt hardening + output filtering).
- [ ] Key rotation + secret management (Vault/KMS utk `CREDENTIALS_ENCRYPTION_KEY`).
- [ ] Security review (Fase 05 Loop) belum dijalankan; tanpa dependency scanning.
- [ ] Webhook signing utk integrasi keluar.

## 4 · Auth & SaaS multi-tenancy — 6.5/10 ⬆ (2026-07-23)
**Ada:** NextAuth nyata (`src/modules/auth/`) — Credentials scrypt + Google + Microsoft;
JWT session {userId, tenantId, role}; **signup→tenant** transaksi RLS-aware;
OAuth email baru = tenant baru otomatis; policy `users_auth_lookup` (0002) utk
lookup login lintas-tenant yang tetap aman; `requireRole()` guard; middleware
proteksi route (embed/chat publik); mode on-prem via env.

**Gap ke 10:**
- [ ] Belum diuji end-to-end (npm install + DB nyata).
- [ ] Halaman /auth nyata (mockup sudah ada) + wiring signIn() client.
- [ ] `requireRole` dipasang eksplisit di route admin (baru tersedia).
- [ ] Email verification + password reset.
- [ ] Billing (plan, kuota, upgrade); Team invite backend.

## 5 · Agentic — 2.5/10
**Ada:** konsep + requirement Memory Agent (baru dicatat), konektor storage dasar.

**Gap ke 10:**
- [ ] **Obsidian Memory Agent** end-to-end: crawl → ekstrak → entity/topic mapping
      (LLM) → note markdown + [[wikilink]] → graph → sync-back vault ke Drive.
- [ ] **Sync workers** Drive/SharePoint/OneDrive (scheduled + webhook change detection).
- [ ] Job queue (BullMQ/pg-boss) — sekarang tak ada infrastruktur background job.
- [ ] Agentic retrieval: query decomposition, multi-hop, self-check jawaban.
- [ ] Halaman Memory (graph view) di dashboard.
- [ ] OneDrive connector (variasi kecil dari Graph API SharePoint).
- [ ] Agent guardrails: batas biaya per run, retry, dead-letter.

## 6 · UI/UX — design system — 8.5/10
**Ada:** `nalar-ds.css` v2 Editorial Ledger — token 3-lapis, type/spacing/radius/motion
scale, kontras AA/AAA tercatat, focus-visible, reduced-motion, semua state
(loading/empty/error/disabled/skeleton), anti-slop, dua tema; referensi `design-system.html`.

**Gap ke 10:**
- [ ] File font `InterVariable.woff2` belum di-drop (tipografi belum terkunci lintas OS).
- [ ] Data-viz spec (axis/tooltip/gridline) belum ada di DS.
- [ ] Komponen belum lengkap: dropdown-menu, combobox, dialog, tooltip, pagination, breadcrumb.
- [ ] Kontras diverifikasi manual — perlu dicek otomatis (axe/pa11y) di CI.

## 7 · UI/UX — surfaces — 5.5/10
**Ada:** 6 mockup (dashboard 7 halaman, landing, embed+customizer, auth, branding, wireframe).

**Gap ke 10:**
- [ ] **Semua masih gaya lama (dark-indigo-glow)** — wajib re-skin ke Editorial Ledger.
- [ ] Sitasi-footnote signature belum dipakai di dashboard/conversations.
- [ ] Halaman Memory (graph) belum ada.
- [ ] Chart masih dekoratif (tanpa axis/tooltip).
- [ ] Belum jadi app React nyata — masih HTML mockup (implementasi = Fase 04).
- [ ] Interaksi keyboard (navigasi tabel, shortcut) belum dirancang.

## 8 · White-label — 6.0/10
**Ada:** layer token `--wl-*` di DS, demo customizer live (embed-demo, branding-mockup),
config JSON shape.

**Gap ke 10:**
- [ ] `theme_config` belum tersimpan di DB / diserve API.
- [ ] `embed.js` belum membaca theme dari server.
- [ ] Dashboard & landing belum digerakkan penuh oleh `--wl-*` (baru widget demo).
- [ ] Upload logo asli (SVG/PNG) belum ada (baru inisial).
- [ ] Custom domain per tenant (CNAME) belum dirancang.
- [ ] Font per-tenant belum bisa diganti runtime.

## 9 · Embed & widget — 6.5/10
**Ada:** `public/embed.js` (SSE streaming, visitor id, origin check), endpoint publik,
mockup white-label + mobile responsive.

**Gap ke 10:**
- [ ] `embed.js` produksi belum sinkron dengan sistem white-label & Editorial Ledger.
- [ ] Shadow-DOM isolation (sekarang CSS bisa bentrok dengan situs host).
- [ ] Persist conversationId antar reload; riwayat sisi widget.
- [ ] File upload / suara di widget (roadmap).
- [ ] Bundle size budget + versioning (embed.js?v=) + CDN cache strategy.
- [ ] A11y widget: focus trap, ARIA live region utk streaming, keyboard.

## 10 · Data source connectors — 5.5/10
**Ada:** gdrive.ts (superadmin + per-user), sharepoint.ts (Graph), model-host caching.

**Gap ke 10:**
- [ ] OneDrive path (`/me/drive`) belum dibungkus sebagai connector resmi.
- [ ] OAuth flow per-user end-to-end (token simpan-refresh) belum diimplement.
- [ ] Ekstraksi konten file (PDF/DOCX/PPTX/HTML→teks) belum ada.
- [ ] Incremental sync (delta API / changes.watch) belum ada — baru full-list.
- [ ] Upload manual & URL/sitemap crawler belum dibuat.
- [ ] Error surfacing ke UI (status per file).

## 11 · Observability & reliability — 2.0/10
**Ada:** hampir tidak ada (console saja).

**Gap ke 10:**
- [ ] Structured logging (pino) + request id + tenant id di setiap log.
- [ ] Error tracking (Sentry/self-host GlitchTip utk on-prem).
- [ ] Metrics: latency retrieval, token usage per tenant, cost meter.
- [ ] Health checks + readiness probe; graceful shutdown.
- [ ] Tracing (OTel) utk pipeline RAG.
- [ ] Alerting kuota/error-rate.

## 12 · Testing & quality gates — 1.5/10
**Ada:** belum ada test sama sekali.

**Gap ke 10:**
- [ ] Unit test service layer (chunking, crypto, registry, tenant guard).
- [ ] Integration test API + RLS (bukti isolasi tenant dengan 2 tenant nyata).
- [ ] E2E (Playwright): chat flow, embed widget, CRUD + soft-delete/restore.
- [ ] RAG eval set (golden Q&A per KB) + threshold di CI.
- [ ] Lint/typecheck/a11y (axe) di CI; pre-commit hooks.
- [ ] Load test endpoint embed (k6) — proteksi biaya.

## 13 · DevOps & deployment — 6.0/10
**Ada:** Dockerfile multi-stage, docker-compose (pgvector + app + model cache volume),
`.env.example` rapi, mode saas/onprem.

**Gap ke 10:**
- [ ] CI/CD pipeline (GitHub Actions: build, test, scan, release image).
- [ ] Migrasi otomatis saat deploy (drizzle migrate step teruji).
- [ ] TLS/ingress guide on-prem (Caddy/Traefik) + Nginx conf.
- [ ] Seed script development (Rule seeder) belum ada.
- [ ] Versioning & changelog rilis; image publish (GHCR).
- [ ] Backup cron container utk on-prem.

## 14 · Dokumentasi & proses (Loop) — 8.5/10
**Ada:** Loop file-as-interface lengkap & hidup (progress, user_requirement,
architecture-decisions D1–D4, loop.md), docs/idea.md + idea.html + brand-identity,
README, assessment ini.

**Gap ke 10:**
- [ ] Git belum `init` + belum ada commit history (Rule #15 — git sudah terinstal!).
- [ ] API documentation (OpenAPI) belum dibuat (output wajib Fase 03).
- [ ] Runbook operasional (incident, restore, rotate key).
- [ ] `docs/idea.md` perlu terus sinkron dgn requirement baru (memory agent ✅).

---

## Urutan serangan yang kusarankan (biar semua naik ke 10)

1. **Re-skin semua surface → Editorial Ledger** (dim 7, 8) — desain selesai tuntas.
2. **Fase 03 Backend compliant**: modul + service/repo + trashed/restore +
   theme_config + referential integrity (dim 1, 2, 8).
3. **Auth nyata + signup→tenant + RBAC** (dim 4) — kunci SaaS.
4. **Rate limit + kuota + audit log** (dim 3) — kunci biaya & keamanan.
5. **Workers + Memory Agent** (dim 5, 10) — pembeda produk.
6. **Testing + CI + observability** (dim 11, 12, 13) — kunci "production-grade".
7. **git init + commit per fase** (dim 14) — mulai SEKARANG.
