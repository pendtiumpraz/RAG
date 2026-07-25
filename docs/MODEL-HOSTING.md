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

| Model | repo | berkas dimuat | ukuran |
|---|---|---|---|
| `all-MiniLM-L6-v2` | `Xenova/all-MiniLM-L6-v2` | `onnx/model_quantized.onnx` | 21,9 MB |
| `nomic-embed-text-v1.5` | `nomic-ai/nomic-embed-text-v1.5` | `onnx/model_quantized.onnx` | 130,9 MB |
| `bge-m3` | `Xenova/bge-m3` | `onnx/model_quantized.onnx` | 543,3 MB |

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

**Kalau varian 2 GB memang dibutuhkan**, jalannya adalah pindah ke
`@huggingface/transformers` v3 yang mendukung `externalData` + pemilihan
`dtype`. Itu penggantian dependensi inti embedding, jadi keputusannya di
tangan user (RULES-OF-THE-GAME #10) — belum dikerjakan.

## 6. Batas serverless (Vercel)

Model lokal **tidak** realistis di lambda: `/tmp` hanya ~512 MB, memori
terbatas, dan filesystem-nya sementara sehingga bobot ditarik ulang tiap
cold start. Di Vercel pakai **embedding API** (OpenAI/Cohere); jalur model
lokal dari blob ditujukan untuk **VPS / on-prem / Docker**, di mana
`MODEL_CACHE_DIR` bisa dipetakan ke volume persisten.

Ini konsisten dengan batasan #1 di `docs/DEPLOY-VERCEL.md`.
