# Model Hosting — bobot embedding di Vercel Blob

> Diverifikasi 2026-07-26 terhadap Hugging Face API dan runtime nyata.

Bobot model embedding (ONNX) **tidak** ikut di-bundle ke aplikasi. Ia
di-host terpusat oleh superadmin, diunduh sekali, lalu dipakai bersama
semua tenant. Ini infrastruktur bersama — **vektor** hasil embedding tetap
per-tenant dan tidak pernah bercampur (RLS, lihat `db/tenant-context.ts`).

Sejak 2026-07-26 host defaultnya **Vercel Blob publik**.

---

## 1. Setup

```bash
# .env  (aplikasi — hanya perlu URL publik, TANPA token)
EMBEDDING_MODEL_SOURCE=blob
EMBEDDING_MODEL_BLOB_URL=https://<store-id>.public.blob.vercel-storage.com
MODEL_CACHE_DIR=./.model-cache

# .env  (hanya di mesin superadmin, untuk mengunggah)
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_xxxxxxxx
```

`BLOB_READ_WRITE_TOKEN` diambil dari Vercel → Storage → (blob store) →
Tokens, atau `vercel env pull`. **Jangan** pasang token tulis di runtime
aplikasi: sisi baca cukup URL publik.

## 2. Unggah

```bash
npm run models:push -- --status           # lihat isi blob + kuota terpakai
npm run models:push -- all-MiniLM-L6-v2   # satu model
npm run models:push -- --all              # semua model lokal di registry
npm run models:push -- bge-m3 --force     # timpa yang sudah ada
```

Skrip ini dijalankan **dari mesin superadmin, bukan lewat serverless
function** — body request fungsi Vercel dibatasi ~4,5 MB, jadi berkas
ratusan MB/GB mustahil lewat sana. Dari CLI berkas dialirkan langsung ke
Blob API; di atas 50 MB otomatis memakai **multipart upload** (potongan
paralel + retry per potongan), sehingga ukuran berkas praktis bukan
kendala. Berkas yang sudah ada dilewati kecuali `--force`.

Sumber berkas: salinan lokal di `MODEL_CACHE_DIR` bila ada, kalau tidak
ditarik dari Hugging Face.

## 3. Tata letak & cara baca

Blob meniru struktur repo Hugging Face:

```
<base>/models/<hfRepo>/config.json
<base>/models/<hfRepo>/tokenizer.json
<base>/models/<hfRepo>/onnx/model_quantized.onnx
```

Sisi baca tidak punya kode unduh sendiri. `embeddings/local.ts` hanya
mengarahkan transformers.js ke blob:

```ts
env.remoteHost = `${base}/`;
env.remotePathTemplate = 'models/{model}/';
```

Transformers.js lalu menarik tiap berkas sesuai kebutuhan dan
menyimpannya di `MODEL_CACHE_DIR`. Karena ditarik **satu per satu**, tidak
ada lonjakan memori saat mengunduh model besar.

Buktikan bahwa bobotnya benar-benar ditarik dari model host **dan** modelnya
bisa dimuat — cache runtime dikosongkan dulu, lalu embedding dijalankan
betulan:

```bash
npm run models:verify                    # host tiruan dari cache lokal (cepat, tanpa jaringan)
npm run models:verify -- bge-m3          # model tertentu
npm run models:verify -- --live --all    # BLOB SUNGGUHAN, semua model lokal
```

`--live` adalah bukti terkuat setelah `models:push`: ia memakai
`EMBEDDING_MODEL_BLOB_URL` dari `.env` dengan cache kosong, jadi kalau ada
berkas yang lupa diunggah, ia akan gagal di sini — bukan nanti di produksi.

## 4. Ukuran nyata (HF, 2026-07-26)

| Model | repo | berkas dimuat | ukuran | muat pertama dari blob |
|---|---|---|---|---|
| `all-MiniLM-L6-v2` | `Xenova/all-MiniLM-L6-v2` | `onnx/model_quantized.onnx` | 21,9 MB | 22 dtk · 384 dim |
| `nomic-embed-text-v1.5` | `nomic-ai/nomic-embed-text-v1.5` | `onnx/model_quantized.onnx` | 130,9 MB | 109 dtk · 768 dim |
| `bge-m3` | `Xenova/bge-m3` | `onnx/model_quantized.onnx` | 543,3 MB | 377 dtk · 1024 dim |

Kolom terakhir = hasil `models:verify -- --live` nyata (cache kosong,
2026-07-26): unduh dari blob + bangun sesi ONNX + embed. Setelah bobot
ter-cache di `MODEL_CACHE_DIR`, pemuatan berikutnya hitungan detik.

Termasuk tokenizer/config, ketiganya **718,2 MB** — sekitar 7% dari kuota
10 GB (angka nyata hasil `models:push -- --all`, 2026-07-26).

Perkiraan waktu unggah (HF → blob, koneksi rumahan): berkas 130,9 MB ≈ 91
detik, 543,3 MB ≈ 353 detik. Keduanya lewat multipart. Menjalankan ulang
perintahnya aman — berkas yang sudah ada dilewati, bukan diunggah lagi.

> `Xenova/nomic-embed-text-v1.5` kini membalas **401** (tergated). Registry
> sudah dialihkan ke repo resmi `nomic-ai/…` yang ONNX-nya mandiri.

## 5. Batas nyata: varian "2 GB" belum bisa dimuat

BGE-M3 presisi penuh di HF bukan satu berkas 2 GB, melainkan:

```
onnx/model.onnx          0,6 MB   ← hanya graf
onnx/model.onnx_data   2.161,8 MB ← bobot EKSTERNAL
```

Pemecahan ini wajib karena protobuf ONNX dibatasi 2 GB.

**transformers.js v2.17.2 tidak bisa memuatnya.** Sesi dibuat dari buffer
di memori — `InferenceSession.create(buffer)` di `models.js` — dan seluruh
paket tidak menyebut `onnx_data`/`externalData` sama sekali. Tanpa jalur
berkas, onnxruntime tak bisa menemukan bobot pendampingnya.

Karena itu registry sengaja memakai varian terkuantisasi 543 MB yang
mandiri dan **benar-benar jalan**, bukan varian 2 GB yang akan gagal saat
dimuat.

Pengunggah tetap ikut me-mirror `.onnx_data` bila repo menyediakannya,
supaya isi blob lengkap begitu runtime di-upgrade.

### Jalan keluarnya: server embedding sendiri (VPS)

Varian 2 GB **bisa** dipakai — tapi tidak di dalam app ini, melainkan di
service terpisah `services/embedding-server/` yang memakai
`@huggingface/transformers` **v3** dengan `use_external_data_format: true`
(dokumentasi v3 menyebutnya persis "used for models >= 2GB in size"). Di
Node, v3 mengoper **path berkas** ke onnxruntime, bukan buffer — itulah yang
membuat bobot pendamping bisa ditemukan.

**Diverifikasi jalan, 2026-07-26.** v3 menarik `onnx/model.onnx` (607.298 B —
hanya graf) **dan** `onnx/model.onnx_data` (2.266.820.608 B) lalu memuatnya:

```
model   : bge-m3 (fp32, bobot eksternal)
vektor  : 3 x 1024 dim · norma 1,0000
similarity "garansi 24 bulan" vs "berapa lama garansi?"  0,8918
similarity "garansi 24 bulan" vs "pengiriman 3-5 hari"   0,6081
waktu permintaan: 0,87 dtk (model sudah di memori)
```

Semantiknya benar — pertanyaan garansi jauh lebih dekat ke jawaban garansi
daripada ke kalimat pengiriman. Perhatikan bedanya dengan serverless: di VPS
bobot dimuat sekali saat start, jadi permintaan berikutnya **di bawah 1
detik**, bukan 377 detik per cold start.

Lewat jalur app penuh (`embed('bge-m3-selfhosted', …)`) hasilnya 1024 dim
yang lalu di-zero-pad ke 1536 sesuai kolom pgvector, 476 ms.

App memanggilnya lewat HTTP kompatibel OpenAI. Karena bobot tak pernah masuk
ke proses app, batasan serverless di §6 jadi tidak relevan untuk jalur ini.
Panduan deploy: `services/embedding-server/README.md`; instruksi langkah demi
langkah untuk agen di VPS: `services/embedding-server/SETUP-VPS.md`.

### Mendaftarkan server dari dashboard (tanpa deploy ulang)

**Models & Keys → Server embedding (VPS) → Tambah server** — panel ini hanya
tampil untuk peran `superadmin`. Isi nama, alamat `https://…`, dan token yang
sama dengan `EMBEDDING_TOKEN` di VPS, lalu tekan **Test koneksi**.

Tombol itu memanggil `/v1/models` **ber-auth** di server, jadi satu klik
menguji jaringan DAN token sekaligus — token salah ketahuan di situ, bukan
nanti saat ingest pertama. Model yang dilaporkan (beserta dimensinya) disimpan
dan langsung muncul di dropdown model embedding dengan id berawalan `vps:`.
**Menambah model di VPS tidak perlu deploy ulang aplikasi** — cukup Test
koneksi lagi.

Beberapa hal yang ditegakkan di sisi ini:

- Alamat non-`https` ditolak (kecuali loopback) — isi dokumen tenant melintas.
- Token wajib, disimpan terenkripsi AES-256-GCM, dan **tak pernah** dikirim ke
  browser; API hanya melaporkan `hasToken: true/false`.
- Model dengan dimensi >1536 ditolak saat deteksi, karena kolom pgvector 1536
  (HNSW ≤2000) tak akan bisa menyimpannya.
- Panel & seluruh rute `/api/admin/embedding-servers` dikunci
  `requireRole('superadmin')`: tabelnya tak dilindungi RLS, dan menerima URL
  dari pihak tak tepercaya akan membuka SSRF.
- Server dihapus = soft delete (Rule #3), dan model-modelnya langsung hilang
  dari katalog.

Jalur env (`EMBEDDING_SELFHOSTED_URL`) tetap didukung untuk dev/on-prem, dan
entri statisnya hanya muncul di dropdown bila env itu memang diisi.

App utama **tetap** di transformers v2 — sengaja, supaya dependensi berat
itu tidak masuk ke bundle Next.js.

## 6. Batas serverless (Vercel)

Model lokal **tidak** realistis di lambda: `/tmp` hanya ~512 MB, memori
terbatas, dan filesystem-nya sementara sehingga bobot ditarik ulang tiap
cold start. Angka di tabel atas membuktikannya — muat pertama BGE-M3
**377 detik**, sementara `vercel.json` membatasi chat 60 dtk dan sync 300
dtk. Bahkan MiniLM yang 22 MB butuh ~22 dtk per cold start.

Di Vercel pakai **embedding API** (OpenAI/Cohere); jalur model lokal dari
blob ditujukan untuk **VPS / on-prem / Docker**, di mana `MODEL_CACHE_DIR`
dipetakan ke volume persisten sehingga unduhan cukup sekali seumur volume.

> Catatan produksi: default `tenant_settings.active_embedding_model` adalah
> `all-MiniLM-L6-v2` (model LOKAL). Di deployment Vercel, tenant yang
> memakai default itu akan tersendat/gagal saat ingest. Setel default ke
> model API, atau pastikan `EMBEDDING_MODEL_SOURCE`+`EMBEDDING_MODEL_BLOB_URL`
> terisi dan terima konsekuensi cold-start di atas.

Ini konsisten dengan batasan #1 di `docs/DEPLOY-VERCEL.md`.
