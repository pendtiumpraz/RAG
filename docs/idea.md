# Nalar — Product Idea & Spec

> **Reasoning, sourced.** Platform RAG multi-tenant, white-label, SaaS & on-prem.
> Dokumen ini adalah satu sumber ide lengkap. Terakhir diperbarui: 2026-07-23.

---

## 1. Ringkasan

**Nalar** (Bahasa Indonesia: *daya pikir; menarik kesimpulan logis*) adalah
platform **Retrieval-Augmented Generation** di atas Next.js. Bisnis membuat
chatbot berbasis dokumen sendiri, menyematkannya di website mana pun, dan
setiap jawaban **dikutip dari sumbernya**. Dibangun multi-tenant dengan isolasi
tingkat database, dan **white-label penuh** sehingga tiap client tampil sebagai
brand mereka sendiri.

Dibangun dengan metodologi **Sainskerta Loop Engineering** (`loop/`).

---

## 2. Pertanyaan inti — dijawab

| Pertanyaan | Jawaban |
|---|---|
| Embedding pakai Google Drive **superadmin**? | ✅ File **model** embedding (ONNX 80MB/2GB) di-host superadmin, diunduh sekali, di-cache, dipakai bersama. Vektor tiap tenant tetap terisolasi. |
| 1 user = banyak chatbot, beda ID beda KB? | ✅ Tiap chatbot punya `public_key`; retrieval difilter `chatbot_id`. Beda ID = beda knowledge base terisolasi. |
| Tiap user konek Drive/SharePoint sendiri? | ✅ OAuth per-user. |
| Antar tenant terisolasi? | ✅ Postgres **Row-Level Security** + `tenant_id`. Kebocoran mustahil walau ada bug app. |
| **API key server-to-server per client**? | ✅ Lihat §5. Widget di browser **tidak pernah** memegang API key; key dipakai server-side per tenant. |
| **White-label** penuh (logo, warna, radius, font, dll)? | ✅ Lihat §4. Semua rupa dikendalikan theme-token per tenant/chatbot. |
| Mobile responsive + bisa embed? | ✅ Widget responsif (full-screen di HP), embed via 1 baris `<script>`. |
| SaaS + on-prem? | ✅ `DEPLOYMENT_MODE`, docker-compose untuk on-prem air-gapped. |

---

## 3. Brand — Nalar

- **Nama**: Nalar · **Tagline**: *Reasoning, sourced.* / *Jawaban yang bernalar, dengan sumber.*
- **Warna brand**: Indigo `#7C6DFF` (proses/interaktif) · Gold `#F5BE5E` (sumber/sitasi, dipakai hemat).
- **Karakter**: cerdas, tenang, presisi — tanpa hype.
- **Logo mark**: tiga node sumber → satu node jawaban emas (retrieval).
- Aset: `docs/brand-identity.html`, `docs/idea.html`.

> Catatan D3 (Hybrid): **struktur & komponen** ikut standar Sainskerta
> (sidebar 1-warna-icon, CRUD one-page, right-drawer, shadcn), **token warna**
> pakai palet Nalar. Untuk client, warna Nalar hanyalah *default* — semuanya
> bisa ditimpa white-label.

---

## 4. White-label / Theming (WAJIB)

Seluruh UI (dashboard, landing untuk client, dan **widget embed**) digerakkan
**design tokens**. Tiap tenant/chatbot menyimpan `theme config`, dan UI membaca
CSS custom properties `--wl-*` sehingga ganti config = ganti seluruh tampilan
tanpa ubah kode.

### Yang bisa dikustom
| Kategori | Token | Contoh |
|---|---|---|
| Logo | `brand.logo`, `brand.name` | inisial/SVG di sidebar & navbar & widget header |
| Warna primer | `--wl-primary`, `--wl-primary-2` | tombol, header, bubble user |
| Warna aksen | `--wl-accent` | chip sitasi/sumber |
| Netral | `--wl-bg`, `--wl-surface`, `--wl-text`, `--wl-muted`, `--wl-line` | tema terang/gelap |
| Radius | `--wl-radius`, `--wl-radius-sm` | 0–28px |
| Font | `--wl-font` | Inter / Serif / Mono / custom |
| Focus ring | `--wl-focus` | warna & ketebalan fokus a11y |
| Gaya tombol | `data-wl-btn` | `solid` / `soft` / `outline` |
| Tema | `data-wl-theme` | `dark` / `light` |
| Posisi widget | `data-wl-launcher` | `right` / `left` |

### Contoh theme config (disimpan per client, dilayani server)
```json
{
  "chatbotId": "cb_live_9f2a…c1",
  "brand": { "name": "Support", "logo": "◈" },
  "theme": {
    "primary": "#7C6DFF", "accent": "#F5BE5E", "focus": "#7C6DFF",
    "radius": "18px", "font": "Inter",
    "button": "solid", "mode": "dark", "position": "right"
  }
}
```

Demo interaktif: **`wireframes/embed-demo.html`** — customizer live (preset,
warna, radius, font, gaya tombol, tema, posisi) + salin config JSON.

### Implementasi (rencana)
- Kolom `theme_config JSONB` di tabel `chatbots` (+ level tenant untuk dashboard).
- `embed.js` menyuntikkan `<style>` dengan token `--wl-*` dari config chatbot.
- Dashboard punya halaman **Branding** (live preview) sebagai control surface.

---

## 5. Embed & API key server-to-server

### Alur aman
```
Browser pelanggan (embed.js, hanya bawa public_key)
        │  POST /api/chat/<public_key>  { message }
        ▼
Server Nalar
   ├─ resolve public_key → tenant + chatbot  (cek allowed_origins)
   ├─ withTenant(tenantId)  ← RLS aktif
   ├─ ambil API key provider tenant  → decrypt (AES-256-GCM)   ← server-side saja
   ├─ retrieve() vektor KB chatbot (pgvector)
   └─ streamChat() ke provider LLM pakai key tsb  → SSE ke browser
```

**Poin kunci:**
- API key **tidak pernah** dikirim ke browser. Widget hanya tahu `public_key`
  (aman dipublikasikan).
- Tiap **client/tenant** menyimpan API key-nya sendiri (atau pakai key
  superadmin/pooled, konfigurasi per plan). Panggilan ke provider = **server-to-server**.
- `allowed_origins` per chatbot = allow-list domain yang boleh menyematkan.
- Rate-limit & kuota diterapkan per tenant/plan di server.

### Snippet embed
```html
<script src="https://app.nalar.id/embed.js"
        data-chatbot="cb_live_9f2a…c1"
        data-color="#7C6DFF"></script>
```
Beda `data-chatbot` = beda chatbot = beda knowledge base + beda theme.

---

## 5a. Guardrails — 5 lapis (implemented 2026-07-23)

Setiap giliran chat & run agent melewati 5 lapis (`src/modules/core/guardrails.ts`):

| Lapis | Nama | Isi |
|---|---|---|
| **L1** | Input | Sanitasi input (kontrol char, panjang ≤4000), rate-limit 2 lapis + kuota plan di route |
| **L2** | Context | Anti prompt-injection: chunk dokumen = **DATA bukan instruksi** — pola injeksi disaring, dibungkus `<doc id>`, system prompt dikeraskan |
| **L3** | Execution | Budget per giliran: maks 8 chunk × 2400 char, output ≤8000 char, timeout stream 60 dtk |
| **L4** | Output | Redaksi secret (sk-, AKIA, ghp_, private key, JWT) per-delta + teks penuh; enforcement sitasi `[n]` |
| **L5** | Audit | Semua aksi → tabel `audit_logs` (RLS): chat.turn (dgn flag guardrail), auth.signup, memory.run, settings |

## 5b. Obsidian Memory Agent (requirement 2026-07-23)

Agent memori yang **memetakan** isi storage user menjadi knowledge map:

- **Storage**: Google Drive ✅ · SharePoint ✅ · **OneDrive ✅** (Microsoft Graph
  yang sama dengan SharePoint — `/me/drive`). Agent jalan di server Nalar,
  bukan "di dalam" Drive; storage hanyalah backend.
- **Output**: catatan markdown + frontmatter + `[[wikilink]]` — **kompatibel
  Obsidian**. Opsi sync-back sebagai vault `_nalar-memory/` ke Drive user
  sehingga bisa dibuka langsung di Obsidian.
- **Graph**: nodes = dokumen/catatan/entitas, edges = wikilink + kemiripan
  vektor. Disimpan per tenant (RLS) → dipakai sebagai **graph-RAG** saat
  retrieval (konteks relasi, bukan cuma chunk mirip).
- **UI**: halaman **Memory** di dashboard — graph view interaktif + daftar
  catatan (gaya Editorial Ledger: indeks silang / cross-reference).
- **Pipeline**: crawl → ekstrak teks → entity/topic mapping (LLM) → tulis note
  ber-wikilink → embed & graph → (opsional) tulis balik ke storage user.

### Level memory (keputusan 2026-07-23: implement L1–L4; **L5 belum dibutuhkan**)

| Level | Nama | Isi | Status |
|---|---|---|---|
| **L1** | Capture | 1 dokumen sumber → 1 note markdown (frontmatter + ref) | ✅ `memory-agent.service.ts` |
| **L2** | Distill | LLM meringkas: abstrak + poin kunci ke dalam note | ✅ |
| **L3** | Link | Entitas/topik → `[[wikilink]]` antar note + note MOC per topik | ✅ |
| **L4** | Graph | Edges wikilink + similarity (embedding, cosine ≥0.82), backlink, graph API, export vault | ✅ (`/api/memory/run·graph·vault`) |
| **L5** | Self-evolving | Vault merawat diri: **merge** near-duplicate (sim ≥0.93, edges dialihkan, duplikat soft-delete) + **prune** MOC yatim; keputusan tercatat di audit | ✅ (di-greenlight user 2026-07-23; jalan otomatis tiap `memory.run`) |

> Rantai otomatis penuh: **konek storage → sync worker crawl+ingest →
> memory.run L1→L5** — sekali user menghubungkan Drive, semuanya mengalir.

## 6. Model catalog (2026-07-23)

**LLM** (1 aktif/tenant): Anthropic (Fable 5, Opus 4.8, **Sonnet 5**, Haiku 4.5),
OpenAI (GPT-5.6 Sol/Terra/Luna, 5.5, 5.4), Google (Gemini 3.5 Flash, 3 Pro),
Mistral, DeepSeek, xAI Grok 4, Groq/Llama, Cohere. Tambah model = 1 baris di
`src/lib/models/registry.ts`.

**Embedding** (1 aktif/tenant):
- **~80MB** lokal: MiniLM-L6-v2 (384d), Nomic v1.5 (768d)
- **~2GB** lokal: BGE-M3 (1024d, multilingual), Qwen3-Embedding-8B (4096d)
- **API**: OpenAI text-embedding-3-small/large, Cohere Embed v4.0

API key provider disimpan **terenkripsi** (`provider_credentials`, AES-256-GCM).

---

## 7. Arsitektur

- **Stack**: Next.js (App Router) sebagai **Modular Monolith** (D1).
  Target modul: `src/modules/{Core,Tenant,Chatbot,Knowledge,Chat,Settings}/`
  (Service + Repository + Events).
- **DB**: PostgreSQL + **pgvector**. Isolasi tenant via **RLS + `tenant_id`** (A2).
- **Aturan Sainskerta (D2)**: **No foreign keys** (integritas di service layer),
  **soft delete** (`deleted_at` + `/trashed` + `/restore` di semua tabel),
  `created_at`/`updated_at`, snake_case, index di kolom join/filter/`deleted_at`.
- **Embedding lokal**: transformers.js (ONNX), file model dari Drive/SharePoint
  superadmin, cache di disk (`model-host.ts`).
- **Chat**: retrieval (pgvector, filter `chatbot_id`+`embedding_model`) → prompt
  + history → `streamChat()` multi-provider → SSE → simpan history + sitasi.

### Tabel inti
`tenants · users · tenant_settings · provider_credentials · chatbots
· data_sources · documents(vector) · conversations · messages`
— semua bertenant, RLS, soft-delete.

---

## 8. Halaman & mockup

| Area | File | Status |
|---|---|---|
| Brand identity | `docs/brand-identity.html` | ✅ |
| Product/arch (HTML) | `docs/idea.html` | ✅ |
| Wireframe dashboard (low-fi) | `wireframes/dashboard-wireframe.html` | ✅ approved |
| Mockup dashboard (hi-fi, 7 halaman) | `wireframes/dashboard-mockup.html` | ✅ (revisi elegan) |
| Landing page (marketing) | `wireframes/landing-mockup.html` | ✅ |
| Embed widget + white-label customizer | `wireframes/embed-demo.html` | ✅ |
| Auth (login/register) | `wireframes/auth-mockup.html` | ✅ |
| Dashboard: halaman **Branding** white-label (live preview) | `wireframes/branding-mockup.html` | ✅ |

**Dashboard (7 halaman):** Dashboard · Chatbots (CRUD one-page + right-drawer +
tab Sampah) · Knowledge Base · Conversations (sitasi) · Models & Keys · Team ·
Settings. Sidebar 1-warna-icon, dark/light toggle, mobile responsive.

---

## 9. Deployment

- **SaaS**: multi-tenant, signup → tenant baru terisolasi, billing per plan,
  tiap user konek Drive-nya, model embedding pakai host superadmin bersama.
- **On-prem**: `docker compose up` → Postgres+pgvector + app. Satu organisasi,
  embedding lokal (80MB/2GB) tanpa panggilan keluar (air-gapped-capable).

---

## 10. Status Loop Engineering

- **Fase 00–01**: selesai. Keputusan D1 (Next.js modular), D2 (No-FK + soft-delete),
  D3 (Hybrid UI) **approved**. `schema.ts` sudah compliant.
- **Fase 02 (Wireframe & Audit)**: wireframe **approved** → mockup hi-fi dibuat
  (dashboard elegan, landing, embed+white-label). Menunggu approval mockup.
- **Berikutnya**: mockup auth + halaman Branding, lalu **Fase 03 (Backend)**:
  restrukturisasi `src/modules/*`, endpoint soft-delete/restore, `theme_config`,
  auth nyata (ganti stub), worker sync Drive/SharePoint.

### Roadmap ringkas
- [ ] White-label: kolom `theme_config`, halaman Branding + live preview, inject di `embed.js`
- [ ] Server-to-server key per client + rate-limit/kuota per plan
- [ ] Auth (NextAuth) + signup→tenant
- [ ] Worker sync Drive/SharePoint (ekstraksi PDF/DOCX → ingest)
- [ ] Dashboard UI nyata (dari mockup) + integrasi API (no dummy data)
- [ ] Audit (Fase 05) → Deploy (Fase 06)
```
