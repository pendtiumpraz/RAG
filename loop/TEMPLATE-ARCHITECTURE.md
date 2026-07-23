# TEMPLATE-ARCHITECTURE.md

> **Template tanya jawab arsitektur project — digunakan di fase 01-PLANNING untuk menentukan semua keputusan teknis bersama user.**

---

## Petunjuk Penggunaan

Template ini di-copy ke `project-baru/user_requirement.md` saat fase planning. AI akan mengisi kolom `[jawaban user]` berdasarkan input dari user.

---

## 🏗️ Arsitektur Project

### 1. Framework Backend

| Pertanyaan | Jawaban |
|------------|---------|
| Framework backend apa yang digunakan? | `[Laravel / Next.js / Express.js / Django / Rails / lainnya]` |
| Alasan memilih framework ini? | `[d iisi user]` |
| Versi PHP/Node.js/Python? | `[versi]` |
| Apakah butuh REST API atau GraphQL? | `[REST / GraphQL]` |

**Pilihan umum:**
- **Laravel** — untuk project PHP dengan fitur lengkap (auth, queue, scheduler)
- **Next.js** — untuk full-stack JS/TS (backend + frontend in one framework)
- **Express.js** — untuk API ringan
- **Django** — untuk Python project dengan admin panel built-in

### 2. Framework Frontend

| Pertanyaan | Jawaban |
|------------|---------|
| Framework frontend apa yang digunakan? | `[React / Vue.js / Svelte / Alpine.js / vanilla]` |
| Apakah pakai meta-framework? | `[Next.js / Nuxt.js / SvelteKit / Remix]` |
| CSS framework? | `[Tailwind CSS / Bootstrap / Material UI / Chakra / shadcn]` |
| State management? | `[Redux / Zustand / Pinia / Vuex / Context API]` |

**Rekomendasi Sainskerta:**
- **React + Tailwind + shadcn/ui** — untuk fleksibilitas maksimal
- **Vue + Tailwind** — untuk learning curve lebih rendah
- **Svelte + Tailwind** — untuk bundle size kecil

### 3. Database

| Pertanyaan | Jawaban |
|------------|---------|
| Database engine apa? | `[MySQL / PostgreSQL / SQLite / MariaDB]` |
| Alasan memilih database ini? | `[d iisi user]` |
| Estimasi jumlah data? | `[kecil <10rb / sedang <100rb / besar >100rb]` |
| Spesifikasi server DB? | `[shared hosting / VPS / dedicated]` |

**Pilihan umum:**
- **MySQL/MariaDB** — paling umum, banyak shared hosting support
- **PostgreSQL** — fitur advanced, cocok data kompleks
- **SQLite** — hanya untuk development lokal / project super kecil

### 4. Deployment

| Pertanyaan | Jawaban |
|------------|---------|
| Target deployment? | `[VPS / shared hosting / cloud (AWS/GCP/Azure) / Railway / Vercel]` |
| OS server? | `[Linux Ubuntu/Debian/CentOS / Windows]` |
| Apakah sudah ada server? | `[Ya / Tidak / Belum]` |
| Docker atau langsung? | `[Docker container / bare metal]` |
| CI/CD pipeline? | `[GitHub Actions / GitLab CI / manual deploy]` |

### 5. Domain & SSL

| Pertanyaan | Jawaban |
|------------|---------|
| Domain sudah ada? | `[Ya / Belum]` |
| Nama domain? | `[domain.com]` |
| SSL Certificate? | `[Let's Encrypt / Cloudflare / beli sendiri]` |

### 6. Integrasi AI

| Pertanyaan | Jawaban |
|------------|---------|
| Apakah project butuh integrasi AI? | `[Ya / Tidak]` |
| Provider AI? | `[OpenAI / Anthropic / Google / DeepSeek / Mistral / Cohere / self-hosted]` |
| Model yang digunakan? | `[contoh: GPT-5.4 mini / Claude Sonnet 4.6 / Gemini 2.5 Flash]` |
| Use case AI? | `[chatbot / summarization / RAG / content generation / image generation]` |
| API Key sudah siap? | `[Ya / Belum]` |

Lihat [standards/AI-PROVIDERS.md](standards/AI-PROVIDERS.md) untuk perbanding lengkap.

### 7. Fitur Tambahan

| Pertanyaan | Jawaban |
|------------|---------|
| Autentikasi? | `[email/password / OAuth / magic link / social login]` |
| Role & permission? | `[Ya / Tidak / nanti]` |
| File upload? | `[Ya / Tidak]` — if ya: `[local / S3 / Cloudinary]` |
| Queue / job processing? | `[Ya / Tidak]` |
| Realtime / WebSocket? | `[Ya / Tidak / nanti]` |
| Email service? | `[SMTP / SendGrid / Mailgun / SES]` |
| Monitoring? | `[Sentry / Datadog / Grafana / custom]` |

---

## 📐 Template Jawaban User (copy-paste ke user_requirement.md)

```
## Arsitektur Project

**Backend:** [framework]  
**Frontend:** [framework] + [CSS framework]  
**Database:** [database engine]  
**Deployment:** [target]  
**Domain:** [domain / belum]  
**SSL:** [provider]  
**AI Integrasi:** [Ya/Tidak] — [provider/model] — [use case]  

## Fitur Tambahan

**Auth:** [metode]  
**File Upload:** [Ya/Tidak]  
**Queue:** [Ya/Tidak]  
**Realtime:** [Ya/Tidak]  
**Email:** [service]
```

---

## 🔗 Referensi

- [RULES-OF-THE-GAME.md](RULES-OF-THE-GAME.md) — Semua aturan wajib
- [standards/AI-PROVIDERS.md](standards/AI-PROVIDERS.md) — Perbanding AI provider
- [standards/UI-UX-STANDARDS.md](standards/UI-UX-STANDARDS.md) — Standar UI/UX
- [phases/01-PLANNING.md](phases/01-PLANNING.md) — Detail fase planning
