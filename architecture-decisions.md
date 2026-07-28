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

### D5 — Deployment SaaS: Vercel + Vercel Postgres (2026-07-24)
- **Status:** ✅ APPROVED (user). Deploy web+API ke **Vercel**, DB **Vercel Postgres
  (Neon, pgvector)** — tanpa Docker. On-prem tetap via docker-compose.
- Penyesuaian serverless (di kode): db pool `max:1` di Vercel + `prepare:false`;
  embedding lokal (transformers.js) **lazy-import** agar bundle ramping.
- **3 batasan serverless didokumentasikan** (`docs/DEPLOY-VERCEL.md`): (1) embedding
  lokal → pakai API di Vercel (lokal utk VPS/on-prem); (2) rate-limit in-memory →
  KV/Upstash utk production; (3) background job → Pro+waitUntil atau worker eksternal.
- `vercel.json`: maxDuration chat/ingest 60s, memory/sync 300s.

### D6 — Model host bobot embedding: Vercel Blob publik (2026-07-26)
- **Status:** ✅ APPROVED (user menyediakan blob store publik 10 GB + token).
- Bobot ONNX di-host di Blob dengan tata letak meniru repo HF
  (`models/<hfRepo>/…`). Sisi baca tanpa kode unduh sendiri: `env.remoteHost` +
  `env.remotePathTemplate` transformers.js diarahkan ke blob, hasilnya di-cache
  ke `MODEL_CACHE_DIR`. Unggah lewat CLI superadmin (`npm run models:push`,
  multipart >50 MB) — BUKAN lewat serverless function (body limit ~4,5 MB).
- Menggantikan Drive/SharePoint superadmin sebagai default; keduanya masih didukung.
- **Batas yang ditemukan saat implementasi:** varian BGE-M3 "2 GB" di HF adalah
  `model.onnx` 0,6 MB + `model.onnx_data` 2,16 GB (bobot eksternal).
  transformers.js v2.17.2 membuat sesi dari buffer memori dan tak mengenal
  berkas pendamping → varian itu **tak bisa dimuat**. Registry memakai
  varian terkuantisasi 543 MB yang mandiri. Membuka varian 2 GB berarti pindah
  ke `@huggingface/transformers` v3 (dukungan `externalData`+`dtype`) —
  **keputusan user, belum dikerjakan**. Detail: `docs/MODEL-HOSTING.md`.

### D7 — Embedding model besar lewat server sendiri di VPS (2026-07-26)
- **Status:** ✅ APPROVED (user: cronjob & model 2GB akan dijalankan di VPS sendiri,
  dihubungkan ke aplikasi lewat jaringan).
- Jenis embedder baru **`selfhosted`**: app memanggil `POST {base}/v1/embeddings`
  (**kompatibel OpenAI**, jadi server boleh ditukar ke HF TEI/vLLM tanpa ubah app).
  Konfigurasi infrastruktur lewat env (`EMBEDDING_SELFHOSTED_URL`/`_TOKEN`), bukan
  per-tenant — sama seperti model host.
- Server: `services/embedding-server/` — **paket terpisah** dengan
  `@huggingface/transformers` v3 + `use_external_data_format: true`. App utama
  SENGAJA tetap di v2 agar bundle Next.js tak menanggung dependensi berat.
  Ini menyelesaikan batas D6: varian BGE-M3 2,16 GB akhirnya bisa dipakai.
- **Keamanan:** app MENOLAK `EMBEDDING_SELFHOSTED_URL` non-https (kecuali loopback)
  dan menolak jalan tanpa token. Alasannya: yang melintas adalah isi dokumen tenant —
  isolasi RLS jadi sia-sia bila titik ini tak dijaga.
- Konsekuensi baik: bobot tak pernah masuk proses app, sehingga batasan serverless
  (cold-start 377 dtk, `/tmp` 512 MB) tidak berlaku untuk jalur ini.

### D8 — Server embedding VPS dikelola superadmin, global (2026-07-26)
- **Status:** ✅ APPROVED — user memilih "Superadmin saja, berlaku global" dari 3 opsi.
- Alternatif yang DITOLAK: per-tenant connect (tiap tenant menghubungkan VPS sendiri).
  Alasan penolakan: membuka **SSRF** — tenant bisa mengarahkan server kita ke alamat
  internal (metadata cloud, DB internal); perlu pemblokiran IP privat + allowlist.
- Wujudnya: tabel PLATFORM `embedding_servers` (tanpa `tenant_id`, tanpa RLS — ini
  perkecualian sadar dari pola skema, didokumentasikan di schema.ts), semua rutenya
  `requireRole('superadmin')`. Katalog model jadi dinamis: registry statis + model
  hasil deteksi berawalan `vps:`, sehingga menambah model di VPS tak perlu deploy ulang.
- Token terenkripsi AES-256-GCM dan tak pernah dikirim ke browser.

### D9 — Pendaftaran terbuka + verifikasi superadmin (2026-07-26)
- **Status:** ✅ APPROVED (user). Siapa pun boleh mendaftar; akun berstatus
  `pending` dan TIDAK bisa login sampai superadmin memverifikasi.
- `users.status` ('pending'|'active'|'rejected') + `approved_at`/`approved_by`
  (migrasi 0009). Akun yang sudah ada di-backfill `active` — jangan sampai
  pengguna lama ikut terkunci.
- **Gerbang berlaku di SEMUA jalur**, termasuk OAuth: tanpa itu orang tinggal
  lewat Google dan gerbangnya bocor. Jalur kredensial dijaga di
  `verifyCredentials()`, jalur OAuth di callback `signIn` NextAuth.
- **Anti kebocoran informasi:** NextAuth menolak akun pending PERSIS seperti
  password salah, supaya endpoint login tak bisa dipakai menebak email
  terdaftar. Alasan sebenarnya hanya lewat `POST /api/auth/login-status`, yang
  baru menjawab SETELAH password terbukti benar (rate-limited 10/menit/IP).
- Daftar antrean menembus batas tenant (tiap signup = tenant sendiri) padahal
  `users` FORCE RLS. Dipakai pola yang sama dengan `users_auth_lookup` (0002):
  policy tambahan `users_platform_admin_*` yang HANYA terbuka lewat GUC
  `app.admin_context='platform_admin'`, diset hanya di user-approval.service
  setelah `requireRole('superadmin')`.
- Pengaman: superadmin aktif TERAKHIR tak boleh menonaktifkan dirinya sendiri —
  kalau tidak, tak ada lagi yang bisa memverifikasi siapa pun dan platform hanya
  bisa dipulihkan lewat akses database langsung.

## ✅ D10 — Mode akses Google Drive dipilih superadmin: `full` | `picker` (2026-07-27)

**Decision.** Cara Nalar mengakses Google Drive menjadi MODE yang dipilih
superadmin (disimpan di `oauth_apps`, kolom `drive_access_mode`), bukan
tertanam di kode:

- **`full`** (default, perilaku lama): scan folder/drive rekursif — butuh scope
  `drive.readonly` (kelas **restricted** di Google).
- **`picker`**: pengguna memilih berkas lewat **Google Picker** (dialog resmi
  Google). Berkas yang dipilih otomatis ter-grant ke aplikasi lewat scope
  `drive.file` saja — **bukan** restricted, sehingga bebas dari verifikasi
  berat (video demo + asesmen CASA tahunan berbayar).

**Konteks.** Verifikasi OAuth Google berulang kali menolak dengan temuan
beranda, dan akar beratnya adalah `drive.readonly` (restricted). Menghapus
scope itu sepenuhnya menghilangkan fitur scan rekursif yang berharga untuk
on-prem/Workspace internal (internal app TIDAK butuh verifikasi sama sekali).
Karena kredensial OAuth sudah per-deployment di database (D-migrasi 0014),
mode per-deployment adalah jalan tengah yang tepat: SaaS = `picker`,
on-prem/internal = `full`.

**Yang harus dipahami (dicatat supaya tidak tertipu):**
- Toggle ini mengubah scope yang DIMINTA aplikasi, **bukan** kewajiban
  verifikasi project Google. SaaS baru bebas verifikasi berat setelah
  `drive.readonly` juga DIHAPUS dari consent screen project-nya.
- Dengan `drive.file`, memilih FOLDER di Picker tidak memberi akses isinya —
  pengguna memilih berkas (multi-select didukung). Berkas baru di folder tidak
  ikut otomatis; harus buka Picker lagi.
- Delta sync (`planDelta`) tetap bekerja pada berkas terpilih (cek
  `modifiedTime`); write-back `_nalar-memory/` tidak berubah (memang sudah
  `drive.file`); OneDrive/SharePoint tak tersentuh.
- Token akses Google user DIKIRIM ke browser saat membuka Picker — memang
  disyaratkan Picker API, token milik user sendiri untuk Drive-nya sendiri.
  Ini pengecualian sadar atas aturan "keys never reach the browser" (aturan
  itu untuk API key provider LLM, bukan token OAuth milik user).

**Status:** APPROVED user 2026-07-27 ("biar bisa pilih mode aja dari
superadmin"). Implementasi menyusul di commit yang sama.

**Update (hari yang sama):** setelah menimbang scan penuh vs verifikasi berat,
user memutuskan **SaaS jalan dengan mode `picker` dulu** ("picker dulu deh") —
`drive.readonly` sudah dihapus user dari consent screen Console, jadi scope
yang terdaftar tinggal non-sensitive dan **tidak ada verifikasi yang perlu
dilalui sama sekali**. Jalur `full` + verifikasi restricted disimpan sebagai
opsi nanti bila pelanggan menuntut scan folder otomatis di SaaS (on-prem /
Workspace internal sudah bisa memakainya sekarang tanpa verifikasi).

## Log
| Tanggal | Keputusan | Oleh |
|---------|-----------|------|
| 2026-07-27 | D10 = mode akses Drive (`full`/`picker`) dipilih superadmin; SaaS→picker utk lepas dari scope restricted | User |
| 2026-07-26 | D9 = pendaftaran terbuka + verifikasi superadmin (berlaku juga di jalur OAuth) | User |
| 2026-07-26 | D8 = server embedding VPS dikelola superadmin & global (per-tenant ditolak krn SSRF) | User |
| 2026-07-26 | D7 = embedder `selfhosted` + service VPS (transformers v3) — membuka varian 2 GB | User+AI |
| 2026-07-26 | D6 = model host Vercel Blob; batas varian 2 GB (bobot eksternal) dicatat | User+AI |
| 2026-07-23 | A1–A5 dicatat; D1–D3 diangkat ke user | AI |
| 2026-07-23 | D1=Next.js modular, D2=No-FK+soft-delete penuh, D3=Hybrid — semua APPROVED | User |
| 2026-07-23 | `schema.ts` direfactor compliant (No-FK + soft-delete + index) | AI |
| 2026-07-23 | UI/UX assessment (skor ~6.4/10); target 10; user: "jangan AI-slop" | User+AI |
| 2026-07-23 | D4 = arah desain "Editorial Ledger" approved; embed webfont; design system dulu → semua surface | User |
| 2026-07-23 | `nalar-ds.css` (v2 Editorial Ledger) + `design-system.html` referensi dibuat | AI |
