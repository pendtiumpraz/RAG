# Sainskerta Loop Workflow

> **Loop Engineering — Build. Audit. Iterate. Deploy.**

Sainskerta Loop Workflow adalah metodologi pengembangan project yang mengadopsi prinsip **loop engineering**: setiap fase project berjalan dalam siklus terstruktur dengan *human-in-the-loop* via `user_requirement.md`, file-as-interface, dan audit berlapis.

## Filosofi

### 🔄 Loop Engineering
Bukan waterfall, bukan agile — tapi **loop**. Setiap project adalah siklus yang terus berulang:

```
Prerequisites → Planning → Wireframe → Backend → Frontend → Audit → Deploy → Improvement
                                        ↕                          ↕
                              user_requirement.md          feedback loop
```

Tidak ada "selesai". Yang ada adalah: **deploy, lalu improve**.

### 📄 File-as-Interface
Semua komunikasi antara developer (AI) dan user terjadi lewat file markdown:
- `user_requirement.md` — tempat user menyampaikan kebutuhan, feedback, approval
- `progress.md` — tracking progress real-time
- `loop.md` — state loop saat ini

### 👤 Human-in-the-Loop
User tidak digantikan — user adalah **decision maker**. Setiap fase kritis (wireframe, audit, deployment) butuh persetujuan user via `user_requirement.md`.

### 📐 Modular Monolith
Semua project menggunakan arsitektur Modular Monolith — power of microservices tanpa kompleksitasnya. Satu codebase, module terpisah, komunikasi event-driven.

## Cara Pakai

### Di PC (Manual)

```bash
# 1. Clone atau salin folder workflow
cp -r sainskerta-loop-workflow/ project-baru/
cd project-baru/

# 2. Setup project
bash scripts/setup-workflow.sh

# 3. Mulai loop
bash templates/claude-workflow.sh start

# 4. Cek progress
cat templates/progress.md
```

### Di VPS (via OpenClaw/WhatsApp)

Setelah deploy workflow ke VPS:

1. Kirim pesan ke OpenClaw: `/start-project namaproject`
2. OpenClaw akan otomatis:
   - Setup folder structure
   - Mulai loop fase 00 (Prerequisites)
   - Minta user_requirement.md
   - Eksekusi tiap fase
3. User tinggal reply requirement dan feedback
4. Semua tracking via `progress.md`

## Struktur Folder

```
sainskerta-loop-workflow/
├── README.md                    ← Dokumentasi ini
├── TEMPLATE-ARCHITECTURE.md    ← Template tanya jawab arsitektur
├── RULES-OF-THE-GAME.md        ← Rules wajib tiap project
├── CLI.md                      ← Panduan CLI
├── phases/                     ← Fase-fase workflow
│   ├── 00-PREREQUISITES.md     ← Persiapan
│   ├── 01-PLANNING.md          ← Planning
│   ├── 02-WIREFRAME-AUDIT.md   ← Wireframe & mockup
│   ├── 03-BACKEND.md           ← Backend development
│   ├── 04-FRONTEND.md          ← Frontend development
│   ├── 05-AUDIT.md             ← Pre-deploy audit
│   ├── 06-DEPLOYMENT.md        ← Deployment
│   └── 07-IMPROVEMENT.md       ← Maintenance & improvement
├── templates/                  ← Template file
│   ├── progress.md
│   ├── user_requirement.md
│   ├── loop.md
│   └── claude-workflow.sh
├── standards/                  ← Standar & aturan detail
│   ├── SAINSKERTA-RULES.md
│   ├── MODULAR-MONOLITH.md
│   ├── UI-UX-STANDARDS.md
│   ├── DATABASE-RULES.md
│   └── AI-PROVIDERS.md
└── scripts/
    └── setup-workflow.sh
```

## Workflow Phases

| Fase | Deskripsi | Butuh User? |
|------|-----------|-------------|
| `00-PREREQUISITES` | Setup DB, framework, environment | ✅ Ya |
| `01-PLANNING` | Analisa & breakdown arsitektur | ✅ Ya |
| `02-WIREFRAME-AUDIT` | Wireframe → Mockup → Approve | ✅ Ya (approval) |
| `03-BACKEND` | Backend coding (tanpa dummy data) | ❌ Tidak |
| `04-FRONTEND` | Frontend + integrasi API | ❌ Tidak |
| `05-AUDIT` | Security, performance, code review | ✅ Ya (laporan) |
| `06-DEPLOYMENT` | Build, deploy, SSL | ✅ Ya (konfirmasi) |
| `07-IMPROVEMENT` | Loop maintenance | ✅ Ya (via issue) |

## Integrasi AI Provider

Workflow ini mendukung berbagai AI provider untuk kebutuhan spesifik:
- **OpenAI GPT-5.5 / GPT-5.4** — general reasoning, coding kompleks
- **Anthropic Claude Opus 4.8 / Sonnet 4.6** — complex reasoning, agentic coding
- **Google Gemini 2.5 Pro / 3.5 Flash** — multimodal, high volume
- **DeepSeek-V4** — low-cost alternative
- **Meta Llama 4 / Mistral** — self-hosted, privacy

Lihat [standards/AI-PROVIDERS.md](standards/AI-PROVIDERS.md) untuk detail lengkap.

## Aturan Utama (Ringkasan)

1. **Modular Monolith** — wajib, no microservices
2. **No foreign keys** — handle di aplikasi
3. **Soft delete & restore** — wajib
4. **CRUD in one page** — dengan right-side drawer modal
5. **Sidebar 1 color icon** — solid, no gradient
6. **No hardcoded dummy data** — semua via database
7. **User wajib kasih akses DB** sebelum create
8. **Backend dulu, baru frontend**
9. **Audit sebelum deploy**

Detail lengkap: [RULES-OF-THE-GAME.md](RULES-OF-THE-GAME.md)

## Lisensi

Sainskerta Loop Workflow — Open source untuk project development.
