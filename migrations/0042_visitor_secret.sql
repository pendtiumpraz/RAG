-- 0042 — IDENTITAS PENGUNJUNG YANG DISUNTIK SITUS PELANGGAN
--
-- Penanda pengunjung lahir dari Math.random() di localStorage peramban, jadi
-- riwayat chat mati bersama perambannya: tanya di ponsel pagi hari, buka
-- laptop siang hari, percakapannya hilang. Datanya masih utuh di basis data —
-- tak ada seorang pun yang bisa menunjuknya lagi.
--
-- Pelanggan yang situsnya sudah punya login menyebutkan sendiri penanda
-- penggunanya saat memasang widget, DI HALAMAN DALAM aplikasi mereka.
-- Penanda itu harus bertanda tangan, karena "karyawan-4471" bisa ditebak dan
-- tanpa tanda tangan siapa pun bisa membaca riwayat orang lain.
--
-- RAHASIA PER CHATBOT, TERENKRIPSI (AES-256-GCM, core/crypto) — sepola kunci
-- S3 dan kunci penyedia LLM. Tak boleh memakai public_key chatbot: kunci itu
-- memang DIRANCANG untuk disebar di halaman pelanggan, jadi rahasia yang
-- menjaga riwayat orang tak boleh sama dengannya.
--
-- NULL = fitur belum dinyalakan untuk chatbot itu, dan itu keadaan awal
-- SELURUH chatbot yang sudah ada. Jalur lama tetap hidup: widget di halaman
-- publik memakai penanda peramban seperti hari ini. Identitas suntikan adalah
-- lapisan TAMBAHAN yang menyala hanya bila atributnya ada — kalau ia
-- menggantikan jalur lama, setiap widget yang sudah terpasang akan mati.

alter table chatbots add column if not exists visitor_secret text;

-- Menjawab "chatbot mana saja yang sudah menyalakannya" tanpa memindai
-- seluruh tabel. Parsial: yang belum menyalakan tak perlu menempati indeks,
-- dan itu mayoritasnya.
create index if not exists idx_chatbots_visitor_secret
  on chatbots (tenant_id) where visitor_secret is not null and deleted_at is null;
