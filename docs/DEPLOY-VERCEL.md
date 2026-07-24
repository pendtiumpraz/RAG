# Deploy Nalar ke Vercel + Postgres

> Panduan deploy SaaS ke **Vercel** dengan **Vercel Postgres (Neon, pgvector)**.
> Untuk on-prem/air-gapped, pakai `docker-compose.yml` (bukan panduan ini).

---

## 1. Buat database (Vercel Postgres / Neon)

Vercel Postgres ditenagai **Neon** yang sudah mendukung **pgvector** — tak perlu Docker.

1. Vercel Dashboard → **Storage → Create Database → Postgres**.
2. Sambungkan ke project. Vercel meng-inject beberapa env otomatis
   (`POSTGRES_URL`, `POSTGRES_PRISMA_URL`, `POSTGRES_URL_NON_POOLING`, …).
3. Set env aplikasi kita:
   - **`DATABASE_URL`** = endpoint **pooled**, TAPI dengan **role `nalar_app`**
     (BUKAN owner `neondb_owner`) — lihat kotak ⚠️ di bawah.

> ⚠️ **WAJIB (keamanan RLS):** role owner Neon (`neondb_owner`) punya atribut
> **BYPASSRLS** → melewati Row-Level Security → **isolasi tenant tidak berlaku**.
> Buat role aplikasi non-bypassrls sekali: `APP_PW=<pw> npm run db:setup-role`
> (jalan sbg owner via `DATABASE_URL_UNPOOLED`). Lalu set `DATABASE_URL` app ke
> `postgresql://nalar_app:<pw>@<pooled-host>/neondb?sslmode=require`.
> **Migrasi/DDL** tetap pakai owner (`DATABASE_URL_UNPOOLED`). Sudah diverifikasi
> di audit: tanpa ini, query lintas-tenant BOCOR.

Catatan: buang `channel_binding=require` dari URL (driver `postgres-js` tak
mendukungnya); cukup `sslmode=require`.

> Alternatif: Neon langsung (neon.tech, free tier). Aktifkan pgvector: `CREATE EXTENSION vector;` (migrasi kita sudah menjalankan `CREATE EXTENSION IF NOT EXISTS vector`).

## 2. Environment variables (Vercel → Settings → Environment Variables)

```
DATABASE_URL=<POSTGRES_URL pooled>
NEXTAUTH_URL=https://<project>.vercel.app
NEXTAUTH_SECRET=<openssl rand -base64 32>
CREDENTIALS_ENCRYPTION_KEY=<base64 32 byte>
DEPLOYMENT_MODE=saas

# OAuth (opsional tapi disarankan)
GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=...
MS_CLIENT_ID=... MS_CLIENT_SECRET=... MS_TENANT_ID=common

# Default provider keys (opsional; tenant bisa set sendiri)
OPENAI_API_KEY=... ANTHROPIC_API_KEY=... GOOGLE_GENAI_API_KEY=...
```

## 3. Migrasi schema (sekali, dari lokal)

```
# arahkan DATABASE_URL ke Postgres Vercel (endpoint NON-pooling utk DDL)
npm run db:push        # buat tabel dari schema Drizzle
npm run db:migrate     # pgvector + RLS + index (migrations/0001..0005)
```

## 4. Deploy

```
vercel                 # preview
vercel --prod          # production
```
`vercel.json` sudah menaikkan `maxDuration` untuk rute chat/ingest/sync/memory.

---

## ⚠️ Batasan serverless & solusinya (WAJIB dibaca)

Vercel = serverless (fungsi berumur pendek, memori tak persisten). Tiga hal
di arsitektur kita perlu penyesuaian di production:

| # | Isu | Di Vercel | Solusi |
|---|-----|-----------|--------|
| **1** | **Embedding lokal** (transformers.js 80MB–2GB) | ❌ tak praktis (ukuran bundle, cold-start, /tmp) | **Pakai embedding API** (OpenAI/Cohere) di Vercel. Kode sudah lazy-load model lokal → bundle ramping. Model lokal untuk **on-prem/VPS**. |
| **2** | **Rate limiter in-memory** | ⚠️ per-instance, tak lintas-instance | Cukup untuk skala kecil. Production: pindah ke **Vercel KV / Upstash Redis** (interface `rateLimit()` tinggal ditukar). |
| **3** | **Background jobs** (sync worker, memory agent) in-process | ⚠️ bisa ke-freeze setelah response | Vercel **Pro** (maxDuration 300s) + `waitUntil` untuk job pendek; ATAU offload ke **worker terpisah** (Railway/VPS) / **QStash**. Untuk sync besar, worker terpisah disarankan. |

### Rekomendasi konfigurasi Vercel yang mulus
- **Embedding**: set model aktif tenant ke `text-embedding-3-small` (API) — cepat, tanpa bundle berat.
- **Plan**: Vercel **Pro** agar streaming chat & memory.run cukup waktu.
- **Skala besar / sync berat**: jalankan `source.sync` & `memory.run` di worker
  eksternal (mis. Railway) yang berbagi `DATABASE_URL` yang sama; Vercel hanya
  meng-antre. (Interface `enqueueJob` tinggal diarahkan ke QStash.)

> Ringkas: **Vercel bagus untuk web + API + chat**; **embedding lokal & job berat
> lebih cocok di VPS/on-prem**. Arsitektur kita mendukung keduanya — pilih sesuai
> beban. Untuk MVP SaaS dengan embedding API, Vercel + Vercel Postgres cukup.
