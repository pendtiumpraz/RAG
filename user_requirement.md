# User Requirement — Nalar (RAG Engine)

> Tempat user menyampaikan kebutuhan, feedback, approval. AI baca → tanya → iterasi.

---

## 📋 Requirement Project

### Nama Project
Nalar — Multi-tenant RAG Engine

### Deskripsi Singkat
Platform Retrieval-Augmented Generation: pilih model embedding & LLM apa pun,
hubungkan Google Drive/SharePoint per user, sematkan chatbot di website mana pun.
Tiap tenant & tiap chatbot punya knowledge base terisolasi.

### Target Pengguna
Bisnis yang butuh chatbot berbasis pengetahuan sendiri (SaaS), + organisasi
yang butuh deployment on-prem.

### Deadline
Belum ditentukan.

---

## 🎯 Fitur Utama

1. **Pilih embedding model** — lokal ~80MB, ~2GB, atau API OpenAI/Cohere; 1 aktif. — HIGH
2. **Model embedding dari Google Drive/SharePoint superadmin** (shared), vektor per-tenant. — HIGH
3. **Multi-provider LLM** (semua provider, model terbaru 2026-07-23), 1 aktif, API key tersimpan terenkripsi. — HIGH
4. **Chat history** lengkap per chatbot. — HIGH
5. **Embeddable chatbot** di website apa pun + respon streaming. — HIGH
6. **1 user = banyak chatbot**, tiap chatbot 1 ID = 1 knowledge base terisolasi. — HIGH
7. **Per-user Google Drive/SharePoint** sebagai sumber data. — HIGH
8. **Isolasi antar tenant** wajib (RLS, tidak boleh saling connect KB). — HIGH
9. **SaaS + on-prem**. — HIGH
10. **Pendaftaran terbuka + verifikasi superadmin** (dicatat 2026-07-26) — siapa pun
    boleh mendaftar, tapi akun BELUM bisa login sampai diverifikasi superadmin.
    Konsekuensi yang perlu diputuskan saat implementasi: kolom status di `users`
    (mis. `approved_at`/`status`), penolakan login untuk akun pending (pesan jelas,
    bukan "password salah"), halaman superadmin utk approve/tolak, dan nasib akun
    OAuth (Google/Microsoft) yang saat ini auto-provisioning tenant begitu login.
    — **BELUM DIIMPLEMENTASI**

---

## 🏗️ Arsitektur

### Keputusan Arsitektur
| Aspek | Pilihan |
|-------|---------|
| Backend Framework | Next.js (App Router) — **konfirmasi D1** |
| Frontend Framework | React (Next.js) — **arah UI: D3** |
| CSS Framework | Tailwind + shadcn/ui (rencana) |
| Database | PostgreSQL + pgvector ✅ |
| Deployment | SaaS (cloud) + on-prem (docker-compose) ✅ |
| Domain | Belum |
| SSL | Let's Encrypt / Cloudflare (nanti) |
| AI Integrasi? | Ya |
| AI Provider | Semua (Anthropic/OpenAI/Google/dll), 1 aktif per tenant |
| AI Model | Dari `registry.ts` (2026-07-23) |

### Database Access
```
Host: [belum diberikan — Rule #8]
Port: [belum]
Database: [belum]
Username: [belum]
Password: [belum]
```
> Untuk on-prem lokal, docker-compose menyediakan Postgres otomatis.

---

## ✅ Approval Form — Fase 01 (Planning)

Keputusan arsitektur yang menunggu (detail di `architecture-decisions.md`):

```
D1 — Stack Modular Monolith:      [ APPROVED ]  → Next.js modular
D2 — No-FK + Soft-delete refactor:[ APPROVED ]  → terapkan penuh
D3 — Arah UI dashboard:           [ APPROVED ]  → Hybrid (struktur Sainskerta + warna Nalar)
```

[APPROVAL_SECTION_START]
Status: APPROVED
Timestamp: 2026-07-23
Feedback: D1=A, D2=A, D3=C
[APPROVAL_SECTION_END]

---

## [PENDING] - Priority HIGH (interrupt, 2026-07-23)
- [ ] **Obsidian Memory Agent** — agent yang memetakan data di storage user
  (Google Drive / OneDrive / SharePoint) menjadi vault markdown ber-[[wikilink]]
  kompatibel Obsidian; opsi sync-back vault `_nalar-memory/` ke Drive user;
  knowledge graph per tenant/chatbot; dipakai sebagai graph-RAG untuk retrieval;
  halaman "Memory" (graph view) di dashboard.

---

## 🖼️ Feedback Wireframe & Mockup

### Wireframe low-fidelity — `wireframes/dashboard-wireframe.html` (2026-07-23)
Screen: S01 Dashboard · S02 Chatbots (CRUD one-page) · S03 Right-drawer · S04 Knowledge Base ·
S05 Conversations · S06 Models & Keys · S07 Sampah/Restore + Mobile.

```
## Feedback [Tanggal]
Screen yang di-review: [S0x]
- ✅ Approve: [...]
- ❌ Perubahan: [...]
- 💡 Saran: [...]
```

**Status Approve Wireframe:** `APPROVED` (2026-07-23)

### Mockup high-fidelity — `wireframes/dashboard-mockup.html` (2026-07-23)
7 halaman interaktif (Dashboard, Chatbots, Knowledge Base, Conversations, Models & Keys,
Team, Settings). Hybrid: struktur Sainskerta (sidebar 1-warna-icon, CRUD one-page,
right-drawer, tab Aktif/Sampah) + warna Nalar (indigo/gold). Dark-mode toggle, toast,
copy snippet, responsive.

**Status Approve Mockup:** `BELUM` — balas `approve` atau `revisi: [catatan]`

---

## 📝 Riwayat Percakapan

### 2026-07-23 — AI → User
```
Fase Planning: 3 keputusan arsitektur (D1–D3) diangkat via pertanyaan.
Requirement fitur sudah lengkap dari percakapan sebelumnya.
```
