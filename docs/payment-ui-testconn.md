# Testing Connection TriPay + tata letak Mode Deploy & Harga

Ringkas: dua perubahan di halaman **Billing → pengaturan pembayaran (superadmin)**.

## 1. Tata letak Mode Deploy & Harga

Sebelumnya dropdown "Mode deploy" dan dua input harga berbaris mengapit-tumpuk.
Sekarang tersusun vertikal:

- **Mode deploy** — dropdown sempit (maks 360px) + keterangan kecil yang
  berubah mengikuti mode (SaaS vs On-premise).
- **Harga plan** — grid 2 kolom: "Harga Pro (IDR/bulan)" & "Harga Enterprise
  (IDR/bulan)". Di layar sempit grid otomatis menumpuk jadi 1 kolom.
- Catatan "diskon tahunan −20% otomatis" di bawah harga.

Perilaku simpan tak berubah: harga tersimpan **on blur** (keluar dari input)
bila nilainya berubah; nilai selalu terlihat, tak ada tombol yang memblokir.

## 2. Tombol "Testing Connection" (TriPay, per env)

Di kartu TriPay, tab **Sandbox** dan **Production** masing-masing punya tombol
**Testing Connection**.

### Yang diuji
Menekan tombol memanggil `POST /api/admin/payment-settings/test-tripay`
(`{ env: 'sandbox' | 'production' }`, superadmin). Backend:

1. Ambil kredensial env itu (`getTripayEnvs()`) — apiKey/privateKey/merchantCode/proxyUrl.
2. Panggil TriPay `GET /merchant/payment-channel` dengan `Authorization: Bearer <apiKey>`
   (tanpa signature, tanpa membuat transaksi).
   - Lewat **proxy** bila env punya `proxyUrl`, langsung ke `https://tripay.co.id`
     (`/api` prod, `/api-sandbox` sandbox) bila kosong — sama seperti `chargeTripay`.
3. Cari channel QRIS (`code`/`name` mengandung "QRIS") dengan `active: true`.

### Hasil (Bahasa Indonesia)
- `Terhubung • QRIS aktif` — kredensial valid & channel QRIS menyala.
- `Terhubung • tapi channel QRIS nonaktif` — kredensial valid, QRIS mati di dashboard TriPay.
- `TriPay menolak: <pesan>` — mis. API Key salah (401).
- `Proxy tidak tercapai: …` / `TriPay tidak tercapai: …` — jaringan/proxy gagal.

Ditampilkan sebagai badge hijau/merah di bawah tombol.

### Limitasi: test env TERSIMPAN, bukan draf
Yang diuji adalah kredensial yang **sudah disimpan** untuk env itu. Field yang
baru diketik tapi belum di-Simpan tidak ikut diuji. Karena itu tombol
**dinonaktifkan** sampai env `ready` (API Key + Private Key tersimpan), dengan
tooltip "Isi API Key & Private Key lalu simpan dulu". Alur: isi field → Simpan
→ Testing Connection.

Rahasia (apiKey/privateKey) tak pernah dikirim ke browser — hanya `{ ok,
message, channelQrisActive }`.

### Uji manual
Billing (superadmin) → kartu TriPay → tab **Production** → **Testing Connection**
→ muncul `Terhubung • QRIS aktif` (karena API key produksi sudah valid di DB).

## Test otomatis
`tests/tripay-test-connection.test.ts` menguji `qrisChannelActive` (murni,
tanpa jaringan): QRIS aktif, variasi kode (QRISC), QRIS nonaktif, tanpa QRIS,
dan input non-array. Endpoint live hanya diuji manual.
