# Alur bayar: modal "Metode pembayaran" → "Selesaikan pembayaran"

Meniru alur pembayaran stoodio (ecosystem-ip-ai) yang sudah terbukti. Dua langkah:

## Langkah 1 — Modal "Metode pembayaran"

Setelah user memilih paket & menekan tombol bayar, muncul modal (`PayChannelModal`)
berisi:

- **Ringkasan**: nama paket + durasi/interval + **Total bayar** (Rp).
- **Metode pembayaran**: daftar channel **aktif** dari gateway TriPay aktif,
  diambil dari `GET /api/payments/channels`. Satu-satunya channel → dipilih otomatis.
- Tombol **"Bayar sekarang"** (aktif setelah channel dipilih) → membuat transaksi.

Belum termuat → teks "Memuat metode pembayaran…". Bila gateway aktif bukan TriPay
(channel kosong) atau belum ada gateway aktif, modal jatuh ke satu opsi **QRIS
default** (kode `QRIS2`) supaya alur tak buntu — backward-compatible.

## Langkah 2 — Halaman "Selesaikan pembayaran"

`POST /api/payments { plan, months, interval?, method: <kode channel> }` → `{ id }`
→ pindah ke `/billing/pay/{id}`. Halaman itu menampilkan:

- Judul **"Selesaikan pembayaran"** + metode (QRIS) + jumlah.
- **Timer hitung mundur** dari `expiresAt`.
- **Gambar QRIS resmi** (`qr_url` TriPay via `<img>`); fallback canvas dari
  `qr_string` bila gateway hanya memberi payload.
- Teks "Pindai dengan aplikasi e-wallet atau mobile banking mana pun…".
- Blok status/log: **"Menunggu pembayaran — kuota masuk otomatis begitu dana
  diterima."** Status di-poll tiap 3 dtk (webhook menandai `paid`; poll juga
  menarik status provider sebagai pelindung).

## Backend

- `fetchTripayChannels(gw)` di `src/modules/payments/payment.service.ts` — memanggil
  `GET /merchant/payment-channel` (Bearer apiKey, ikut proxy bila diisi), memfilter
  channel `active`, mengembalikan `{ code, name, group, icon_url, fee_customer }[]`.
  Pola sama dengan `testTripayConnection`. Non-tripay/belum siap → daftar kosong.
- `GET /api/payments/channels` (`src/app/api/payments/channels/route.ts`) —
  admin/superadmin. Baca gateway aktif; belum ada → `503`. Kembalikan
  `{ success, channels }`.
- `method` yang dikirim ke `createQris` adalah **kode channel** (mis. `QRIS2`),
  bukan label. Default `QRIS2` bila tak diisi (kode QRIS TriPay yang benar).

## File tersentuh

| File | Perubahan |
|---|---|
| `src/modules/payments/payment.service.ts` | + `fetchTripayChannels()` + tipe `TripayChannelPublic` |
| `src/app/api/payments/channels/route.ts` | endpoint baru |
| `src/app/(app)/_components/pay-channel-modal.tsx` | modal bersama (langkah 1) |
| `src/app/(app)/welcome/page.tsx` | tombol paket → buka modal |
| `src/app/(app)/billing/page.tsx` | `UpgradeQris` → buka modal |
| `src/app/(app)/billing/pay/[id]/page.tsx` | judul "Selesaikan pembayaran" + timer + blok status |
