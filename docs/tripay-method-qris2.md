# TriPay — method `QRIS2` (bukan `QRIS`)

## Masalah

`chargeTripay` di `src/modules/payments/payment.service.ts` mengirim `method: 'QRIS'`
(hardcode) ke TriPay `transaction/create`. Kode channel QRIS TriPay yang benar adalah
**`QRIS2`**, bukan `QRIS` polos. Akibatnya TriPay membalas:

```
Payment channel is not enabled (QRIS - T52318)
```

dan QR tidak pernah muncul.

Terbukti dari deployment produksi yang berjalan (stoodio.qmodo.co): `GET /merchant/payment-channel`
mengembalikan channel dengan `code: 'QRIS2'` (nama tampil "QRIS").

## Perbaikan

Tiga baris, backward-compatible:

1. `chargeTripay(gw, ref, amount, plan, email, method = 'QRIS2')` — param `method` baru,
   default `'QRIS2'`, dikirim di body `transaction/create` (bukan lagi `'QRIS'` hardcode).
2. `createQris(..., interval?, method?)` — meneruskan `method` ke `chargeTripay`.
   Tanpa argumen → `undefined` → default `'QRIS2'` berlaku (alur lama utuh).
3. `POST /api/payments` menerima `method?: string` opsional (regex `^[A-Z0-9]{2,20}$`,
   divalidasi di boundary karena diteruskan apa adanya ke TriPay).

## Cara override channel

```jsonc
POST /api/payments
{ "plan": "pro", "months": 1, "method": "QRIS2" }   // atau kode channel lain, mis. "BRIVA"
```

Tanpa `method`, default tetap `QRIS2`. Tanda tangan TriPay tidak berubah
(`HMAC-SHA256(merchantCode + merchantRef + amount, privateKey)` — `method` bukan bagian signature).

## Ditunda (sengaja)

Endpoint `GET /api/payments/channels` + pemilihan channel di UI bayar **tidak** dibuat.
Default `QRIS2` sudah menyelesaikan bug. Picker channel adalah fitur (mendukung VA bank dll.),
bukan perbaikan — tambah bila memang butuh banyak metode. Batas nilai TriPay tetap:
`minimum_amount: 1000`, maksimum Rp5.000.000.
