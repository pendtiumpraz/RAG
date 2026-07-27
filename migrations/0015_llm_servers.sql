-- Server LLM sendiri (Ollama / vLLM / LM Studio / LocalAI / llama.cpp).
--
-- Tanpa ini `DEPLOYMENT_MODE=onprem` menyesatkan: embedding sudah bisa
-- sepenuhnya lokal, tapi jawabannya tetap harus menempuh API cloud — jadi
-- pemasangan yang benar-benar tertutup mustahil.
--
-- Tabel PLATFORM (tanpa tenant_id/RLS), meniru embedding_servers: kendali
-- akses di layer aplikasi lewat requireRole('superadmin'), token terenkripsi.
CREATE TABLE IF NOT EXISTS llm_servers (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL,
  base_url         text NOT NULL,
  encrypted_token  text,
  enabled          boolean NOT NULL DEFAULT true,
  models           jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_checked_at  timestamp,
  last_error       text,
  created_at       timestamp NOT NULL DEFAULT now(),
  updated_at       timestamp NOT NULL DEFAULT now(),
  deleted_at       timestamp
);

CREATE INDEX IF NOT EXISTS idx_llm_servers_enabled    ON llm_servers (enabled);
CREATE INDEX IF NOT EXISTS idx_llm_servers_deleted_at ON llm_servers (deleted_at);

CREATE UNIQUE INDEX IF NOT EXISTS uq_llm_servers_base_url
  ON llm_servers (base_url) WHERE deleted_at IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nalar_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON llm_servers TO nalar_app;
  END IF;
END $$;
