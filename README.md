<div align="center">

# Nalar

**Mesin RAG multi-tenant — jawaban yang selalu bisa ditelusuri ke sumbernya.**

SaaS dan on-premise dari satu basis kode. Isolasi tenant ditegakkan database,
bukan `WHERE` clause.

[![Lisensi](https://img.shields.io/badge/lisensi-BSL%201.1-0F172A)](LICENSE)
[![Status](https://img.shields.io/badge/status-produksi-047857)](https://rag.sainskerta.net)
[![Next.js](https://img.shields.io/badge/Next.js-15-2563EB)](https://nextjs.org)
[![Postgres](https://img.shields.io/badge/Postgres-17%20%2B%20pgvector-2563EB)](https://github.com/pgvector/pgvector)

</div>

---

## Apa ini

Nalar menjawab pertanyaan dari **dokumen milikmu sendiri** — kontrak, SOP,
kebijakan, laporan — dan setiap jawaban membawa rujukan ke potongan dokumen
yang dipakainya. Bukan chatbot yang mengarang lalu terdengar meyakinkan.

Ia dibangun untuk dijual ke perusahaan, jadi tiga hal yang biasanya diurus
belakangan justru jadi fondasi:

- **Isolasi tenant yang tak bisa dilanggar kode yang buggy.** Row-Level
  Security Postgres, `FORCE`, di setiap tabel ber-`tenant_id`. Query yang
  salah tulis mengembalikan nol baris, bukan data tenant lain.
- **Kedaulatan data.** Mode on-premise menjalankan aplikasi, embedding, dan
  LLM sepenuhnya di servermu. Tak ada byte yang keluar.
- **Jawaban yang bisa diperiksa.** Sitasi wajib, jejak retrieval terbuka, dan
  setiap giliran chat tercatat di audit log.

Produksi: **[rag.sainskerta.net](https://rag.sainskerta.net)**

---

## Kemampuan

| | |
|---|---|
| **Knowledge base mandiri** | Satu KB dipakai banyak chatbot lewat assignment N:M. Di-ingest sekali, dipakai semua. |
| **Sumber pengetahuan** | Google Drive (OAuth atau **URL folder publik tanpa login**), OneDrive, SharePoint (situs, document library, tautan berbagi), unggah berkas, halaman web. |
| **Sync inkremental** | Hanya berkas baru/berubah yang diunduh dan di-embed. Listing yang terpotong tak pernah memicu penghapusan. |
| **Hybrid search** | Vektor (pgvector/HNSW) + full-text Postgres, digabung Reciprocal Rank Fusion, potongan kembar disingkirkan. |
| **Jawaban terstruktur** | Model membalas blok — paragraf, daftar, kartu fakta, chart — dirender komponen demi komponen. Nol Markdown, dijamin di server. |
| **Guardrails 5 lapis** | Sanitasi input, anti prompt-injection pada konteks, budget eksekusi, redaksi rahasia + penegakan sitasi, audit log. |
| **Chatbot per divisi** | Tiap chatbot punya persona, konteks, branding, dan logo sendiri. |
| **Memory agent** | Catatan ala Obsidian dengan `[[wikilink]]`, graph force-directed, vault yang bisa ditulis balik ke Drive pengguna. |
| **API publik** | `/api/v1/*` ber-API key: chatbot, knowledge base, dokumen, dan **pencarian semantik murni tanpa LLM**. |
| **Webhook keluar** | Ditandatangani HMAC-SHA256, dikirim lewat job runner, dijaga terhadap SSRF. |
| **Multi-model** | 8 provider LLM + embedding lokal (ONNX), API, atau server sendiri. Tanpa vendor lock-in. |
| **Pembayaran** | QRIS lewat Midtrans / Tripay / Xendit — halaman bayar di situs sendiri, konfigurasi di database. |

---

## Arsitektur sekilas

**Modular monolith.** Satu deploy, batas modul tegas. Modul tidak saling impor
untuk side-effect; mereka menerbitkan event bertipe di bus in-process.

```
src/
├─ app/                     Next.js App Router
│  ├─ (app)/                halaman dashboard (di balik middleware sesi)
│  ├─ api/                  rute API — pembungkus tipis di atas service
│  │  └─ v1/                API publik pelanggan (auth: API key)
│  └─ _components/          komponen UI bersama
├─ modules/                 ← logika bisnis hidup di sini
│  ├─ core/                 db · auth · guardrails · jobs · limits · registry
│  ├─ auth/                 NextAuth, gerbang persetujuan, kredensial OAuth
│  ├─ chatbot/ chat/        chatbot, retrieval, pipeline jawaban
│  ├─ knowledge/            KB, sync, ekstraksi, embedding, adapter storage
│  ├─ connections/          akun storage per pengguna (multi-akun)
│  ├─ memory/ settings/     agen memory, pengaturan tenant
│  ├─ usage/ payments/      kuota, penagihan, gateway QRIS
│  ├─ integrations/         API key masuk, webhook keluar
│  └─ mail/                 SMTP dari database (bukan env)
└─ middleware.ts            gerbang rute ber-sesi
```

### Alur satu pertanyaan

```
embed.js / API
   └─ publicKey + cek origin ─────────────────────────► resolve tenant
        └─ withTenant(tenantId)   ← batas isolasi; semua akses DB lewat sini
             ├─ guardrails L1–L2   sanitasi input & konteks
             ├─ hybrid retrieval   vektor + leksikal → RRF → dedup
             ├─ LLM streaming      blok terstruktur + sitasi [n]
             └─ guardrails L4–L5   redaksi rahasia · audit log
```

### Isolasi tenant — invarian yang menanggung segalanya

Setiap akses data ber-tenant melewati `withTenant(tenantId, fn)`, yang menyemat
`app.current_tenant` **di dalam transaksi**. Policy RLS membandingkan
`tenant_id` dengan nilai itu. Konsekuensinya: kebocoran lintas-tenant mustahil
secara konstruksi — bukan karena setiap query diingat-ingat menulis filternya.

Aplikasi **wajib** terhubung sebagai role `nalar_app` (`NOBYPASSRLS`).
Terhubung sebagai pemilik database akan melewati RLS diam-diam; itu pernah jadi
bug nyata, dan `npm run db:setup-role` ada untuk mencegahnya terulang.

---

## Menjalankan

### On-premise (docker-compose)

```bash
cp .env.example .env          # isi CREDENTIALS_ENCRYPTION_KEY & DATABASE_URL
docker compose up -d
```

Aplikasi, Postgres+pgvector, dan penyiapan basis datanya berjalan berurutan.
Untuk LLM sepenuhnya lokal, arahkan ke Ollama / vLLM / LM Studio — semuanya
berprotokol OpenAI-compatible, cukup didaftarkan URL-nya di **Models & Keys**.

Panduan lengkapnya — variabel yang wajib diubah, cara MEMBUKTIKAN isolasi
tenant benar-benar menyala, kebutuhan disk, dan apa yang belum tercakup — ada
di **[docs/ONPREM.md](docs/ONPREM.md)**.

### Pengembangan lokal

```bash
npm install
npm run db:setup-role        # role nalar_app (NOBYPASSRLS) — RLS hanya jalan lewat role ini
npm run db:push              # skema — HANYA untuk database baru/dev (lihat peringatan)
npm run db:migrate           # pgvector, RLS, policy — WAJIB setelah db:push
npm run dev
```

### Menyematkan widget di situs mana pun

```html
<script src="https://rag.sainskerta.net/embed.js"
        data-chatbot="cb_live_xxxxxxxxxxxx"></script>
```

Daftar origin yang diizinkan ditegakkan per chatbot di sisi server.

---

## API publik

Terbitkan kunci di **Settings → API key** (izin `read` / `write` / `chat`).

```bash
curl -H "Authorization: Bearer nk_live_..." \
     https://rag.sainskerta.net/api/v1/me
```

```bash
# Pencarian semantik murni — tanpa LLM, tanpa memotong kuota pesan.
curl -X POST https://rag.sainskerta.net/api/v1/search \
  -H "Authorization: Bearer nk_live_..." \
  -H "Content-Type: application/json" \
  -d '{"chatbotId":"...","query":"berapa lama masa garansi?","k":5}'
```

Endpoint: `/v1/me` · `/v1/chatbots` · `/v1/knowledge-bases` · `/v1/documents` ·
`/v1/search`. Spesifikasi lengkap: **`GET /api/openapi`** (OpenAPI 3.1).

Webhook keluar dikonfigurasi di **Settings → webhook**; tiap kiriman membawa
`X-Nalar-Signature` (HMAC-SHA256 atas body mentah) — **verifikasi selalu**,
karena tanpa itu siapa pun yang tahu URL-mu bisa mengirim kejadian palsu.

---

## Perintah

```bash
npm run dev            # server pengembangan
npm run build          # build produksi — sekaligus gerbang typecheck
npm run lint           # eslint
npm test               # tes unit (tanpa database)
npm run smoke          # tes end-to-end terhadap database nyata (butuh .env)
npm run db:migrate     # SQL mentah di migrations/ (pgvector, RLS, policy)
npm run db:setup-role  # buat role nalar_app
npm run demo:account   # buat/atur ulang akun superadmin
npm run models:push    # unggah bobot model embedding ke blob storage
```

> ### ⚠️ Jangan pernah menjalankan `db:push` terhadap database produksi
>
> `drizzle-kit push` menyamakan database dengan `schema.ts` dan **menghapus
> diam-diam apa pun yang tidak dideklarasikan di sana**. Ia sudah membakar
> produksi tiga kali dalam dua hari: menghapus seluruh partial unique index,
> lalu **mematikan RLS di setiap tabel tenant**, lalu menghapus seluruh policy.
>
> Perubahan skema produksi hanya lewat `migrations/*.sql`. Pemulihan dari
> kecelakaan push: `npm run db:migrate` (idempotent).

---

## Keamanan

| Lapis | Yang dilakukan |
|---|---|
| **Isolasi** | RLS Postgres `FORCE` pada setiap tabel ber-`tenant_id`; role aplikasi `NOBYPASSRLS`. |
| **Rahasia** | API key provider dienkripsi AES-256-GCM; tak pernah dikirim ke browser. |
| **API key Nalar** | Hanya SHA-256-nya yang disimpan. Kunci mentah tampil sekali lalu hilang. |
| **Prompt injection** | Dokumen diperlakukan sebagai **data, bukan instruksi**; pola injeksi dinetralkan sebelum masuk konteks. |
| **Keluaran** | Rahasia diredaksi; jawaban tanpa sitasi ditandai. |
| **SSRF** | Setiap URL yang diketuk server (webhook, sumber URL) wajib https publik; alamat internal & metadata cloud ditolak. |
| **Jejak** | Setiap giliran chat, perubahan kredensial, dan aksi admin masuk audit log. |

Menemukan celah keamanan? Jangan buka issue publik — hubungi Licensor
langsung.

---

## Lisensi

**Business Source License 1.1** — lihat [`LICENSE`](LICENSE).

Ringkasnya, dan ini bukan pengganti membaca lisensinya:

- ✅ **Boleh** menjalankan Nalar di infrastrukturmu sendiri untuk organisasimu
  sendiri, termasuk untuk beban produksi internal — dan memodifikasinya.
- ✅ **Boleh** dipakai untuk evaluasi, riset, dan pendidikan.
- ❌ **Tidak boleh** menawarkan Nalar (atau turunannya) kepada pihak ketiga
  sebagai layanan terkelola, atau mendistribusikannya sebagai bagian dari
  produk komersial — itu menuntut lisensi komersial.

Pada **Change Date** (2030-07-30), versi yang bersangkutan otomatis beralih ke
**Apache License 2.0**.

Untuk lisensi komersial, on-premise berbayar, atau pengaturan lain: hubungi
**PT Sainskerta Solusi Nusantara**.

---

<div align="center">
<sub>Dokumenmu. Jawabanmu. Servermu — kalau mau.</sub>
</div>
