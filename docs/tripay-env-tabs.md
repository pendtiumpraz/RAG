# TriPay — kredensial Sandbox & Production terpisah

Ringkas: TriPay kini menyimpan **dua set kredensial** (sandbox & production)
berdampingan. Pindah environment tak perlu mengisi ulang — tinggal aktifkan.
Provider lain (midtrans, xendit) tetap datar seperti semula.

## Model data (baris `payment_gateways` provider `tripay`)

`encrypted_secret` (AES-256-GCM, JSON, **tak pernah ke browser**):

```json
{
  "sandbox":    { "apiKey": "…", "privateKey": "…" },
  "production": { "apiKey": "…", "privateKey": "…" }
}
```

`public_config` (jsonb, non-rahasia):

```json
{
  "activeEnv": "production",
  "envs": {
    "sandbox":    { "merchantCode": "…", "proxyUrl": "" },
    "production": { "merchantCode": "…", "proxyUrl": "http://43.156.122.83:8888" }
  }
}
```

- `activeEnv` = environment yang dipakai `chargeTripay`. Kolom `active`
  (boolean baris) tetap penanda "tripay yang dipilih di antara provider".
- Proxy per-env: production boleh pakai proxy IP statis, sandbox boleh kosong.

## Migrasi flat → per-env (otomatis, tanpa langkah manual)

Bentuk lama masih terbaca apa adanya — **tak ada skrip migrasi DB**.
`normalizeTripay()` (`payment-gateway.service.ts`, murni, teruji di
`tests/tripay-normalize.test.ts`) memetakan bentuk lama:

- Secret lama datar `{apiKey, privateKey}` + `public_config.sandbox` →
  kredensial dianggap milik env yang ditunjuk `sandbox` (`true`→sandbox,
  `false`/tak-ada→production). Env lain kosong.
- Saat superadmin **menyimpan** lewat UI, baris ditulis ulang ke bentuk
  per-env di atas. Sebelum disimpan pun charge & webhook sudah jalan benar
  karena resolusi terjadi saat baca.

Baris NALAR production (apiKey `ZYeqaY…`, `sandbox:false`) otomatis terbaca
sebagai kredensial **production** tanpa kehilangan data.

## Perilaku layanan

- `getActive()` → resolusi ke env `activeEnv`: mengembalikan
  `{ secrets:{apiKey,privateKey}, publicConfig:{merchantCode,proxyUrl,sandbox} }`
  datar → `chargeTripay` tak berubah.
- `get('tripay')` → sama (env aktif) untuk jalur charge/poll.
- `getTripayEnvs()` → **kedua** env (secret terdekripsi). Dipakai webhook
  `handleTripayCallback` untuk memverifikasi signature terhadap privateKey
  env manapun yang punya tagihan — key kosong dibuang agar tak jadi celah.
- `list()` → status per-env untuk UI **tanpa nilai rahasia**: hanya
  `apiKeySet`/`privateKeySet`/`ready` + `merchantCode`/`proxyUrl` (non-rahasia).
- `upsert(actor,'tripay',{env,secrets,publicConfig})` → simpan satu env,
  env lain tak tersentuh. Secret kosong = pertahankan yang lama.
- `setTripayActiveEnv(actor,env)` → set `activeEnv` + aktifkan tripay
  (env wajib punya apiKey & privateKey lengkap).

## Keamanan

Rahasia (apiKey/privateKey) **tidak pernah** dikirim balik ke browser. UI
hanya menerima flag "tersimpan". Field password menampilkan placeholder
`•••••••• tersimpan (kosongkan = tak diubah)` bila sudah ada — jelas beda
dari "belum diisi", tetap bisa ditimpa dengan mengetik nilai baru.
merchantCode & proxyUrl bukan rahasia → ditampilkan penuh & bisa diedit.

## Cara pakai (Payment superadmin → kartu tripay)

1. Buka `/billing` sebagai superadmin → kartu **tripay**.
2. Tab **Production** / **Sandbox** (tanda `•` = env yang sedang aktif).
3. Isi API Key, Private Key, Kode Merchant, Proxy URL → **Simpan Production**
   (atau Sandbox). Env satunya tak berubah.
4. Pindah tab, isi env satunya → simpan. Kedua kredensial kini tersimpan.
5. **Aktifkan Production** / **Aktifkan Sandbox** (aktif bila env lengkap)
   → `chargeTripay` memakai env itu. Pindah bolak-balik tak menghapus data.
