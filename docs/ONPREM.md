# Instalasi On-Premise

Panduan ini ditujukan untuk tim IT yang memasang Nalar di server sendiri —
tanpa bantuan kami, dan bila perlu tanpa internet sama sekali.

Setiap perintah di bawah ada di `package.json`, dan setiap variabel ada di
`.env.example`. Ada tes yang gagal bila salah satunya hilang, supaya panduan
ini tak bisa diam-diam menyimpang dari kodenya.

---

## 1. Yang dibutuhkan

| | Minimum | Catatan |
|---|---|---|
| CPU | 4 core | Embedding lokal memakai CPU, bukan GPU |
| RAM | 8 GB | Model MiniLM 22 MB muat lapang; model besar butuh lebih |
| Disk | 20 GB + korpus | Lihat perhitungan di bagian 6 |
| Docker | Compose v2 | `docker compose version` harus ≥ 2 |

Postgres 17 + pgvector sudah ikut di dalam tumpukan. Tak perlu memasangnya
sendiri.

---

## 2. Pasang

```bash
cp .env.example .env
# WAJIB diubah sebelum lanjut — lihat bagian 3.
nano .env

docker compose up -d
docker compose logs -f app     # tunggu "ready"
```

Buka `http://localhost:3000`.

**Apa yang terjadi saat itu.** `docker compose up` menjalankan tiga layanan
berurutan, bukan dua:

1. `db` — Postgres 17 + pgvector.
2. `setup` — membuat tabel (`db:push`), memasang ekstensi pgvector dan
   kebijakan RLS (`db:migrate`), lalu membuat peran aplikasi `nalar_app`
   (`db:setup-role`). Layanan ini **berhenti sendiri** setelah selesai dan
   aman dijalankan ulang.
3. `app` — aplikasinya, menyala hanya setelah `setup` sukses.

Sebelum panduan ini ditulis, langkah 2 tidak ada sama sekali: `docker compose
up` menyalakan aplikasi di atas basis data kosong, dan berkas penyiapannya
bahkan tak ikut disalin ke dalam image — jadi tak ada cara memperbaikinya dari
dalam kontainer.

---

## 3. Variabel yang WAJIB diubah

Empat baris ini menentukan apakah pemasanganmu aman atau hanya tampak aman.

```bash
# Rahasia sesi. Buat baru — JANGAN pakai contoh bawaan.
NEXTAUTH_SECRET=$(openssl rand -base64 32)

# Kunci enkripsi kunci API penyedia model (AES-256-GCM).
# HILANG = seluruh kunci API tersimpan tak bisa dibaca lagi. Cadangkan.
CREDENTIALS_ENCRYPTION_KEY=$(openssl rand -base64 32)

# Alamat yang benar-benar dipakai pengguna. Salah isi = alur login gagal
# dengan galat yang tak menjelaskan apa pun.
NEXTAUTH_URL=https://nalar.perusahaanmu.co.id

# Satu organisasi, tanpa pendaftaran mandiri.
DEPLOYMENT_MODE=onprem
```

Kata sandi peran aplikasi diatur lewat `APP_PW` (bawaan `nalar_app_pw`).
Ubah pada pemasangan sungguhan:

```bash
APP_PW='kata-sandi-panjang-dan-acak' docker compose up -d
```

`CREDENTIALS_ENCRYPTION_KEY` **tidak bisa dipulihkan**. Kehilangannya tidak
merusak basis data, tapi setiap kunci API penyedia yang tersimpan berubah jadi
data acak dan harus dimasukkan ulang satu per satu.

---

## 4. Membuktikan isolasi tenant benar-benar menyala

Ini pemeriksaan yang paling layak dilakukan, karena kegagalannya **tidak
menimbulkan gejala apa pun**: aplikasinya berjalan normal, jawabannya benar,
dan tak ada satu baris log pun yang berbeda.

```bash
docker compose exec db psql -U rag -d rag -c \
  "select rolname, rolbypassrls from pg_roles where rolname in ('rag','nalar_app');"
```

Yang benar:

```
  rolname   | rolbypassrls
------------+--------------
 rag        | t              ← pemilik; MELEWATI RLS
 nalar_app  | f              ← peran aplikasi; TUNDUK pada RLS
```

Lalu pastikan aplikasinya memakai yang kedua:

```bash
docker compose exec app printenv DATABASE_URL
# harus diawali postgres://nalar_app:
```

Kalau `DATABASE_URL` aplikasi memakai `rag`, seluruh kebijakan RLS yang
dipasang migrasi 0001 **tidak berlaku** — Postgres melewatinya untuk pemilik
tabel, diam-diam dan tanpa galat.

Hitung kebijakannya:

```bash
docker compose exec db psql -U rag -d rag -c \
  "select count(*) from pg_policies where schemaname='public';"
```

Angkanya harus puluhan, bukan nol.

---

## 5. Model embedding tanpa internet

Mode on-premise dirancang bisa berjalan terputus dari internet, tapi **model
embedding harus sudah ada sebelum kabelnya dicabut**.

- Model lokal (ONNX) diunduh sekali lalu disinggahkan di volume
  `modelcache`. Jalankan satu sinkronisasi dokumen selagi masih daring; setelah
  itu berkasnya dipakai ulang lintas restart.
- Model lewat API (OpenAI, Cohere) **tidak** bisa dipakai tanpa internet.
  Pilih model lokal di halaman *Models & Keys* bila jaringanmu tertutup.
- LLM-nya juga perlu dipikirkan: tanpa internet, penyedia awan tak terjangkau.
  Arahkan ke server LLM sendiri yang berbicara protokol OpenAI (halaman
  *Models & Keys* → server LLM).

### 5a. Menjalankan LLM di jaringanmu sendiri

Contoh dengan Ollama, tapi vLLM / LM Studio / LocalAI / llama.cpp sama saja —
semuanya melayani `/v1/chat/completions`:

```bash
ollama serve                      # mendengarkan di :11434
ollama pull qwen3:8b
```

Lalu di **Models & Keys → server LLM sendiri (on-premise)** → *Tambah server*:

```
Nama      : Ollama internal
Base URL  : http://10.0.0.5:11434/v1     ← sampai /v1, bukan lebih
Token     : (kosongkan — lazim tanpa auth di jaringan tertutup)
```

Tekan **Test koneksi**. Model yang dilaporkan server langsung muncul di
dropdown *model chat aktif*; tak ada daftar yang perlu ditulis tangan.

> Dari dalam kontainer `app`, `localhost` menunjuk kontainer itu sendiri —
> bukan host. Pakai alamat IP host di jaringanmu, atau
> `host.docker.internal` bila platform Docker-mu menyediakannya.

### 5b. Embedding di server terpisah (opsional)

Model besar (BGE-M3 presisi penuh, 2,16 GB) tak masuk akal dimuat di dalam
kontainer aplikasi. `services/embedding-server/` adalah paket terpisah yang
memuat bobotnya **sekali saat start** lalu melayaninya lewat HTTP:

```bash
EMBEDDING_SELFHOSTED_URL=https://embed.internal.perusahaan.co.id
EMBEDDING_SELFHOSTED_TOKEN=<opsional>
```

Klien **menolak URL non-`https`** kecuali loopback, dan itu disengaja: yang
melintas ke sana adalah **isi dokumen tenant**. Isolasi dijaga ketat sampai
level basis data; mengirim teksnya lewat HTTP polos ke IP publik membocorkan
semuanya di satu titik yang tak dijaga. Pasang TLS di depannya (Caddy/nginx).

Panduannya: `services/embedding-server/SETUP-VPS.md`.

### 5c. Reranker sendiri (opsional, mati secara bawaan)

Lapisan penilai ulang yang membaca pertanyaan dan potongan **bersamaan**,
jadi lebih tepat menilai mana yang benar-benar menjawab. Untuk pemasangan
yang tak boleh ada teks dokumennya keluar jaringan, sediakan endpoint
`/rerank` sendiri:

```bash
RERANK_SELFHOSTED_URL=https://rerank.internal.perusahaan.co.id
RERANK_SELFHOSTED_TOKEN=<opsional>
```

Lalu pilih **Server sendiri (on-premise)** di *Models & Keys → reranker*.

Penjagaan `https`-nya sama persis dengan server embedding, dan alasannya juga
sama. Bawaannya **mati** — ia membeli ketepatan pada sebagian permintaan
dengan biaya latensi yang ditanggung semua permintaan, jadi nyalakan hanya
bila kamu melihat jawaban sering meleset padahal dokumennya ada.

### 5d. Korpus sangat besar: kuantisasi biner

Untuk korpus ratusan ribu potongan ke atas, lapisan penyaring biner
memperkecil indeks pencarian ±32×. Jarak Hamming hanya **mempersempit
kandidat**; jarak eksak tetap yang menentukan urutan akhir — jadi ketepatannya
tidak ditukar.

Nyalakan di **Settings → kuantisasi biner** (superadmin). Ia mengabaikan
dirinya sendiri pada korpus kecil, karena di sana ia justru merugikan.

Buktikan aman di korpusmu sendiri sebelum mengandalkannya:

```bash
npm run bench:biner
```

Ia membandingkan hasil dua tahap dengan **pemindaian penuh** — bukan dengan
indeks HNSW, yang juga aproksimasi — dan membandingkannya lewat **jarak**,
bukan ID, karena korpus dengan dokumen kembar membuat perbandingan ID
melaporkan "meleset" untuk urutan seri yang sama benarnya.

---

## 6. Berapa disk yang perlu disiapkan

Angkanya terukur di produksi, bukan diperkirakan
(`src/modules/core/limits.ts`):

- satu potongan teks ≈ **2.852 byte** baris + **804 byte** indeks
- satu dokumen ≈ **10 potongan**

Jadi 10.000 dokumen ≈ 100.000 potongan ≈ **±366 MB** untuk baris dan indeks.
Yang membuatnya membesar bukan jumlah dokumen melainkan panjangnya: rasio teks
terhadap ukuran berkas sumber biasanya 2–3%, jadi 700 GB SharePoint menghasilkan
±15–20 GB teks, bukan 700 GB.

Sediakan disk untuk basis data **plus** ruang lega untuk WAL dan cadangan.
20 GB cukup untuk puluhan ribu dokumen; ratusan ribu dokumen menuntut NVMe.

---

## 7. Memutakhirkan versi

```bash
git pull
docker compose build
docker compose up -d
```

Layanan `setup` berjalan lagi dan idempoten — `db:push` menyesuaikan skema,
`db:migrate` melewati migrasi yang sudah pernah dijalankan.

> **Untuk pemasangan sungguhan, cadangkan basis data dulu.** `db:push`
> menyelaraskan basis data dengan `schema.ts`, dan pada basis data yang sudah
> berisi ia bisa membuang hal-hal yang tak dideklarasikan di sana.

### 7a. Cadangan on-premise

Prosedur pemulihannya ada di **[RUNBOOK.md](RUNBOOK.md)** — dibaca saat
sesuatu sudah rusak, disusun mulai dari gejala. Tapi satu bagiannya **tidak
berlaku di sini**: pemulihan titik-waktu di sana memakai PITR Neon, dan
`npm run dr:drill` bicara dengan API Neon. Pemasangan on-premise memakai
Postgres sendiri, jadi cadangannya juga milikmu sendiri:

```bash
# Cadangan penuh, terkompresi
docker compose exec -T db pg_dump -U rag -Fc rag > nalar-$(date +%F).dump

# Pulihkan ke basis data kosong
docker compose exec -T db pg_restore -U rag -d rag --clean --if-exists < nalar-2026-08-02.dump
```

Dua hal yang mudah terlewat, dan keduanya membuat cadangan jadi tak berguna
tepat saat dibutuhkan:

1. **`CREDENTIALS_ENCRYPTION_KEY` tidak ada di dalam dump.** Ia di `.env`.
   Kehilangannya membuat setiap kunci API penyedia yang tersimpan berubah jadi
   data acak, dan **tak ada cadangan basis data yang bisa memulihkannya**.
   Cadangkan `.env` terpisah, di tempat yang berbeda.
2. **Cadangan yang belum pernah dipulihkan bukan cadangan.** Latih memulihkan
   ke basis data kosong, lalu jalankan `npm run dr:verify` untuk membandingkan
   bentuknya dengan patokan yang di-commit di repo.

Bentuk skema bisa dibuktikan ulang kapan saja tanpa menyentuh data:

```bash
npm run dr:verify
```

---

## 8. Yang panduan ini BELUM cakup

Ditulis apa adanya supaya tak ditemukan belakangan:

- **Mekanisme lisensi** — belum ada. Tak ada kunci lisensi, tak ada
  pemeriksaan masa berlaku, tak ada batas jumlah pemakai pada mode on-premise.
  Bentuknya keputusan bisnis, bukan keputusan teknis.
- **HTTPS** — tumpukan ini melayani HTTP polos di port 3000. Pasang reverse
  proxy (nginx/Caddy/Traefik) di depannya. Login akan berperilaku aneh bila
  `NEXTAUTH_URL` menyebut `https` sementara proxy-nya belum ada.
- **Cadangan & pemulihan** — lihat catatan di bagian 7.
- **Ketersediaan tinggi** — susunan ini satu simpul. Postgres dan aplikasinya
  masing-masing satu proses.
