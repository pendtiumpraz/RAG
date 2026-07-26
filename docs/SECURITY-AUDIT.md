# Audit Keamanan Dependensi

> Diperbarui 2026-07-27. Sumber: `npm audit --omit=dev`.
> Job `audit` di CI menjalankannya tiap push (non-blocking, tapi terlihat).

Dokumen ini ada supaya "13 kerentanan" tidak jadi angka yang diabaikan
diam-diam. Tiap temuan ditelusuri sampai **apakah jalurnya benar-benar
dieksekusi** di deployment ini — bukan sekadar dihitung.

---

## ✅ Diperbaiki

### drizzle-orm — SQL injection lewat identifier yang tak di-escape (HIGH)

Ini satu-satunya temuan yang berada **persis di jalur query kita**: seluruh
akses database melewati Drizzle. Dinaikkan `^0.38.0` → **`^0.45.2`**
(+ drizzle-kit `^0.31.10`).

Diverifikasi setelah upgrade: build lulus, 24/24 unit test, dan `smoke`
LULUS terhadap Neon nyata — termasuk isolasi RLS, ingest→embed→pgvector→
retrieve (skor tetap 0.752), delta sync, gerbang verifikasi, dan jalur
publik widget embed.

---

## 🟡 Tersisa — ditelusuri, jalurnya TIDAK dieksekusi

Ketiganya transitif dan tak bisa diperbaiki tanpa upgrade major yang justru
berisiko memecah runtime embedding. Yang menentukan keputusan bukan tingkat
keparahannya, melainkan apakah kodenya pernah jalan.

| Paket | Tingkat | Masuk lewat | Kenapa tak dieksekusi |
|---|---|---|---|
| `protobufjs` ≤7.6.2 | **CRITICAL** | `@xenova/transformers` → `onnxruntime-web` → `onnx-proto` | `onnxruntime-**web**` adalah runtime WASM/browser. Embedding lokal kita berjalan di server lewat `onnxruntime-node`; tak ada satu pun kode yang mengimpor jalur web. |
| `sharp` <0.35.0 | HIGH | `@xenova/transformers` (model gambar) **dan** `next` (optimasi gambar) | Kita hanya melakukan embedding **teks** — model gambar tak pernah dimuat. Dan `next.config.mjs` menyetel `images: { unoptimized: true }`, jadi Next pun tak memanggil sharp. |
| `postcss` ≤8.5.17 | HIGH | `next` | Hanya dipakai saat **build**, memproses CSS milik kita sendiri. Ketiga CVE-nya butuh CSS yang dikendalikan penyerang. |
| `uuid` <11.1.1 | MODERATE | `googleapis`, `@azure/msal-node` | Cacatnya pada `v3/v5/v6` ketika parameter `buf` diberikan. Pustaka-pustaka itu memakai `v4()` tanpa `buf`. |

**Yang akan mengubah penilaian ini** — tinjau ulang bila salah satu terjadi:

- embedding lokal dijalankan di browser/WASM (mengaktifkan `onnxruntime-web`);
- model **gambar** ditambahkan ke registry (mengaktifkan `sharp`);
- `images.unoptimized` dimatikan di `next.config.mjs`;
- CSS dari pihak ketiga/pengguna ikut diproses saat build.

---

## Kenapa tidak `npm audit fix --force`

Perintah itu akan menurunkan `@xenova/transformers` ke **v1.4.2** (major,
mundur jauh) dan menaikkan `@azure/msal-node` ke v5 (major). Yang pertama
memecah seluruh jalur embedding lokal — termasuk model host di Vercel Blob
yang sudah terverifikasi jalan. Menukar runtime yang terbukti bekerja demi
menyenangkan pemindai, untuk kode yang tak pernah dieksekusi, bukan
peningkatan keamanan.

## Cara menjalankan sendiri

```bash
npm audit --omit=dev              # produksi saja (perkakas build tak ikut tayang)
npm ls <paket>                    # telusuri siapa penariknya
```
