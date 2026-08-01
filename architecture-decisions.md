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

## ✅ D11 — Knowledge base jadi entitas mandiri; 1 KB ↔ N chatbot; chatbot berkonteks divisi (2026-07-28)

**Decision.** Untuk pemakaian enterprise:
1. **`knowledge_bases`** jadi tabel sendiri (per tenant). `data_sources` dan
   `documents` menempel ke **KB**, bukan lagi ke chatbot.
2. **Assignment N:M** lewat `chatbot_knowledge_bases` — satu KB (termasuk
   sumber Google Drive-nya) bisa dipakai banyak chatbot; satu chatbot bisa
   menggabung beberapa KB. Retrieval chatbot = union dokumen semua KB yang
   di-assign padanya.
3. **`chatbots.context`** — teks persona/kepemilikan divisi ("Chatbot divisi
   HR, menjawab kebijakan karyawan…"), disuntikkan ke system prompt chatbot
   itu saja, di atas system prompt tenant.

**Konteks.** Sebelumnya KB terkunci 1:1 di chatbot — divisi yang berbagi
dokumen harus meng-ingest ulang (bayar embedding dua kali, dua salinan yang
bisa saling menyimpang). Kutipan user: "setiap chatbot dimiliki divisi
tertentu", "1 google drive knowledge base bisa di assign ke multi chatbot".

**Migrasi (0016).** Idempotent: buat tabel + RLS + grant; tiap chatbot lama
yang punya sumber/dokumen mendapat KB `KB <nama chatbot>` hasil backfill,
sumber & dokumen dipindah ke KB itu, assignment 1:1 dibuat — perilaku lama
terjaga persis. Kolom `chatbot_id` di `data_sources`/`documents` di-drop.
Sync selesai → Memory Agent dijalankan utk SETIAP chatbot ter-assign.

**Status:** APPROVED user 2026-07-28 (rangkaian pesan eksplisit di atas).

## ✅ D12 — Pembayaran QRIS multi-gateway + mode deploy dari database (2026-07-28)

**Decision.**
1. **Gateway pembayaran**: Midtrans, Tripay, Xendit — dikonfigurasi superadmin,
   SEMUA kredensial di database (AES-256-GCM, pola `oauth_apps`), TANPA env.
   Hanya SATU gateway aktif pada satu waktu. Metode: **QRIS saja** dulu.
2. **Mode deploy dipilih dari database** (`platform_settings.deployment_mode`,
   bukan env): `saas` = pembayaran & kuota aktif; `onprem` = pembayaran mati
   dan SEMUA kuota unlimited (pesan, chatbot, anggota).
3. **Halaman bayar milik sendiri**: QR dirender di halaman kita
   (`/billing/pay/[id]`) memakai design system — TIDAK redirect ke halaman
   gateway. Aktivasi plan via webhook callback ter-verifikasi signature
   (fallback poll status).
4. Harga plan (IDR/bulan) juga di `platform_settings`, diedit superadmin.

**Konteks.** Assessment 2026-07-28 menandai Monetisasi 5,5 (aktivasi plan
manual) sebagai penahan peluncuran. Kutipan user: "semua konfigurasi tidak
lewat ENV, semua di database", "halaman pembayaran QRIS itu juga pake
halaman website kita sendiri", "kalau on prem ... semua unlimited".

**Keamanan.** Webhook = endpoint publik; otentikasinya adalah verifikasi
signature per provider (Midtrans sha512(order+status+amount+serverKey),
Tripay HMAC body dgn private key, Xendit callback token). Baris `payments`
ber-RLS; webhook menulis lewat GUC platform_admin SETELAH signature lolos.

**Status:** APPROVED user 2026-07-28.

## ✅ D14 — Kebijakan jawaban per chatbot + retrieval bertingkat menyala otomatis (2026-07-30)

**Keputusan.** Dua hal yang keduanya menyangkut apa yang pengguna akhir
terima sebagai jawaban:

1. **Kebijakan jawaban milik CHATBOT, bukan milik tenant.** Bahasa jawaban
   (`auto`/`id`/`en`), nada, tingkat kepatuhan pada dokumen
   (`strict`/`balanced`/`open`), `temperature`, dan `max_tokens` disimpan per
   baris `chatbots` — sejalan dengan D11 yang sudah menjadikan chatbot sebagai
   unit berkonteks divisi. Divisi legal dan divisi marketing tak pantas
   dipaksa berbagi satu setelan kepatuhan.
2. **Mode retrieval TIDAK dipilih siapa pun.** Ia menyala sendiri begitu
   sebuah KB melewati `TIERED_MIN_CHUNKS` (200 ribu potongan).

**Konteks.** Sebelum ini `streamChat()` tak pernah mengirim `temperature` ke
penyedia mana pun, jadi semuanya berjalan pada default masing-masing — dan
default OpenAI maupun Anthropic adalah **1,0**. Itu nilai yang dirancang
untuk menulis prosa, dipakai oleh mesin yang tugasnya menyebut nomor pasal.
Ini bukan pengaturan yang kurang; ini cacat perilaku yang tak kelihatan
karena tak ada yang pernah menyebut angkanya.

Tiga sub-keputusan yang layak dicatat karena alternatifnya masuk akal:

- **Arahan kebijakan ditulis dalam bahasa Inggris**, walaupun produk ini
  berbahasa Indonesia. Instruksi sistem berbahasa Indonesia menarik model
  ikut menjawab dalam bahasa Indonesia walaupun penanyanya menulis Inggris —
  persis kegagalan yang mau dicegah mode `auto`. Bahasa instruksi ≠ bahasa
  jawaban.
- **Aturan bebas pemilik chatbot berlabel "preferensi gaya"** dan ditaruh
  setelah aturan kepatuhan. Tanpa pembatas itu, siapa pun yang bisa mengedit
  chatbot cukup menulis "abaikan aturan di atas" untuk mematikan seluruh
  anti-halusinasi dari kotak teks biasa di form.
- **`temperature` dijepit maksimum 1,0**, bukan 2,0 yang diizinkan OpenAI.
  Di atas 1 model mulai memilih token berpeluang rendah; pada mesin RAG itulah
  mekanisme lahirnya nama, tanggal, dan nomor pasal yang tak ada di dokumen
  mana pun. Ditegakkan di service DAN sebagai CHECK constraint (migrasi 0030).

**Kenapa mode retrieval tak boleh jadi pilihan.** Menyuruh pemilik data
memilih "mode retrieval" berarti meminta mereka menilai sesuatu yang tak
punya dasar untuk dinilai, dan salah pilih berarti jawaban yang diam-diam
kehilangan dokumen — kegagalan yang tak menimbulkan pesan galat apa pun.
Ambangnya ditentukan saat ingest; retrieval hanya membaca jejaknya lewat satu
`EXISTS` berindeks, bukan menghitung potongan di jalur panas.
`tenant_settings.tiered_retrieval` tetap ada tapi berubah arti: dari mode yang
dipilih pengguna menjadi **pemaksa untuk pengukuran awal saat pemasangan
on-prem**.

**Batas yang diakui.** Kebenaran jalur bertingkat sudah diuji pada basis data
sungguhan (hasil identik dengan mode datar, dibandingkan per isi), tapi pada
korpus kecil. Recall di ratusan ribu dokumen BELUM terukur — kartu backlog
`a-tier1-recall-eval`. Kaki leksikal sengaja tidak ikut disaring; itulah
jaring pengaman terhadap dokumen yang centroid-nya meleset.

**Status:** dikerjakan atas permintaan user 2026-07-30.

## ✅ D15 — Basis data tidak terikat penyedia; pemindahan bertingkat (2026-07-30)

**Keputusan.** Nalar tidak terikat Neon. Basis datanya boleh Postgres mana pun
— Neon, Hostinger, AWS RDS, atau VPS sendiri — asalkan memenuhi syarat yang
diperiksa alat, dan pemindahannya dilakukan bertingkat:

| Tingkat | Untuk siapa | Keadaan |
|---|---|---|
| 1 · DB bersama + RLS + kuota | Free, Pro | berjalan |
| 2 · Basis data platform di mana pun | operator (kita) | **alatnya siap** |
| 3 · Basis data per tenant (BYODB) | Enterprise, saat diminta | belum dibangun |
| 4 · On-premise penuh | klien yang membeli server | berjalan |

**Konteks — kenapa ini penting sekarang.** Ekonominya, bukan idealismenya.
Neon berhenti di 16 CU / 64 GB RAM; itu tembok, bukan soal membayar lebih.
Dan jauh sebelum tembok itu, biayanya sudah timpang: langganan Neon bulanan
menyamai sewa VPS setahun yang memberi Postgres penuh. Untuk produk yang
biaya terbesarnya adalah penyimpanan vektor, selisih itu menentukan.

**Yang ternyata sudah benar.** Lapisan basis datanya cuma `postgres.js` +
`DATABASE_URL`. Tak ada satu pun API khas Neon. Pemindahan platform secara
teknis hanya mengganti satu variabel lingkungan.

**Cacat yang ditemukan justru saat memeriksa itu, dan sudah diperbaiki.**
Keputusan TLS DITEBAK dari nama host (`neon.tech`, `.aws.`, `sslmode=require`).
Host seperti `srv123.hostinger.com` tak cocok pola mana pun, sehingga TLS akan
**mati diam-diam tepat pada saat pindah** — seluruh isi dokumen pelanggan dan
kredensial terenkripsi menyeberang internet sebagai teks polos, tanpa satu pun
galat. Logikanya kini dibalik (`core/db/ssl.ts`): TLS menyala untuk host publik
apa pun, mati hanya untuk host lokal/privat atau bila dinyatakan
`sslmode=disable`. Jalur baca-tulis dan jalur migrasi memakai keputusan yang
sama; ada uji yang menjaga keduanya tak menyimpang.

**Alat yang dibangun.** `npm run db:probe -- "<url>"` memeriksa kelayakan
sebuah Postgres SEBELUM dipakai: versi ≥ 15, pgvector, hak akses, dan — yang
paling menentukan — apakah perannya bisa **melewati RLS**. Sambungan sebagai
pemilik basis data mematikan isolasi antar pelanggan tanpa pesan apa pun; itu
pernah terjadi sungguhan di proyek ini. Pemeriksaannya memakai
`has_*_privilege`, tidak membuat tabel apa pun, jadi aman dijalankan terhadap
produksi. `npm run db:target -- "<url>"` menjalankan seluruh migrasi ke tujuan.

Alat itu menilai peran sesuai PERUNTUKANNYA: pada koneksi aplikasi, "bisa
melewati RLS" adalah **kegagalan**; pada koneksi migrasi ia justru **yang
diharapkan**. Menilai keduanya dengan satu ukuran akan melaporkan gagal untuk
koneksi admin yang sepenuhnya benar — dan orang berhenti mempercayai alatnya.

**Alat ini TIDAK memindahkan lalu lintas.** Ia menyiapkan tujuannya. Mengubah
`DATABASE_URL` tetap tindakan manusia yang sadar.

**Tingkat 3 (BYODB per tenant) SENGAJA ditunda**, dan alasannya perlu dicatat
supaya tidak dianggap kelalaian:

- **Migrasi × N.** Hari ini satu `db:migrate`. Dengan 100 basis data tenant,
  tiap perubahan skema jadi 100 kali jalan yang bisa gagal sendiri-sendiri →
  schema drift. Ini biaya yang tak pernah hilang, dan yang paling mahal.
- **Kueri lintas tenant pecah.** Antrean persetujuan pengguna, billing, dan
  papan backlog membaca lintas tenant di SATU basis data lewat GUC
  `app.admin_context`. Dengan N basis data, semuanya butuh control-plane
  terpisah.
- **Kolam koneksi di serverless.** Vercel sudah memaksa `max: 1`; N basis data
  berarti N kolam per instans.
- **Neon free per tenant bukan jalan keluar** — proyek free tidur (cold start
  tiap tenant), berkuota jam komputasi, dan membuatnya massal secara program
  hampir pasti melanggar ketentuan Neon.

**Yang TIDAK diselesaikan pemisahan basis data, dan sering dikira begitu:**
keamanan. Isolasi antar pelanggan sudah dijaga RLS dan sudah tuntas. Yang
diselesaikan pemisahan adalah tetangga berisik, atap kapasitas, data
residency, dan biaya yang terhitung per pelanggan — empat hal yang RLS memang
tak menyentuhnya.

**Catatan tentang RAM platform** (pertanyaan yang wajar dan jawabannya bukan
"tidak"): pada BYODB, RAM indeks vektor — satu-satunya yang tumbuh mengikuti
korpus — pindah ke basis data pelanggan. RAM aplikasi tetap terpakai, tapi ia
per-PERMINTAAN, bukan per-korpus. Jadi batasnya tetap ada; sifatnya berubah
dari batas penyimpanan menjadi batas laju, dan itu sudah dijaga kuota pesan
serta pembatas laju yang berjalan hari ini.

**Blob:** tidak menyimpan data tenant sama sekali — isinya hanya bobot model.
Karena itu "bawa kunci blob sendiri" belum punya arti, dan baru relevan bila
kelak berkas asli atau hasil ekspor ikut disimpan di sana.

**Status:** tingkat 1, 2, 4 berjalan. Tingkat 3 menunggu permintaan pelanggan
nyata — dikerjakan saat ada yang meminta, bukan dipajang sebagai fitur.

## D16 — SSO enterprise: penyedia dipilih pelanggan, gerbang tetap berlaku

**Keputusan (1 Agu 2026, pemilik produk):** SSO dipasang sebagai KEMAMPUAN,
dan tiap tenant menyalakan serta mengisi kredensial identity provider miliknya
sendiri — *"kasih pilihan aja semua SSO, biar dipilih user dewe"*. Kita tak
mendaftarkan aplikasi apa pun; polanya sama dengan kunci API penyedia LLM dan
kunci S3. Yang disediakan: Microsoft Entra ID, Google Workspace, Okta, dan
OIDC generik (mencakup Keycloak, Authentik, Auth0). SAML 2.0 sengaja TIDAK —
ia menuntut sertifikat, metadata XML, dan pustaka tambahan, dan belum ada yang
memintanya.

**Gerbang pendaftaran:** pengguna yang masuk lewat SSO tetap `pending` sampai
superadmin menyetujui, sama seperti jalur Google/Microsoft hari ini. Keempat
penyedia di atas melayani direktori raksasa; "langsung aktif" berarti siapa pun
yang punya akun di direktori pelanggan bisa masuk tanpa satu pun mata manusia
melihatnya.

**Konteks — kekhawatiran yang ternyata sudah terjawab.** Kartu ini lama
tertahan karena NextAuth memasang daftar provider secara statis saat modul
dimuat, sementara SSO multi-tenant menuntut resolusi IdP per permintaan.
Ternyata seam itu SUDAH ada: `buildAuthOptions()` memang dibangun
per-permintaan sejak kredensial Google/Microsoft dipindah ke basis data. Jadi
tak ada perombakan arsitektur; yang ditambahkan hanya satu provider lagi yang
endpoint-nya diisi dari koneksi SSO tenant.

**Bagaimana tenant dikenali saat masuk.** Dari DOMAIN EMAIL. Pengguna mengetik
emailnya di halaman masuk, domainnya dicocokkan ke koneksi SSO yang aktif, dan
koneksi itu disimpan di kuki pendek sebelum dialihkan ke IdP — kuki, karena
panggilan balik OAuth kembali tanpa parameter kueri kita. Domain wajib unik
SECARA GLOBAL (indeks unik di basis data): dua tenant yang mengaku memiliki
domain yang sama membuat perutean tak bisa ditentukan, dan menebaknya berarti
mengirim karyawan satu perusahaan ke IdP perusahaan lain.

**Yang TIDAK bisa dibuktikan dari sini:** tak ada IdP sungguhan di lingkungan
pengembangan, jadi alur ujung-ke-ujung tak pernah dijalankan. Yang diuji adalah
bagian yang deterministik — penurunan endpoint tiap penyedia, pencocokan
domain, dan penolakan konfigurasi yang tak aman.

**Status:** disetujui, dikerjakan.

## Log
| Tanggal | Keputusan | Oleh |
|---------|-----------|------|
| 2026-08-01 | D16 = SSO enterprise: Entra/Google/Okta/OIDC generik, kredensial milik tenant, gerbang pending tetap berlaku, perutean lewat domain email | User |
| 2026-07-30 | D15 = basis data tak terikat penyedia + pemindahan bertingkat; TLS tak lagi ditebak dari nama host; BYODB per tenant ditunda sampai diminta | User |
| 2026-07-30 | D14 = kebijakan jawaban per chatbot (bahasa/nada/kepatuhan/temperature) + mode retrieval bertingkat menyala otomatis, bukan dipilih | User |
| 2026-07-28 | D12 = pembayaran QRIS (Midtrans/Tripay/Xendit, satu aktif, config di DB) + mode deploy di DB (onprem=unlimited) + halaman bayar sendiri | User |
| 2026-07-28 | D11 = KB mandiri + assignment N:M ke chatbot + konteks divisi per chatbot | User |
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
