# Runbook — Cadangan & Pemulihan

Untuk dibaca saat sesuatu sudah terjadi, bukan sebelum. Karena itu urutannya
mulai dari "apa yang rusak", bukan dari penjelasan.

Fakta produksi per 31 Juli 2026: Neon PostgreSQL 17.10, basis data `neondb`,
**14 MB**, 30 tabel, 99 indeks, 35 kebijakan RLS, RLS aktif di 22 tabel.
Angka-angka itu tercatat di `docs/dr-baseline.json` dan diperiksa
`npm run dr:verify`.

---

## 1. Yang rusak apa?

| Gejala | Ke bagian |
|---|---|
| Data terhapus / salah diubah (DELETE atau UPDATE keliru) | [2 · PITR](#2--pulihkan-ke-titik-waktu-pitr) |
| Skema rusak setelah `db:push` | [3 · Bangun ulang bentuk](#3--bangun-ulang-bentuk-tanpa-menyentuh-data) |
| Aplikasi jalan tapi semua kueri kosong | [4 · Peran & RLS](#4--kueri-kosong-padahal-datanya-ada) |
| Basis data hilang seluruhnya | [2](#2--pulihkan-ke-titik-waktu-pitr) lalu [3](#3--bangun-ulang-bentuk-tanpa-menyentuh-data) |

---

## 2 · Pulihkan ke titik waktu (PITR)

Neon menyimpan riwayat dan bisa membuat **branch** dari titik waktu mana pun di
dalam jendela retensinya. Yang penting: **jangan memulihkan ke atas basis data
produksi.** Buat branch baru, periksa isinya, baru alihkan.

1. Buka Neon Console → project → **Branches** → *Create branch*.
2. Pilih **Time travel** dan isi waktu **sebelum** kerusakan.
3. Beri nama yang menyebut sebabnya, mis. `pulih-2026-07-31-hapus-dokumen`.
4. Ambil connection string branch itu dan periksa dengan mata sendiri:

   ```bash
   psql "<connection-string-branch>" -c \
     "select count(*) from documents where deleted_at is null;"
   ```

5. Baru setelah angkanya masuk akal, alihkan aplikasi ke branch itu
   (ganti `DATABASE_URL` & `DATABASE_URL_UNPOOLED` di Vercel), atau salin baris
   yang hilang kembali ke produksi.

> **Jendela retensi PITR adalah batas paling keras di seluruh dokumen ini.**
> Di luar jendela itu tidak ada apa pun yang bisa dipulihkan. Periksa
> pengaturannya di Neon Console → *Settings → History retention* dan naikkan
> bila menurutmu terlalu pendek. Ini keputusan biaya, bukan keputusan teknis.

**Soft delete lebih dulu.** Sebelum menempuh PITR, ingat bahwa produk ini tak
pernah menghapus permanen: hampir semua "hilang" sebenarnya `deleted_at`
terisi, dan tiap sumber daya punya `GET /api/{resource}/trashed` +
`PATCH /api/{resource}/{id}/restore`. Memulihkan lewat aplikasi jauh lebih
murah dan tak berisiko dibanding memulihkan basis data.

---

## 3 · Bangun ulang bentuk, tanpa menyentuh data

Pada basis data **baru dan kosong**:

```bash
npm run db:push        # tabel & indeks dari schema.ts (DB BARU saja)
npm run db:migrate     # pgvector, kebijakan RLS, perubahan bertahap
npm run db:setup-role  # peran aplikasi nalar_app (NOBYPASSRLS) + grant
npm run dr:verify      # bandingkan hasilnya dengan patokan yang di-commit
```

Urutannya menentukan: `db:setup-role` memberi grant pada **tabel yang sudah
ada**, jadi ia harus terakhir.

> **`db:push` TIDAK BOLEH dijalankan pada basis data produksi yang sudah
> berisi.** Ia menyelaraskan basis data dengan `schema.ts` dan membuang apa
> pun yang tak dideklarasikan di sana. Di proyek ini ia sudah tiga kali
> merusak produksi: menghapus seluruh indeks unik parsial, mematikan RLS di
> setiap tabel tenant, lalu menghapus SELURUH kebijakan RLS. Pemulihannya
> selalu `npm run db:migrate`. Untuk basis data berisi, perubahan skema hanya
> lewat `migrations/*.sql`.

---

## 4 · Kueri kosong padahal datanya ada

Gejala yang paling menyesatkan: aplikasi berjalan normal, tak ada satu galat
pun, tapi daftar-daftarnya kosong. Hampir selalu ini soal peran.

```bash
psql "$DATABASE_URL_UNPOOLED" -c \
  "select rolname, rolbypassrls from pg_roles where rolname in ('neondb_owner','nalar_app');"
```

- Aplikasi **harus** menyambung sebagai `nalar_app` (`rolbypassrls = f`).
- Menyambung sebagai pemilik (`neondb_owner`) membuat Postgres **melewati
  seluruh RLS** — diam-diam. Isolasi tenant mati tanpa gejala apa pun.
- Sebaliknya, kalau `nalar_app` ada tapi kebijakannya hilang, RLS menolak
  segalanya dan semua daftar jadi kosong. Jalankan `npm run db:migrate`.

Hitung cepat:

```bash
psql "$DATABASE_URL_UNPOOLED" -c "select count(*) from pg_policies where schemaname='public';"
```

Harus **35**. Kurang dari itu, jalankan `db:migrate`.

---

## 5 · Sebelum hari buruk: jalankan `dr:verify`

```bash
npm run dr:verify              # bandingkan produksi dengan patokan
npm run dr:verify -- --tulis   # perbarui patokan (lakukan SADAR, lalu commit)
```

Skrip ini membandingkan bentuk basis data yang hidup dengan
`docs/dr-baseline.json`. Setiap selisih berarti pemulihan akan menghasilkan
basis data yang **berbeda** dari produksi sekarang — dan itulah yang membuat
pemulihan gagal justru setelah tampak berhasil.

Perbarui patokan **hanya bersama** perubahan skema yang disengaja, di commit
yang sama. Memperbaruinya untuk "membuat skripnya hijau" menghapus satu-satunya
gunanya.

---

## 6 · Yang BELUM pernah diuji

Ditulis apa adanya, karena runbook yang menyembunyikan bagian ini justru paling
berbahaya.

- **Latihan pemulihan sungguhan belum pernah dijalankan.** Prosedur di bagian 2
  disusun dari kemampuan Neon dan bentuk sistem ini, bukan dari percobaan.
  Tidak ada kredensial Neon API di lingkungan pengembangan, dan memulihkan ke
  produksi jelas bukan cara mengujinya. **"Pemulihan yang belum pernah dicoba
  bukan pemulihan"** — kalimat itu masih berlaku untuk dokumen ini.
- Yang sudah dibuktikan hanyalah bahwa **bentuk**nya bisa dibangun ulang dari
  repo (`dr:verify`, nol selisih pada 31 Juli 2026). Bahwa **datanya** bisa
  dipulihkan belum dibuktikan siapa pun.
- **Cara mengujinya tanpa risiko**: buat branch Neon dari titik waktu kemarin,
  arahkan salinan aplikasi ke sana, jalankan `npm run smoke`, lalu hapus
  branch-nya. Butuh akses Neon Console — itu langkah manusia, bukan langkah
  yang bisa diotomasi dari repo ini.
- **Yang tidak dicakup**: berkas model embedding di Vercel Blob (bisa diunggah
  ulang dengan `npm run models:push`), dan rahasia di env Vercel — termasuk
  `CREDENTIALS_ENCRYPTION_KEY`, yang **hilangnya tak bisa dipulihkan dari
  cadangan basis data mana pun**: setiap kunci API penyedia yang tersimpan
  berubah jadi data acak dan harus dimasukkan ulang satu per satu.
