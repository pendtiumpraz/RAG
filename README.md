# RAG Engine

Multi-tenant Retrieval-Augmented-Generation platform built on **Next.js
(App Router)**. Pluggable embedding & LLM models, per-user Google Drive /
SharePoint sources, full chat history, and a chatbot you can embed on any
website. Ships as **SaaS** (multi-tenant) or **on-prem** (one org, one
container).

> Model catalog current as of **2026-07-23** — see `src/lib/models/registry.ts`.

---

## Jawaban langsung untuk pertanyaanmu

**"Embeddings pakai Google Drive superadmin, bisa gak?"** → **Bisa.** Yang
disimpan di Drive superadmin adalah **file MODEL embedding** (ONNX 80MB /
2GB). File itu diunduh sekali, di-cache, lalu dipakai bersama oleh semua
tenant (`src/lib/storage/model-host.ts`). Ini infrastruktur bersama.
**Yang TIDAK dibagi** adalah hasil embedding (vektor) tiap tenant — vektor
disimpan per-tenant di tabel `documents` dan tidak pernah bercampur.

**"1 user = 1 ID chatbot yang bisa di-embed ke website lain, beda ID beda
knowledge base, bisa gak?"** → **Bisa.** Satu user bisa punya banyak
chatbot; tiap chatbot punya `publicKey` sendiri (`cb_live_…`). Retrieval
selalu difilter `chatbot_id`, jadi **beda ID = beda knowledge base yang
terisolasi** (`src/lib/rag/retrieve.ts`).

**"Setiap user konek Google Drive masing-masing"** → **Ya.** Sumber data
per-user pakai OAuth Drive/SharePoint milik user itu
(`src/lib/storage/gdrive.ts`, `sharepoint.ts`).

**"Antar tenant harus isolated, tidak boleh saling connect knowledge
base"** → **Dipaksa di level database.** Postgres **Row-Level Security**
+ `tenant_id` + `withTenant()` membuat query bocor antar tenant *mustahil*
walau ada bug di kode app (`migrations/0001_rls.sql`,
`src/lib/db/tenant.ts`).

---

## Fitur → di mana kodenya

| Yang kamu minta | Implementasi |
|---|---|
| Pilih embedding model (80MB / 2GB / API OpenAI) | `src/lib/models/registry.ts` (bucket small/large/api), `src/app/settings` |
| Model embedding dari Google Drive / SharePoint | `src/lib/storage/model-host.ts` + `gdrive.ts` + `sharepoint.ts` |
| Semua provider & model terbaru (Jul 2026), pilih 1 aktif | `registry.ts` (`LLM_MODELS`), `tenant_settings.activeLlmModel` |
| Simpan API key | `provider_credentials` (AES-256-GCM, `src/lib/crypto.ts`) |
| History semua chat | tabel `conversations` + `messages` |
| Chatbot embed ke website apa pun + kirim response | `public/embed.js` + `POST /api/chat/[chatbotId]` (SSE stream) |
| SaaS + on-prem | `DEPLOYMENT_MODE`, `docker-compose.yml`, `Dockerfile` |
| Isolasi tenant | RLS + `tenant_id` (`migrations/0001_rls.sql`) |

---

## Model catalog (2026-07-23)

**LLM** — Anthropic (Fable 5, Opus 4.8, Sonnet 5, Haiku 4.5), OpenAI
(GPT-5.6 Sol/Terra/Luna, 5.5, 5.4), Google (Gemini 3.5 Flash, 3 Pro),
Mistral, DeepSeek, xAI Grok 4, Groq/Llama, Cohere. Tambah model baru =
tambah satu baris di `LLM_MODELS`.

**Embedding**
- **~80MB**: `all-MiniLM-L6-v2`, `nomic-embed-text-v1.5`
- **~2GB**: `bge-m3` (multilingual), `qwen3-embedding-8b` (SOTA open-source)
- **API**: OpenAI `text-embedding-3-small/large`, Cohere `embed-v4.0`

---

## Menjalankan

### On-prem (paling gampang)
```bash
cp .env.example .env      # isi secret + OAuth
docker compose up -d      # Postgres+pgvector + app
docker compose exec app npm run db:push
docker compose exec app npm run db:migrate   # pgvector + RLS
```

### Dev lokal
```bash
npm install
# jalankan Postgres pgvector (docker run pgvector/pgvector:pg17 ...)
npm run db:push && npm run db:migrate
npm run dev
```

### Embed di website mana pun
```html
<script src="https://your-rag-host/embed.js"
        data-chatbot="cb_live_xxxxx"
        data-color="#4f46e5"></script>
```

---

## Arsitektur (alur satu pertanyaan)

```
website pelanggan
  └─ embed.js  ──POST /api/chat/<publicKey>──►  resolve publicKey → tenant+chatbot
                                                 │  (cek allowedOrigins per-chatbot)
                                                 ▼
                                   withTenant(tenantId)  ← RLS aktif
                                                 │
                    ┌────────────────────────────┼───────────────────────────┐
                    ▼                            ▼                            ▼
             retrieve() vector search    load history (messages)      streamChat() LLM
             (filter chatbot_id +         per conversation            (provider dari registry,
              embedding_model)                                         API key tenant didecrypt)
                    └───────────────► build prompt ──► SSE deltas ──► widget ──► simpan history
```

---

## Yang masih perlu diselesaikan (roadmap)

Scaffold ini sudah punya "engine"-nya. Untuk produksi tinggal melengkapi:

- [ ] NextAuth/Auth.js nyata (stub di `src/lib/auth.ts`) + signup → buat tenant
- [ ] Worker sync Drive/SharePoint (ekstraksi teks PDF/DOCX → `ingestDocument`)
- [ ] UI dashboard: kelola chatbot, koneksi data source, lihat history
- [ ] Per-model pgvector index terpisah / partial index per dimensi
- [ ] Rate limiting + kuota per plan (SaaS billing)
- [ ] Halaman superadmin untuk kelola folder model embedding
```
