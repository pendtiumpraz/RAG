-- 0041 — EMBER TOKEN BERSAMA: rate limit yang benar-benar membatasi
--
-- Sampai sekarang penghitung laju hidup di MEMORI tiap lambda (limits.ts).
-- Di Vercel itu berarti batasnya berlipat sebanyak instance yang hidup:
-- PLAN_LIMITS menjanjikan burst 5 untuk paket gratis, tapi dengan sepuluh
-- lambda yang melayani bersamaan, batas sebenarnya 50. Yang paling terluka
-- bukan endpoint chat melainkan endpoint AUTH — signup, forgot, reset,
-- login-status, invite-accept semuanya dibatasi per IP lewat ember memori
-- yang sama, dan perlindungan tebak-sandi yang N kali lebih longgar dari
-- yang tertulis adalah lubang keamanan, bukan sekadar kuota meleset.
--
-- KENAPA POSTGRES, BUKAN REDIS. Kartu ini lama tertulis "menunggu Redis",
-- dan premis itu keliru: jalur permintaan yang sama SUDAH menyentuh Postgres
-- dua kali sebelum lajunya dinilai (resolveChatbotByPublicKey, lalu
-- usageService.snapshot). Ember bersama menambah SATU perjalanan ke jalur
-- yang sudah punya beberapa — bukan memperkenalkan ketergantungan baru.
-- Redis nanti berguna sebagai penghematan latensi, bukan sebagai syarat
-- kebenaran.
--
-- ┌─ PENGECUALIAN ATURAN KERAS ────────────────────────────────────────┐
-- │ TABEL INI TIDAK PUNYA deleted_at, dan itu disetujui pemilik produk  │
-- │ (1 Agu 2026, kartu a-ratelimit). Ini satu-satunya dari 32 tabel     │
-- │ yang begitu.                                                        │
-- │                                                                     │
-- │ Sebabnya: ember yang sudah kedaluwarsa tak punya nilai informasi    │
-- │ satu detik pun setelah lewat — ia bukan data pelanggan, melainkan   │
-- │ keadaan sesaat sebuah penghitung. Menyimpannya dengan soft delete   │
-- │ membuat tabel tumbuh tanpa batas dan memperlambat justru hal yang   │
-- │ ia jaga, sementara tak ada satu pun pertanyaan yang bisa dijawab    │
-- │ baris matinya. Pemangkasannya FISIK, dilakukan berkala oleh         │
-- │ aplikasi (core/limits-bersama.ts).                                  │
-- └─────────────────────────────────────────────────────────────────────┘
--
-- TANPA tenant_id, juga disengaja: penghitung laju berjalan pada jalur
-- PUBLIK, sebelum tenant diketahui — kunci `ip:1.2.3.4` di endpoint signup
-- tak dimiliki tenant mana pun. Karena itu tak ada RLS di sini; yang
-- tersimpan bukan data yang bisa membocorkan apa pun antar pelanggan,
-- melainkan angka sisa token dan cap waktu.

create table if not exists rate_buckets (
  -- 'chat:cb_live_…' | 'ip:1.2.3.4' | 'signup:1.2.3.4' — kunci yang sama
  -- persis dipakai ember memori, jadi keduanya membatasi hal yang sama.
  key      text primary key,
  -- Boleh pecahan: pengisian ulang proporsional waktu, dan pembulatan ke
  -- bilangan bulat akan membuat laju lambat (0,2/detik) tak pernah terisi.
  tokens   double precision not null,
  last_at  timestamptz not null default now()
);

-- Melayani pemangkasan berkala, dan HANYA itu. Parsial tak berguna di sini:
-- justru baris paling tua yang dicari, dan tak ada yang bisa dijadikan
-- predikat tetap karena ambangnya bergerak mengikuti waktu.
create index if not exists idx_rate_buckets_last_at on rate_buckets (last_at);

grant select, insert, update, delete on rate_buckets to nalar_app;
