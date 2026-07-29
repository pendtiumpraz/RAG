-- D15: Papan kanban backlog di Dataroom (superadmin).
--
-- Tabel PLATFORM (tanpa tenant_id/RLS, pola payment_gateways): ini daftar
-- pekerjaan produk, bukan data pelanggan. Kendali akses di layer aplikasi
-- lewat superadminRoute.
--
-- `track` memisah tegas siapa yang bisa mengerjakan: 'human' (tersandera
-- kredensial/keputusan bisnis/pihak ketiga) vs 'agent' (bisa dikerjakan
-- Claude). Tanpa pemisahan itu papan cuma jadi daftar panjang.
CREATE TABLE IF NOT EXISTS backlog_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key         text NOT NULL,               -- kunci stabil utk seed (idempotent)
  track       text NOT NULL,               -- 'human' | 'agent'
  dimension   text NOT NULL,               -- 'uiux' | 'agentic' | 'feature' | 'launch'
  title       text NOT NULL,
  why         text NOT NULL,
  size        text NOT NULL DEFAULT 'M',   -- 'S' | 'M' | 'L'
  blocked     text,                        -- apa yang menyandera (track human)
  status      text NOT NULL DEFAULT 'todo',-- 'todo' | 'doing' | 'done'
  position    integer NOT NULL DEFAULT 0,  -- urutan dalam kolom
  created_at  timestamp NOT NULL DEFAULT now(),
  updated_at  timestamp NOT NULL DEFAULT now(),
  deleted_at  timestamp
);
CREATE INDEX IF NOT EXISTS idx_backlog_track_status ON backlog_items (track, status, position);
CREATE INDEX IF NOT EXISTS idx_backlog_deleted_at   ON backlog_items (deleted_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_backlog_key
  ON backlog_items (key) WHERE deleted_at IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nalar_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON backlog_items TO nalar_app;
  END IF;
END $$;
