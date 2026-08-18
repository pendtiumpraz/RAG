# TriPay VPS Proxy — IP statis untuk API TriPay

## Kenapa perlu

TriPay membatasi/whitelist berdasarkan IP asal panggilan API. Vercel memakai
IP keluar yang **dinamis** (berubah-ubah), sehingga tidak bisa didaftarkan ke
whitelist TriPay. Solusinya: teruskan panggilan API TriPay lewat sebuah VPS
ber-**IP statis** (contoh `43.156.122.83`). TriPay akan melihat IP VPS itu,
bukan IP Vercel.

Yang lewat proxy **hanya panggilan keluar** dari server kita ke TriPay
(`/transaction/create`, dst). **Webhook/callback TETAP** menuju domain kita
(`https://<domain>/api/payments/callback/tripay`) dan **tidak** melewati proxy —
verifikasi signature tidak berubah.

## Cara kerja

Nilai `proxyUrl` disimpan di `publicConfig` gateway TriPay (bukan rahasia,
sekadar URL). Bila diisi, `chargeTripay` membangun base URL:

```
base = proxyUrl (tanpa trailing slash) + ('/api-sandbox' bila sandbox, selain itu '/api')
```

Jadi panggilan `POST {base}/transaction/create` menjadi:

```
http://43.156.122.83:8888/api/transaction/create
```

Proxy meneruskan **path yang sama** (`/api/...` atau `/api-sandbox/...`) ke
`https://tripay.co.id/...`. Bila `proxyUrl` kosong, panggilan langsung ke
`https://tripay.co.id/api(-sandbox)` seperti semula.

## Setup VPS

Jalankan reverse proxy di VPS ber-IP statis, dengar di port `8888`, dan
teruskan `/api/*` serta `/api-sandbox/*` ke `https://tripay.co.id/*`.

### Opsi A — Caddy (paling ringkas)

`/etc/caddy/Caddyfile`:

```
:8888 {
    reverse_proxy https://tripay.co.id {
        header_up Host tripay.co.id
    }
}
```

Caddy meneruskan path apa adanya, jadi `/api/transaction/create` diteruskan ke
`https://tripay.co.id/api/transaction/create`. `header_up Host tripay.co.id`
wajib agar TLS SNI + virtual host TriPay cocok.

```bash
sudo systemctl reload caddy
```

### Opsi B — Nginx

`/etc/nginx/conf.d/tripay-proxy.conf`:

```nginx
server {
    listen 8888;
    server_name _;

    # hanya izinkan path API TriPay
    location ~ ^/(api|api-sandbox)/ {
        proxy_pass https://tripay.co.id;
        proxy_set_header Host tripay.co.id;
        proxy_ssl_server_name on;              # kirim SNI ke upstream TLS
        proxy_set_header X-Forwarded-For $remote_addr;
    }

    location / { return 404; }
}
```

```bash
sudo nginx -t && sudo systemctl reload nginx
```

`proxy_ssl_server_name on` penting: tanpa itu handshake TLS ke `tripay.co.id`
bisa gagal karena SNI tidak dikirim.

## Keamanan VPS

- Batasi akses port `8888` hanya dari IP Vercel bila memungkinkan, atau minimal
  hanya izinkan path `^/(api|api-sandbox)/` (sudah di config Nginx di atas) agar
  proxy tidak jadi open relay.
- Body request mengandung signature HMAC + `Authorization: Bearer <apiKey>`.
  Trafik VPS→TriPay sudah HTTPS. Untuk Vercel→VPS memakai `http://…:8888`
  (plaintext di jaringan publik) — bila ingin lebih aman, pasang TLS di VPS
  (Caddy otomatis via domain) dan isi `proxyUrl` dengan `https://…`.

## Cara pakai di aplikasi

1. Login sebagai **superadmin** → halaman **Billing** → panel *pengaturan
   pembayaran* → kartu **tripay**.
2. Isi kolom **Proxy URL** dengan `http://43.156.122.83:8888` (kosongkan untuk
   panggilan langsung ke TriPay).
3. **Simpan kredensial**. Nilai tersimpan di `publicConfig.proxyUrl`.

## Verifikasi cepat

Dari mesin mana pun, pastikan proxy meneruskan dengan benar:

```bash
curl -i http://43.156.122.83:8888/api/merchant/payment-channel \
  -H "Authorization: Bearer <apiKey-tripay>"
```

Harus mengembalikan respons JSON dari TriPay (bukan error koneksi/SNI). IP yang
dilihat TriPay = IP VPS.
