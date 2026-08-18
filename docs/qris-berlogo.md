# QRIS Berlogo di Halaman Bayar

Dokumen singkat: kenapa QR pembayaran dulu tampil **polos** dan bagaimana
sekarang menghasilkan **QRIS berlogo** yang tetap valid dipindai.

## Masalah sebelumnya — QR polos

Halaman bayar (`src/app/(app)/billing/pay/[id]/page.tsx`) dulu menampilkan
`qr_url` dari TriPay (`https://tripay.co.id/qr/<ref>`) langsung lewat `<img>`.

Fakta yang diverifikasi dari aset TriPay:

- `qr_url` menghasilkan gambar **320×320 ~2.7KB, 0% piksel berwarna** — murni
  hitam-putih, artinya **QR polos tanpa logo apa pun** di tengah.
- Gambar contoh dari Bos (`qris-tripay-example.jpg`) juga QR hitam-putih,
  jadi menukar sumber gambar saja tidak mengubah apa-apa.

Kesimpulan: TriPay hanya mengirim QR polos. Untuk mendapat tampilan "QRIS
berlogo", logo harus **ditumpuk sendiri** di atas QR yang kita gambar dari
payload resmi.

## Solusi sekarang — gambar sendiri + tumpuk logo QRIS

Sumber QR utama sekarang adalah **`qr_string`** (payload EMV QRIS resmi dari
TriPay, mis. `00020101021226…`), bukan `qr_url`.

Alur render di `pay/[id]/page.tsx`:

1. Gambar QR dari `qr_string` via library `qrcode` ke `<canvas>` dengan
   **error-correction level `H`** (toleransi kerusakan ~30%).
2. Tumpuk **logo QRIS resmi** (`public/qris-logo.svg`) di tengah, di atas
   kotak putih kecil sebagai bantalan.
3. `qr_url` (QR polos TriPay) tinggal jadi **fallback** bila `qr_string` tak
   tersedia.

### Kenapa tetap valid dipindai

QR level H bisa memulihkan hingga ~30% modul yang tertutup. Logo di tengah
hanya menutup **~6% luas** QR (kotak logo 28% lebar × porsi tinggi wordmark),
jauh di bawah ambang. Sudah diuji: payload di-generate → logo ditumpuk →
di-decode ulang dengan `jsQR` → **payload cocok 100%** (round-trip valid).
Jadi e-wallet / m-banking tetap bisa membacanya.

## Aset logo

`public/qris-logo.svg` — wordmark QRIS resmi (sumber: Wikimedia Commons
"QRIS Logo.svg", domain publik), diwarnai Deep Navy `#0F172A` agar selaras
dengan design system. Bukan logo asing; ini mark QRIS resmi.
