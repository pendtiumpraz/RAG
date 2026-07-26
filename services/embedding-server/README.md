# Nalar Embedding Server (VPS)

Server embedding mandiri. Bobot model tinggal di sini; aplikasi Nalar
memanggilnya lewat HTTP dengan protokol **kompatibel OpenAI**.

## Kenapa terpisah dari app

Dua alasan, keduanya keras:

1. **Lambda serverless tak sanggup.** `/tmp` di Vercel ~512 MB dan bersifat
   sementara, sehingga bobot ditarik ulang tiap cold start — terukur **377
   detik** hanya untuk varian 543 MB, sementara `vercel.json` membatasi chat
   60 detik. Di VPS, bobot dimuat **sekali saat start** lalu tinggal di
   memori; tiap permintaan jadi hitungan milidetik.
2. **BGE-M3 presisi penuh butuh transformers v3.** Bobotnya dipecah jadi
   `model.onnx` 0,6 MB + `model.onnx_data` 2,16 GB (ONNX dibatasi 2 GB per
   berkas). transformers.js **v2** — yang dipakai app — membangun sesi dari
   buffer di memori dan tak mengenal berkas pendamping, jadi model itu tak
   bisa dimuat di sana sama sekali. Paket ini memakai **v3** dengan
   `use_external_data_format: true`. Dipisah supaya app Next.js tidak ikut
   menanggung dependensinya.

## Jalankan

```bash
cd services/embedding-server
npm install                       # butuh install script onnxruntime-node aktif
EMBEDDING_TOKEN=<rahasia-panjang> MODELS=bge-m3 npm start
```

Muat-di-muka saja tanpa menyalakan server (mis. untuk mengisi cache):

```bash
MODELS=bge-m3 npm run warm
```

### Variabel lingkungan

| Var | Default | Guna |
|---|---|---|
| `EMBEDDING_TOKEN` | — | **Wajib.** Harus sama dengan `EMBEDDING_SELFHOSTED_TOKEN` di app. Tanpa ini semua permintaan ditolak 401. |
| `MODELS` | semua di katalog | Koma-pisah, model yang dimuat saat start. |
| `BGE_M3_DTYPE` | `fp32` | `fp32` = presisi penuh (2,16 GB, bobot eksternal) · `q8` = 543 MB. |
| `PORT` / `HOST` | `8081` / `0.0.0.0` | Alamat dengar. |
| `MODEL_CACHE_DIR` | cache HF | Arahkan ke volume persisten agar unduhan cukup sekali. |
| `MAX_BATCH` | `64` | Batas jumlah teks per permintaan. |

### Kebutuhan mesin

`fp32` memuat ~2,16 GB bobot ke memori; sediakan **RAM ≥4 GB** dan disk
≥5 GB untuk cache. Varian `q8` cukup dengan ~1,5 GB RAM.

## Sambungkan ke app

Di `.env` aplikasi Nalar:

```bash
EMBEDDING_SELFHOSTED_URL=https://embed.domainmu.com
EMBEDDING_SELFHOSTED_TOKEN=<rahasia-yang-sama>
```

Lalu di halaman **Models & Keys**, pilih model embedding
**"BGE-M3 presisi penuh — server sendiri (VPS)"**.

## TLS itu wajib, bukan opsional

Yang melintas ke server ini adalah **isi dokumen tenant**. Isolasi
antar-tenant dijaga ketat sampai level database (RLS); mengirim teksnya
lewat HTTP polos ke IP publik akan membocorkan semua itu di satu titik yang
tak dijaga. Karena itu app **menolak** `EMBEDDING_SELFHOSTED_URL` non-https
kecuali tujuannya loopback.

Contoh paling ringkas dengan Caddy (otomatis dapat sertifikat):

```
embed.domainmu.com {
    reverse_proxy 127.0.0.1:8081
}
```

Selain itu: ikat server ke `HOST=127.0.0.1` supaya port 8081 tidak terbuka
langsung ke internet, dan biarkan hanya Caddy/nginx yang menjangkaunya.

## API

```
GET  /health           (tanpa auth, minimal)  → { ok, count }
GET  /v1/models        Authorization: Bearer <token>
  →  { "data": [ { "id": "bge-m3", "dimensions": 1024, "dtype": "fp32", "loaded": true } ] }
POST /v1/embeddings    Authorization: Bearer <token>
     { "model": "bge-m3", "input": ["teks a", "teks b"] }
  →  { "data": [ { "index": 0, "embedding": [...] }, … ] }
```

`/health` sengaja tidak menyebut model apa pun — itu untuk uptime check dan
boleh publik. Daftar model ada di `/v1/models` yang ber-auth; dashboard Nalar
memanggilnya saat "Test koneksi" sehingga satu tombol menguji jaringan **dan**
token sekaligus, lalu mendaftarkan model yang ditemukan.

Karena kompatibel OpenAI, server ini boleh ditukar dengan HF Text
Embeddings Inference atau vLLM tanpa mengubah apa pun di app.

## systemd (opsional)

```ini
[Unit]
Description=Nalar Embedding Server
After=network.target

[Service]
WorkingDirectory=/opt/nalar/services/embedding-server
Environment=EMBEDDING_TOKEN=ganti-ini
Environment=MODELS=bge-m3
Environment=HOST=127.0.0.1
Environment=MODEL_CACHE_DIR=/var/lib/nalar/models
ExecStart=/usr/bin/node server.mjs
Restart=always

[Install]
WantedBy=multi-user.target
```
