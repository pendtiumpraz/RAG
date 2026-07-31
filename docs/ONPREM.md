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
> berisi ia bisa membuang hal-hal yang tak dideklarasikan di sana. Prosedur
> cadangan dan latihan pemulihan belum tertulis — itu kartu `a-runbook`, dan
> sampai selesai, cadangan adalah tanggung jawabmu sendiri.

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
