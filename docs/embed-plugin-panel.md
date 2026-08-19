# Panel Plugin Admin (Embed Plugin Panel)

Panel white-label untuk **pemilik situs** yang menyematkan chatbot Nalar di
landing page mereka. Lewat panel ini mereka mengelola knowledgebase, domain
embed, kuota, dan pembayaran chatbot-nya **tanpa** membuka dasbor Nalar utama —
memakai akun Nalar yang sama.

Semuanya **memakai ulang** mesin yang sudah ada (NextAuth, /api/chatbots,
/api/knowledge-bases, /api/billing, /api/payments TriPay). Tidak ada mesin auth
atau billing baru, tidak ada tabel/migrasi baru.

## URL

| Halaman | URL |
|---|---|
| Panel | `https://nalar.sainskerta.net/plugin` |

Satu halaman saja. State-nya internal (auth → pilih chatbot → tab Embed / KB /
Kuota). Dibuka langsung (standalone) atau di dalam `<iframe>`.

## Cara menyematkan panel di situs pemilik chatbot

```html
<iframe
  src="https://nalar.sainskerta.net/plugin"
  style="width:100%;min-height:720px;border:0"
  title="Panel Nalar"
></iframe>
```

Header `Content-Security-Policy: frame-ancestors *` sengaja dipasang untuk
`/plugin/*` (lihat `next.config.mjs`) supaya boleh dibingkai lintas origin —
sama seperti halaman chat `/c/*`. Sisa aplikasi tetap `X-Frame-Options: DENY`
(anti-clickjacking).

### Catatan penting soal sesi di dalam iframe

Cookie sesi NextAuth default-nya `SameSite=Lax`, jadi **tidak dikirim** pada
iframe lintas-situs (pihak ketiga) di peramban modern. Konsekuensinya, saat
di-iframe di domain lain:

- Panel **tetap berfungsi penuh bila dibuka langsung** di `…/plugin` (cookie
  first-party normal).
- Di dalam iframe lintas-situs, login/sesi hanya jalan bila peramban
  mengizinkan cookie pihak ketiga.

**Rekomendasi untuk pemilik situs** (pilih salah satu):

1. Taruh tautan "Kelola chatbot" yang membuka `…/plugin` di **tab/jendela baru**
   (paling andal), atau
2. Sematkan iframe dan andalkan izin cookie pihak ketiga peramban pengguna.

Memaksa `SameSite=None; Secure` secara global **sengaja tidak dilakukan** karena
mengubah postur CSRF seluruh aplikasi. Itu jalur upgrade bila nanti benar-benar
dibutuhkan, bukan default.

## Auth

- **Masuk**: kredensial akun Nalar yang sama (`signIn('credentials')`). Mendukung
  2FA — kolom kode muncul otomatis bila akun memakainya.
- **Daftar**: memanggil `POST /api/auth/signup` (satu signup = satu tenant baru,
  status `pending`). Sama seperti dasbor utama, akun baru **menunggu verifikasi
  superadmin** sebelum bisa masuk — panel menampilkan pesan "menunggu
  verifikasi", bukan mencoba auto-login.
- Sesi & isolasi tenant (RLS) identik dengan dasbor utama: semua endpoint yang
  dipanggil panel sudah dijaga `getCurrentUser()`/`requireRole()`.

## Alur setup embed (inti)

Tab **Embed** untuk chatbot terpilih:

1. **Public key** (`cb_live_…`) ditampilkan — aman diekspos, tak perlu diubah.
2. **Domain yang diizinkan (allowed origins)** — satu domain per baris. Input
   dinormalkan ke bentuk origin (`https://host`, tanpa path/slash) karena cek
   CORS di `/api/chat/[chatbotId]` mencocokkan header `Origin` persis. Disimpan
   lewat `PATCH /api/chatbots/{id}` (`allowedOrigins`). Kosong = izinkan semua.
3. **Snippet embed** dibuat otomatis dan bisa disalin:
   ```html
   <script src="https://nalar.sainskerta.net/embed.js" data-chatbot="cb_live_…"></script>
   ```
   `src` dibangun dari `window.location.origin` (panel dihosting di domain
   Nalar). Ini pola "1 sumber": atur KB + domain + branding di sini, snippet
   tetap sama.

> Hanya admin/superadmin tenant yang bisa menyimpan domain. Member melihat
> domain aktif (read-only).

## Manajemen knowledgebase

Tab **Knowledgebase** (lingkup wajar: pasang/lepas + unggah + tambah/hapus):

- Daftar KB tenant dengan badge **terpasang/belum** terhadap chatbot terpilih.
- **Pasang/Lepas** KB ke chatbot ini → `PUT /api/knowledge-bases/{id}/assignments`
  (deklaratif, 1 KB ↔ N chatbot — D11).
- **Unggah** berkas ke KB → `POST /api/knowledge-bases/{id}/upload` (ekstraksi +
  embedding dikerjakan server; kuota `storageBytes` ditegakkan di sana).
- **Tambah KB** → `POST /api/knowledge-bases`; **Hapus KB** (soft delete) →
  `DELETE /api/knowledge-bases/{id}`.
- **Kategori dokumen**: daftar + tambah → `GET/POST /api/categories`.

## Alur kuota → bayar TriPay

Tab **Kuota & Bayar**:

- Menampilkan paket aktif, pemakaian pesan vs kuota, jumlah chatbot & anggota
  (dari `GET /api/billing`).
- Bila kuota habis/kedaluwarsa → tombol perpanjang; bila belum → tombol upgrade.
- **Bayar**: `POST /api/payments` (`plan` = `pro`/`enterprise`, `months`) →
  balikan `{ id }` → panel menampilkan **QRIS** dan mem-poll
  `GET /api/payments/{id}` tiap 3 detik. Setelah `status: paid`, billing
  otomatis di-refresh — "kuota habis → bayar TriPay langsung dari situs mereka"
  jadi nyata.
- **Guard**:
  - Rahasia TriPay & proxyUrl **tetap sisi server/superadmin** (Langkah A) —
    pengguna panel tak pernah melihat/mengeditnya.
  - Bila `payment.enabled = false` (on-prem / gateway belum aktif) → seluruh
    bagian pembayaran disembunyikan dengan pesan "hubungi pengelola".
  - Pembayaran butuh peran admin/superadmin (`POST /api/payments` menolak
    member) → member melihat "hubungi admin", bukan tombol bayar.

## Isolasi tampilan

Semua gaya panel terkurung di bawah kelas `.nplug` (`src/app/plugin/plugin.css`)
dan tidak mewarisi shell aplikasi. Saat di-iframe, dokumen berdiri sendiri
sehingga CSS situs induk tak bisa bocor masuk maupun keluar.

## Berkas

| Berkas | Isi |
|---|---|
| `src/app/plugin/page.tsx` | Seluruh panel (client component, state internal) |
| `src/app/plugin/layout.tsx` | Pembungkus tipis `.nplug` |
| `src/app/plugin/plugin.css` | Gaya self-contained |
| `next.config.mjs` | Header `frame-ancestors *` untuk `/plugin/*` + pengecualian dari aturan DENY |

Tidak ada endpoint API baru — panel memakai rute yang sudah ada.

## Cek manual (langkah)

1. `npm run dev` → buka `http://localhost:3000/plugin`.
2. **Auth**: tab Masuk (kredensial Nalar) / Daftar. Akun baru → pesan "menunggu
   verifikasi".
3. **Pilih chatbot**: bila tenant punya >1 chatbot muncul picker; 1 chatbot →
   langsung masuk.
4. **Embed**: isi domain (mis. `https://tokosaya.com`) → Simpan → salin snippet.
5. **Knowledgebase**: Pasang KB ke chatbot, Unggah berkas, Tambah KB/kategori.
6. **Kuota & Bayar**: lihat pemakaian; bila payment aktif & admin → tombol bayar
   → QRIS → poll status.
7. **Iframe**: sematkan `<iframe src="…/plugin">` di halaman lain — panel tampil
   (perhatikan catatan cookie pihak ketiga di atas).
