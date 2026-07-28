-- Logo unggahan per chatbot (branding per divisi).
--
-- Disimpan di DATABASE sebagai data URL (base64, dibatasi aplikasi ±300KB),
-- BUKAN di Vercel Blob: jalan identik di SaaS dan on-premise tanpa env atau
-- layanan tambahan, ikut ter-backup bersama data tenant, dan ikut RLS.
-- Dilayani ke widget lewat GET /api/chat/{publicKey}/logo dgn cache publik —
-- byte-nya TIDAK menumpang di JSON theme (biar config widget tetap ringan).
ALTER TABLE chatbots ADD COLUMN IF NOT EXISTS logo text;
