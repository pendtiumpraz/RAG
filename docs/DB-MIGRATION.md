# Memindahkan basis data Nalar

Panduan memindahkan Postgres Nalar ke penyedia lain — Neon → Hostinger, → AWS
RDS, → VPS sendiri, atau sebaliknya. Keputusan arsitekturnya: **D15** di
`architecture-decisions.md`.

Nalar **tidak terikat penyedia mana pun**: lapisan basis datanya hanya
`postgres.js` + `DATABASE_URL`, tanpa satu pun API khas Neon. Yang berbahaya
bukan pemindahannya, melainkan pindah ke basis data yang ternyata tak
memenuhi syarat — dan itu baru ketahuan setelah semuanya terlanjur diarahkan
ke sana.

---

## Jawaban singkat: backup-restore, bukan salin langsung

Untuk pemindahan **seluruh platform**, urutannya:

1. **Periksa tujuan** (`db:probe`) — sebelum apa pun disentuh
2. **Siapkan skema** (`db:target`) — migrasi dijalankan di tujuan
3. **Pindahkan data** dengan `pg_dump` / `pg_restore`
4. **Bangun indeks vektor** — SESUDAH data masuk, bukan bersamaan
5. **Buat peran `nalar_app`** di tujuan
6. **Baru** arahkan `DATABASE_URL`

Kenapa backup-restore dan bukan salin langsung (`pg_dump | psql`):

| | Salin langsung | Dump ke berkas → restore |
|---|---|---|
| Ruang disk | tak perlu | perlu, ±ukuran basis data |
| Gagal di tengah | **mulai dari nol** | lanjutkan dari berkas yang sama |
| Bisa diperiksa dulu | tidak | ya — berkasnya ada |
| Cocok untuk | < 5 GB | selebihnya |

Basis data Nalar didominasi tabel `documents`, dan tiap potongan menempati
±8,2 KB. Satu juta potongan sudah ±8 GB. Di atas ukuran itu, kegagalan di
menit ke-40 yang memaksa mengulang dari awal bukan risiko yang perlu diambil
demi menghemat satu berkas.

**Ya — seluruh data tenant ikut berpindah.** Pemindahan tingkat platform
memindahkan seluruh basis data, jadi semua tenant beserta dokumen, vektor,
percakapan, dan catatan Memory-nya ikut. Tidak ada yang perlu dipilih.

(Memindahkan **satu tenant saja** ke basis datanya sendiri adalah persoalan
yang berbeda dan jauh lebih rumit — lihat bagian terakhir.)

---

## Langkah

### 1. Periksa tujuan

```bash
npm run db:probe -- "postgres://user:sandi@host:5432/nalar"
```

Yang diperiksa, dan kenapa masing-masing penting:

| Pemeriksaan | Kenapa |
|---|---|
| **Enkripsi koneksi** | TLS menyala untuk host publik apa pun. Kalau mati, isi dokumen pelanggan menyeberang internet sebagai teks polos |
| **Versi ≥ 15** | Beberapa migrasi memakai sintaks yang lebih baru |
| **pgvector** | Tanpa ini pencarian makna mustahil — dan gagalnya baru terasa pada ingest pertama |
| **Peran koneksi** | Peran yang bisa **melewati RLS** mematikan isolasi antar pelanggan **diam-diam**. Ini pernah terjadi sungguhan di proyek ini |
| **Hak akses** | Peran aplikasi butuh tulis-data; peran migrasi butuh ubah-skema. Keduanya berbeda |

Pemeriksaannya memakai `has_*_privilege` dan **tidak membuat tabel apa pun**,
jadi aman dijalankan terhadap produksi.

Untuk menilai koneksi **migrasi** (yang memang berhak penuh):

```bash
npm run db:probe -- "postgres://admin:sandi@host:5432/nalar" --admin
```

### 2. Siapkan skema di tujuan

```bash
npm run db:target -- "postgres://admin:sandi@host:5432/nalar"
```

Menjalankan seluruh berkas `migrations/*.sql` terhadap **tujuan**, bukan
terhadap `DATABASE_URL` yang sedang berjalan. Berhenti pada galat pertama —
skema separuh jadi lebih buruk daripada tak ada skema sama sekali.

### 3. Pindahkan data

```bash
# dari sumber — hanya DATA, tanpa skema (skemanya sudah dibuat langkah 2)
pg_dump "postgres://...sumber..." \
  --data-only --no-owner --no-acl \
  --exclude-table=drizzle_migrations \
  -Fc -f nalar-data.dump

# ke tujuan
pg_restore -d "postgres://...tujuan..." \
  --data-only --no-owner --no-acl \
  --disable-triggers \
  -j 4 nalar-data.dump
```

Tiga hal yang mudah salah:

- **`--data-only`** — skemanya sudah dari migrasi kita, yang selalu benar dan
  idempoten. Membiarkan `pg_dump` membawa skemanya sendiri berarti kebijakan
  RLS dan indeks parsial ikut dibawa dalam bentuk yang belum tentu sama.
- **`--no-owner --no-acl`** — nama peran di tujuan hampir pasti berbeda.
  Tanpa ini, restore gagal pada baris pertama yang menyebut pemilik.
- **Kolom tergenerasi** (`doc_ref`, `fts`) **tidak ikut di-dump** dan dihitung
  ulang oleh Postgres di tujuan. Itu memang yang benar — jangan mencoba
  memaksanya ikut.

### 4. Bangun ulang indeks vektor

Ini yang paling sering dilewatkan dan paling mahal akibatnya.

Indeks HNSW yang sudah ada saat data masuk membuat setiap baris menyisipkan
dirinya ke dalam graf satu per satu — pada jutaan potongan itu berjam-jam.
Membangunnya **setelah** data lengkap jauh lebih cepat karena Postgres
menyusunnya sekaligus.

```bash
# di tujuan, SEBELUM restore: buang indeks vektornya
psql "postgres://...tujuan..." -c "
  drop index if exists idx_documents_embedding;
  drop index if exists idx_documents_dims_384;
  drop index if exists idx_documents_dims_768;
  drop index if exists idx_documents_dims_1024;
"

# … jalankan restore (langkah 3) …

# lalu bangun ulang — migrasinya idempoten, jadi cukup jalankan lagi
DATABASE_URL="postgres://admin:...tujuan..." npm run db:migrate
```

Sesudahnya, satu hal yang wajib:

```sql
analyze documents;
```

Tanpa `analyze`, perencana kueri bekerja dengan statistik kosong dan bisa
memilih rencana yang jauh lebih lambat — gejalanya "basis data barunya kok
lebih pelan", padahal yang kurang cuma ini.

### 5. Buat peran aplikasi

```bash
DATABASE_URL="postgres://admin:sandi@host:5432/nalar" npm run db:setup-role
```

Membuat peran `nalar_app` yang **NOBYPASSRLS**. Aplikasi menyambung sebagai
peran ini, tak pernah sebagai pemilik basis data.

### 6. Alihkan

```bash
npm run db:probe -- "postgres://nalar_app:sandi@host:5432/nalar"
```

Harus **seluruhnya hijau** sebagai koneksi aplikasi. Baru setelah itu ubah
`DATABASE_URL` di lingkungan produksi.

Jalankan `npm run smoke` sesudahnya — ia menguji isolasi tenant terhadap basis
data yang sebenarnya, dan itulah pemeriksaan terakhir yang berarti.

---

## Sesudah pindah

`DATABASE_URL` lama **jangan langsung dihapus**. Simpan basis data sumber
dalam keadaan hidup tapi tak terpakai selama beberapa hari; ia satu-satunya
jalan pulang bila ada yang terlewat.

Yang perlu diperhatikan di penyedia non-Neon:

- **Backup bukan lagi otomatis.** Neon menyediakan point-in-time recovery;
  VPS tidak. Siapkan `pg_dump` terjadwal sebelum pindah, bukan sesudah.
- **`max` koneksi.** Nilai di `core/db/index.ts` adalah 1 di Vercel dan 10 di
  server biasa. VPS kecil sering berbatas 100 koneksi total — cukup, tapi
  perlu dilihat kalau ada layanan lain di mesin yang sama.
- **pgbouncer.** `prepare: false` sudah dipasang dan aman untuk semua kasus,
  jadi tak ada yang perlu diubah.

---

## Memindahkan SATU tenant saja

Berbeda sama sekali, dan **belum dibangun** (D15 tingkat 3).

`pg_dump` tak bisa menolong: yang dibutuhkan adalah penyaringan per baris
berdasarkan `tenant_id` di ±25 tabel, dalam urutan ketergantungan yang harus
dijaga aplikasi karena proyek ini **sengaja tanpa foreign key**. Menyalin
tabel dalam urutan yang salah menghasilkan basis data yang tampak lengkap
tapi punya baris yatim di mana-mana.

Ia butuh skrip ekspor tersendiri yang menelusuri urutan itu, plus penanganan
`vector` dan kolom tergenerasi. Sekali dibuat ia berlaku untuk semua tenant —
tapi ia pekerjaan tersendiri, bukan varian dari panduan di atas.
