# Untuk openclaw — setup embedding server di VPS

Halo openclaw. Dokumen ini instruksi kerja untuk kamu, dijalankan **di VPS**.
Tujuannya: menyalakan server embedding yang akan dipakai aplikasi Nalar
(`nalar.sainskerta.net`) lewat jaringan.

Isi folder ini (`services/embedding-server/`) sudah lengkap — kamu tidak perlu
menulis kode aplikasi. Tugasmu: pasang, amankan, jalankan, verifikasi.

---

## Yang sedang kita bangun

Aplikasi Nalar berjalan di Vercel (serverless) dan **tidak sanggup** memuat
model embedding besar: `/tmp` di lambda hanya ~512 MB dan bersifat sementara,
jadi bobot ditarik ulang tiap cold start — terukur 377 detik hanya untuk model
543 MB, sementara batas request chat 60 detik.

Maka model tinggal di VPS ini. Aplikasi memanggilnya lewat HTTP dengan
protokol kompatibel OpenAI. Setelah dimuat sekali saat start, tiap permintaan
selesai **di bawah 1 detik** (sudah diukur: 0,87 dtk untuk 3 teks).

Model utamanya **BGE-M3 presisi penuh**: `model.onnx` 607 KB (grafnya saja) +
`model.onnx_data` **2,27 GB** (bobot eksternal). Ini sebabnya harus di VPS.

---

## Prasyarat mesin

| Kebutuhan | Nilai |
|---|---|
| RAM | **≥4 GB** (bobot fp32 ~2,27 GB + overhead onnxruntime) |
| Disk | ≥6 GB kosong untuk cache model |
| Node.js | **≥20** |
| OS | Linux x64 atau arm64 |

Kalau RAM di bawah 4 GB, jangan paksakan `fp32`. Pakai `BGE_M3_DTYPE=q8`
(543 MB, butuh ~1,5 GB RAM) dan laporkan ke user bahwa tier presisi penuh
belum bisa di mesin ini.

---

## Langkah

### 1. Ambil kode & pasang dependensi

```bash
git clone https://github.com/pendtiumpraz/RAG.git /opt/nalar
cd /opt/nalar/services/embedding-server
npm install
```

**PENTING:** `onnxruntime-node` punya install script yang mengunduh binari
native. Kalau npm di mesin ini memblokir install script, binari itu tak
terpasang dan server akan gagal start. Pastikan script-nya berjalan
(`npm install` tanpa flag pemblokir, atau setujui bila diminta), lalu
verifikasi:

```bash
ls node_modules/onnxruntime-node/bin/napi-v3/linux/
```

Harus ada folder arsitekturmu berisi `onnxruntime_binding.node`.

### 2. Buat token

Token ini yang memisahkan server dari internet terbuka. Buat yang panjang dan
acak, JANGAN yang mudah ditebak:

```bash
openssl rand -base64 32
```

Simpan. Nilai yang **sama persis** nanti dimasukkan user ke dashboard Nalar.

### 3. Unduh bobot model lebih dulu (opsional tapi disarankan)

Unduhan 2,27 GB. Lakukan di luar jam sibuk supaya start pertama tidak lama:

```bash
MODEL_CACHE_DIR=/var/lib/nalar/models MODELS=bge-m3 npm run warm
```

Perintah ini memuat model lalu keluar. Kalau sukses, kamu akan lihat
`[load] bge-m3 … siap dalam Ns`.

### 4. Jalankan sebagai service

Buat `/etc/systemd/system/nalar-embedding.service`:

```ini
[Unit]
Description=Nalar Embedding Server
After=network.target

[Service]
WorkingDirectory=/opt/nalar/services/embedding-server
Environment=EMBEDDING_TOKEN=<token-dari-langkah-2>
Environment=MODELS=bge-m3
Environment=BGE_M3_DTYPE=fp32
Environment=HOST=127.0.0.1
Environment=PORT=8081
Environment=MODEL_CACHE_DIR=/var/lib/nalar/models
ExecStart=/usr/bin/node server.mjs
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload
systemctl enable --now nalar-embedding
systemctl status nalar-embedding
```

`HOST=127.0.0.1` disengaja: port 8081 **tidak boleh** terbuka langsung ke
internet. Hanya reverse proxy di langkah berikut yang boleh menjangkaunya.

### 5. TLS — ini wajib, bukan opsional

Yang melintas ke server ini adalah **isi dokumen milik tenant**. Di aplikasi,
isolasi antar-tenant dijaga ketat sampai level database (Postgres RLS).
Mengirim teksnya lewat HTTP polos ke IP publik akan membocorkan semua itu di
satu titik yang tidak dijaga.

Karena itu aplikasi Nalar **menolak** alamat non-`https` (kecuali loopback).
Jadi tanpa TLS, integrasi ini memang tidak akan jalan.

Paling ringkas dengan Caddy (sertifikat otomatis):

```
# /etc/caddy/Caddyfile
embed.domainmu.com {
    reverse_proxy 127.0.0.1:8081
}
```

```bash
systemctl reload caddy
```

Arahkan dulu DNS `embed.domainmu.com` ke IP VPS ini. Kalau user belum punya
subdomain, minta dia menyiapkannya — **jangan** mengakalinya dengan IP polos.

### 6. Tutup port selain 80/443

```bash
ufw allow 22/tcp
ufw allow 80,443/tcp
ufw deny 8081/tcp
ufw enable
```

### 7. Verifikasi

```bash
# dari VPS — health tanpa auth, sengaja minimal
curl -s https://embed.domainmu.com/health
# → {"ok":true,"count":1}

# katalog model, WAJIB token
curl -s https://embed.domainmu.com/v1/models \
     -H "Authorization: Bearer <token>"
# → {"data":[{"id":"bge-m3","dimensions":1024,"dtype":"fp32","loaded":true}]}

# token salah harus ditolak
curl -s -o /dev/null -w '%{http_code}\n' https://embed.domainmu.com/v1/models \
     -H "Authorization: Bearer salah"
# → 401

# embedding sungguhan
curl -s https://embed.domainmu.com/v1/embeddings \
     -H "Authorization: Bearer <token>" -H 'content-type: application/json' \
     -d '{"model":"bge-m3","input":["garansi produk 24 bulan"]}' \
  | head -c 200
```

Yang harus benar: `dimensions` **1024**, `loaded` **true**, token salah → 401,
dan vektor keluar dengan panjang 1024.

---

## Laporkan ke user

Setelah semua hijau, kirim dua hal ini — dia memasukkannya ke dashboard Nalar
di **Models & Keys → Server embedding (VPS) → Tambah server**:

1. **Alamat**: `https://embed.domainmu.com`
2. **Token**: token dari langkah 2

Dia lalu menekan **Test koneksi**; aplikasi akan memanggil `/v1/models`,
mendeteksi `bge-m3` beserta dimensinya, dan model itu langsung muncul di
dropdown model embedding. Tidak perlu deploy ulang aplikasi.

---

## Kalau ada yang gagal

| Gejala | Kemungkinan sebab |
|---|---|
| Start gagal, error soal `.node` | binari onnxruntime tak terunduh — ulangi `npm install` dengan install script diizinkan |
| Proses mati saat load, tanpa pesan | RAM kurang. Turunkan ke `BGE_M3_DTYPE=q8` |
| `/v1/models` → 401 dari VPS sendiri | `EMBEDDING_TOKEN` di systemd beda dengan yang kamu pakai di curl |
| Dashboard menolak alamat | alamatnya bukan `https://` — TLS di langkah 5 belum jalan |
| Unduhan bobot berhenti di tengah | hapus `MODEL_CACHE_DIR` lalu ulangi `npm run warm` |

Jangan menonaktifkan pemeriksaan token atau memaksa HTTP polos untuk
"sementara supaya jalan dulu". Kalau tersendat di TLS, laporkan ke user —
jangan dilewati.

Detail arsitektur & alasannya ada di `README.md` (folder ini) dan
`docs/MODEL-HOSTING.md` (root repo).
