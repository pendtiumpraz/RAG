# Audit Report — Nalar (Fase 05)

> Dijalankan 2026-07-23. Lingkungan: Node v24.18, npm 11.16 (Windows).
> Docker TIDAK tersedia di mesin ini → verifikasi runtime DB diserahkan ke user.

---

## 1. Build & typecheck — ✅ LULUS

| Langkah | Hasil |
|---|---|
| `npm install` | ✅ 250 paket, semua versi resolve tanpa konflik |
| `next build` (compile) | ✅ Compiled successfully |
| Typecheck (TS strict) | ✅ Lulus (setelah 1 fix: deklarasi tipe `pdf-parse`) |
| Rute ter-generate | ✅ 22 API route + 10 halaman (28 total) |

**Temuan A · pdf-parse tanpa @types** → ditambah `src/types/vendor.d.ts`. **Fixed.**

## 2. Smoke test runtime (tanpa DB) — ✅ LULUS

Server produksi (`next start`) boot bersih; endpoint tanpa-DB:

| Endpoint | Hasil |
|---|---|
| `GET /api/openapi` | ✅ 200 · 19 paths |
| `GET /embed.js` | ✅ 200 · 8.5 KB |
| `GET /auth` | ✅ 200 · HTML ter-render |

## 3. Bug pgvector ditemukan lewat review & DIPERBAIKI — ✅

**Temuan B · dimensi vektor tak cocok** — kolom `vector(4096)` tapi embedding
384/768/1024/1536 dims → pgvector menolak insert. **Fixed:** kolom → `vector(1536)`,
semua embedding **zero-pad ke 1536** (`padVector` di `embeddings/index.ts`; nol
tidak mengubah dot-product/norma → peringkat cosine tetap identik).

**Temuan C · HNSW index >2000 dims gagal** — pgvector membatasi HNSW ≤2000 dims;
kolom 4096/3072 error saat buat index. **Fixed:** kolom 1536 (≤2000, valid);
registry di-cap ≤1536 (Qwen3-8B 4096d dihapus; OpenAI 3-large di-request @1536d
via param `dimensions`).

Rebuild pasca-fix: ✅ exit 0.

## 4. Verifikasi runtime DB (Neon Postgres 17.10 + pgvector 0.8.0) — ✅ LULUS

DB nyata (Neon, tanpa Docker). Migrasi: `db:push` (tabel) + `db:migrate`
(pgvector+RLS+index). Smoke test end-to-end (`npm run smoke`):

| Uji | Hasil |
|---|---|
| signup → 1 tenant + admin + settings (transaksi RLS-aware) | ✅ |
| login benar / password salah ditolak | ✅ |
| **Isolasi RLS antar-tenant** (user tenant B tak terlihat dari tenant A) | ✅ (setelah fix D+E) |
| chatbot create + tolak owner lintas-tenant | ✅ |
| **ingest → embed(MiniLM 384→pad1536) → pgvector insert → retrieve cosine** | ✅ top score 0.752 |

### 🔴 Temuan D · RLS BOCOR — role `neondb_owner` punya `rolbypassrls=true`
Neon memberi atribut **BYPASSRLS** pada role owner → melewati SEMUA RLS
(walau ENABLE+FORCE benar). Query lintas-tenant bocor. **Fix:** buat role
aplikasi khusus **`nalar_app` (NOBYPASSRLS)** + grant DML; `DATABASE_URL` app
memakai role ini; owner hanya untuk migrasi/DDL (`db:setup-role`). Diverifikasi:
kebocoran hilang. **WAJIB dipakai juga di production Vercel** (DATABASE_URL = nalar_app).

### 🟡 Temuan E · model-host caching salah untuk sumber 'http'/'local'
Marker `.ready` membuat run kedua mengembalikan folder lokal kosong alih-alih
repo HF → embedding gagal di run berikutnya. **Fix:** untuk source http/local,
selalu kembalikan repo id (transformers pakai cache-nya sendiri). Diverifikasi: robust.

### Cara verifikasi (jalankan di terminal-mu; `!` prefix di sesi ini)

**Opsi A — Docker (paling mudah, setelah install Docker Desktop):**
```
docker run -d --name nalar-pg -p 5432:5432 \
  -e POSTGRES_USER=rag -e POSTGRES_PASSWORD=rag -e POSTGRES_DB=rag \
  pgvector/pgvector:pg17
# .env: DATABASE_URL=postgres://rag:rag@localhost:5432/rag
npm run db:push        # buat tabel dari schema
npm run db:migrate     # pgvector + RLS + index (migrations/*.sql)
npm run build && npm start
```

**Opsi B — Postgres cloud (Neon/Supabase, punya pgvector):**
set `DATABASE_URL` ke connection string, lalu `db:push` + `db:migrate`.

**Wajib set di `.env` sebelum jalan:**
- `DATABASE_URL`
- `NEXTAUTH_SECRET` (`openssl rand -base64 32`)
- `CREDENTIALS_ENCRYPTION_KEY` (base64 32 byte)
- `NEXTAUTH_URL=http://localhost:3000`

### Skenario uji manual setelah DB hidup
1. `/auth` → Daftar → cek 1 tenant + 1 user admin terbuat (RLS).
2. `/chatbots` → Tambah → cek `publicKey` + snippet.
3. `/api/ingest` (atau Knowledge → upload) → cek chunk masuk `documents`.
4. Embed widget → tanya → cek jawaban + sitasi + `usage_counters` naik.
5. Hapus chatbot → tab Sampah → Restore.
6. Memory → Jalankan Agent → cek graph.

---

## Skor assessment diperbarui (pasca verifikasi DB nyata)
- **Testing & quality gates**: 1.5 → **5.5** (build+typecheck, 8 unit test, smoke e2e DB lulus).
- **Database & isolasi**: 7.5 → **8.5** (RLS isolasi terbukti di DB nyata; migrasi teruji).
- **Auth & SaaS**: 6.5 → **8.0** (signup→tenant + login + isolasi terverifikasi runtime).
- **Keamanan**: 6.5 → **7.5** (bug RLS-bypass kritis ditemukan & ditutup).
- **Engine RAG**: 6.5 → **7.5** (ingest→embed→pgvector→retrieve terbukti jalan).
