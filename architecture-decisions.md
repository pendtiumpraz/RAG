# Architecture Decisions — Nalar (RAG Engine)

> Catatan keputusan arsitektur. Format: Decision → Konteks → Status.
> Sesuai RULES-OF-THE-GAME #10, keputusan arsitektur final ada di tangan user.

---

## Konteks

Proyek RAG multi-tenant "Nalar" sudah di-scaffold (Next.js + Drizzle + pgvector)
SEBELUM mengadopsi Sainskerta Loop Workflow. Fase Planning ini menyelaraskan
proyek dengan RULES-OF-THE-GAME. Beberapa keputusan sudah jelas; tiga masih
menunggu approval user (ditandai 👀).

---

## Keputusan yang sudah diambil (dari percakapan sebelumnya)

| # | Aspek | Keputusan | Alasan |
|---|-------|-----------|--------|
| A1 | Database | **PostgreSQL + pgvector** | RAG butuh vector search; DATABASE-RULES.md mendukung Postgres. |
| A2 | Isolasi tenant | **Row-Level Security + `tenant_id`** | Wajib: antar tenant tidak boleh saling connect. Dipaksa di level DB. |
| A3 | Model embedding | Lokal ONNX (~80MB/~2GB) + API, host model di Drive/SharePoint superadmin | Sesuai brief; vektor tetap per-tenant. |
| A4 | LLM | Semua provider, 1 model aktif per tenant, API key terenkripsi | Sesuai brief + registry per 2026-07-23. |
| A5 | Deployment mode | SaaS + on-prem (docker-compose) | Sesuai brief. |

---

## ✅ Keputusan di-approve user (Fase 01, 2026-07-23)

### D1 — Stack / bentuk Modular Monolith
- **Opsi A (rekomendasi):** Tetap **Next.js App Router** sebagai satu modular monolith,
  direstrukturisasi jadi `src/modules/{Core,Tenant,Chatbot,Knowledge,Chat,Settings}/`
  dengan pola Service + Repository + Events. Alasan: ekosistem JS dibutuhkan untuk
  embedding lokal (transformers.js), dan Next.js resmi diizinkan di TEMPLATE-ARCHITECTURE.
- **Opsi B:** Split **backend (NestJS/Express) + frontend (React/Vite)** terpisah,
  lebih mirip contoh Laravel di dokumen.
- **Status:** ✅ APPROVED — Opsi A (Next.js modular), 2026-07-23.

### D2 — Kepatuhan aturan DB keras (No-FK + Soft-delete)
- Refactor schema: **buang FK constraint** (`.references()` → kolom + index),
  tambah **`deleted_at`** di semua tabel + endpoint `GET /trashed` & `PATCH /:id/restore`,
  integritas referensial pindah ke Service layer.
- **Opsi A (rekomendasi):** Terapkan penuh (ini inti "pakai loop engineering").
- **Opsi B:** Terapkan sebagian (mis. soft-delete ya, FK tetap) — menyimpang dari Rule #2/#3.
- **Status:** ✅ APPROVED — Opsi A (terapkan penuh), 2026-07-23. `schema.ts` sudah
  direfactor: FK constraint dibuang, `deleted_at`/`updated_at` + index di semua tabel.

### D3 — Arah UI dashboard (brand vs standar Sainskerta)
- Ada konflik: brand **Nalar** (gelap, indigo/gold, editorial) vs **UI-UX-STANDARDS**
  Sainskerta (biru `#3B82F6`, Inter, shadcn/ui, terang, sidebar 1-warna, right-drawer).
- **Opsi A:** Ikuti standar Sainskerta untuk dashboard admin; brand Nalar dipakai di
  landing + widget embed saja.
- **Opsi B:** Brand Nalar menyeluruh; override palet Sainskerta.
- **Opsi C (rekomendasi):** Hybrid — struktur & komponen Sainskerta (sidebar 1-warna,
  CRUD one-page, right drawer, shadcn) TAPI token warna pakai indigo/gold Nalar.
- **Status:** ✅ APPROVED — Opsi C (Hybrid), 2026-07-23.

---

### D4v3 — FINAL brand: official "NALAR — Enterprise Knowledge Intelligence" (2026-07-23)
- **Status:** ✅ AUTHORITATIVE — user menyediakan brand identity sheet resmi.
- Light-first enterprise. Palet: Deep Navy #0F172A · Royal Blue #2563EB (interaktif)
  · Emerald #10B981 (sukses) · Amber #F59E0B (sitasi/sumber) · Slate.
  Tipografi: Manrope/Plus Jakarta (display) · Inter (body) · JetBrains Mono (data).
  Ikon outline 2px. Tagline: "Enterprise Knowledge. Instant Intelligence."
- Jiwa RAG (retrieval trace + sitasi) dari D4v2 DIPERTAHANKAN, di-reskin ke palet resmi.
- DS `nalar-ds.css` v4; dipakai app Next.js (Fase 04) + mockup (token diremap otomatis).
- Logo resmi PNG di `public/brand/` menggantikan SVG inline.

### D4v2 — arah desain "Retrieval Instrument" (2026-07-23) — di-reskin ke brand resmi (D4v3)
- **Status:** ✅ APPROVED — menggantikan D4v1 "Editorial Ledger" (feedback user:
  "kayak museum, gak AI/RAG banget").
- Konsol graphite presisi; **mesin RAG diperlihatkan**: skor similarity, trace
  retrieval (query→embed→matches→answer), streaming token, status LED/pipeline.
- Mono+sans; **signal indigo** = interaktif; **source gold** = sitasi/skor sumber.
- Tetap anti-slop: tanpa gradient/glow/purple-hero. Dua tema: Instrument (dark) / Bench (light).
- `nalar-ds.css` v3 + semua surface di-re-skin (design-system, dashboard+Memory,
  landing dgn hero live-trace, embed dgn mini-trace, auth, branding).

### D4 — Arah desain visual (anti AI-slop) — SUPERSEDED oleh D4v2
- **Status:** ✅ APPROVED — **"Editorial Ledger"** (2026-07-23).
  Ink-on-paper; serif display + sans body + mono data; **sitasi/footnote sebagai
  bahasa visual utama**; garis hairline "ledger" bermakna; indigo hemat + gold
  khusus sumber. **Tanpa gradient/glow/purple-hero** (menghindari clichés AI-slop).
- Fondasi: `wireframes/nalar-ds.css` (token 3-lapis + white-label `--wl-*` + a11y AA/AAA)
  & referensi `wireframes/design-system.html`.
- **Konsekuensi:** mockup lama (dashboard/landing/embed/auth/branding) masih gaya
  dark-indigo-glow → harus di-re-skin ke Editorial Ledger memakai `nalar-ds.css`.

## Log
| Tanggal | Keputusan | Oleh |
|---------|-----------|------|
| 2026-07-23 | A1–A5 dicatat; D1–D3 diangkat ke user | AI |
| 2026-07-23 | D1=Next.js modular, D2=No-FK+soft-delete penuh, D3=Hybrid — semua APPROVED | User |
| 2026-07-23 | `schema.ts` direfactor compliant (No-FK + soft-delete + index) | AI |
| 2026-07-23 | UI/UX assessment (skor ~6.4/10); target 10; user: "jangan AI-slop" | User+AI |
| 2026-07-23 | D4 = arah desain "Editorial Ledger" approved; embed webfont; design system dulu → semua surface | User |
| 2026-07-23 | `nalar-ds.css` (v2 Editorial Ledger) + `design-system.html` referensi dibuat | AI |
