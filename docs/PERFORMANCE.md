# Performa & Kapasitas Retrieval

> Diukur 2026-07-27 terhadap Neon produksi (PG 17.10, pgvector 0.8.0,
> shared_buffers 128 MB). Ulangi kapan saja: `npm run bench`.

Semua angka di bawah hasil pengukuran, bukan perkiraan. Skripnya
(`scripts/bench-retrieval.ts`) menjalankan query yang **sama persis** dengan
`retrieval.service` — di bawah `withTenant()` sehingga RLS ikut aktif — lalu
menghapus data ujinya sendiri.

---

## 1. Latensi retrieval

3.000 chunk tersebar di 6 chatbot; yang dikueri satu chatbot (±17% isi tabel):

| Isi tabel | DB p50 | DB p95 |
|---|---|---|
| 750 chunk | 1,2 ms | 1,3 ms |
| 1.500 chunk | 2,2 ms | 2,4 ms |
| 3.000 chunk | 4,5 ms | 5,3 ms |

`Index Scan` terkonfirmasi — HNSW memang dipakai.

### Temuan: latensinya tumbuh LINEAR, bukan logaritmik

Data dua kali lipat ⇒ latensi dua kali lipat (1,2 → 2,2 → 4,5 ms). HNSW
sendirian seharusnya mendekati O(log n). Yang membuatnya linear adalah
**post-filter**: index HNSW hanya ada pada kolom `embedding`, sedangkan query
memfilter `chatbot_id` + `embedding_model`. Postgres menelusuri indeks lalu
membuang baris yang tak cocok — jadi makin kecil porsi chatbot target
terhadap isi tabel, makin banyak yang harus ditelusuri untuk mendapat 6 hasil.

Ini bentuk beban khas SaaS multi-tenant: yang menentukan bukan "berapa juta
vektor", melainkan **seberapa kecil porsi satu chatbot di dalam tabel**.

Ekstrapolasi dari kurva di atas:

| Isi tabel | perkiraan p50 | keterangan |
|---|---|---|
| 30.000 chunk | ± 45 ms | batas plan Neon 512 MB — masih nyaman |
| 100.000 chunk | ± 150 ms | mulai terasa di chat |
| 500.000 chunk | ± 750 ms | tak layak |

**Kapan ini perlu ditangani:** saat satu instance mendekati ~100.000 chunk.
Sebelum itu, biaya rekayasanya tak terbayar.

**Pilihan penanganannya** (belum dikerjakan — perlu keputusan user):
partisi tabel `documents` per `chatbot_id` sehingga tiap partisi punya HNSW
sendiri dan filter berubah jadi partition pruning; atau `hnsw.iterative_scan`
(tersedia di pgvector 0.8) yang memperbaiki recall di bawah filter.

---

## 2. Ukuran per baris — dan pemborosan 4×

Terukur: **16,6 KB per chunk** (3.000 chunk → 48,6 MB: heap 608 kB +
index HNSW 24 MB + TOAST 24 MB).

Heap-nya kecil karena vektor 1536 dimensi (6,1 KB) melebihi ambang dan
di-TOAST keluar dari heap. Index HNSW menyimpan salinan vektornya sendiri —
itu sebabnya index dan TOAST hampir sama besar.

**Pemborosannya nyata:** model default `all-MiniLM-L6-v2` menghasilkan **384
dimensi = 1,5 KB**, tapi disimpan sebagai 1536 dimensi = 6,1 KB karena
di-zero-pad agar satu kolom melayani semua model. **Tiga perempat ruang
vektor berisi nol.**

| | per chunk | muat di 512 MB |
|---|---|---|
| sekarang (pad 1536) | 16,6 KB | ± 30.000 chunk |
| kalau MiniLM pakai kolom 384 dim | ± 4,6 KB | ± 110.000 chunk |

Jadi kapasitas bisa naik **±3,6×** tanpa ganti paket. Harganya: kolom/tabel
terpisah per dimensi, karena pgvector mengunci satu dimensi per kolom.
Trade-off ini sudah tercatat di README sebagai TODO "partial index per
dimensi" dan sengaja belum dikerjakan.

Dalam ukuran teks sumber: 30.000 chunk × ~680 karakter ≈ **20 MB teks bersih
untuk SELURUH tenant** di plan 512 MB. Itulah batas nyata yang berlaku
sekarang — jauh lebih mengikat daripada kuota penyimpanan file mana pun.

---

## 3. Yang TIDAK diukur di sini

**Latensi jaringan.** Dijalankan dari Indonesia ke Neon us-east-1, wall-clock
tiap query ±1.700 ms, sementara sisi database hanya 4,5 ms. Selisihnya murni
jarak, ditambah `withTenant()` yang membuka transaksi (BEGIN + set_config +
SELECT + COMMIT = 4 perjalanan bolak-balik). Di produksi hal ini tidak
berlaku karena Vercel dan Neon berada di region yang sama — karena itu yang
dilaporkan di atas adalah waktu server, bukan wall-clock.

Kalau nanti aplikasi dipindah ke region berbeda dari database, keempat
perjalanan itu langsung terasa: pertimbangkan menyatukan region sebelum
mengoptimasi apa pun yang lain.

**Beban LLM & embedding.** Jalur chat penuh melibatkan panggilan berbayar ke
penyedia model; membebaninya berarti membakar kuota tanpa menghasilkan
informasi baru tentang sistem kita sendiri. Benchmark ini sengaja memakai
vektor acak agar yang teruji murni perilaku indeks.

---

## Cara menjalankan

```bash
npm run bench                                   # 2.000 chunk, 4 bot, 60 query
npm run bench -- --chunks=10000 --bots=8        # skala lebih besar
npm run bench -- --keep                         # sisakan datanya untuk diperiksa
```

Skripnya membuat tenant sintetis, mengukur bertahap, lalu **menghapus
datanya permanen + VACUUM FULL** supaya ruangnya benar-benar kembali —
`DELETE` saja hanya menandai ruang bisa dipakai ulang dan tabel tetap
tercatat puluhan MB. Diverifikasi: 25 MB → 576 kB, DB kembali ke 1,9% kuota.
