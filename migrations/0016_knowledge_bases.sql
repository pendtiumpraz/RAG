-- D11: Knowledge base jadi entitas mandiri; 1 KB ↔ N chatbot.
--
-- Sebelumnya data_sources & documents terkunci ke SATU chatbot — divisi yang
-- berbagi dokumen harus ingest ulang (embedding dibayar dua kali, dua salinan
-- yang bisa saling menyimpang). Kini KB berdiri sendiri dan chatbot
-- memakainya lewat assignment N:M.
--
-- Idempotent dua arah:
--  • Prod lama (ada kolom chatbot_id + data): backfill — tiap chatbot yang
--    punya sumber/dokumen mendapat KB "KB <nama>", data dipindah, assignment
--    1:1 dibuat, kolom lama di-drop. Perilaku lama terjaga persis.
--  • DB segar (db:push sudah membuat bentuk final): semua langkah di bawah
--    no-op karena dijaga IF (NOT) EXISTS.

-- 1 ── tabel baru ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS knowledge_bases (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  name        text NOT NULL,
  description text,
  created_at  timestamp NOT NULL DEFAULT now(),
  updated_at  timestamp NOT NULL DEFAULT now(),
  deleted_at  timestamp
);
CREATE INDEX IF NOT EXISTS idx_knowledge_bases_tenant_id  ON knowledge_bases (tenant_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_bases_deleted_at ON knowledge_bases (deleted_at);

CREATE TABLE IF NOT EXISTS chatbot_knowledge_bases (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL,
  chatbot_id        uuid NOT NULL,
  knowledge_base_id uuid NOT NULL,
  created_at        timestamp NOT NULL DEFAULT now(),
  updated_at        timestamp NOT NULL DEFAULT now(),
  deleted_at        timestamp
);
CREATE INDEX IF NOT EXISTS idx_ckb_chatbot    ON chatbot_knowledge_bases (chatbot_id);
CREATE INDEX IF NOT EXISTS idx_ckb_kb         ON chatbot_knowledge_bases (knowledge_base_id);
CREATE INDEX IF NOT EXISTS idx_ckb_deleted_at ON chatbot_knowledge_bases (deleted_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ckb_chatbot_kb
  ON chatbot_knowledge_bases (chatbot_id, knowledge_base_id) WHERE deleted_at IS NULL;

-- 2 ── RLS (pola 0001/0005) + grant utk nalar_app ──────────────────────
ALTER TABLE knowledge_bases         ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_bases         FORCE  ROW LEVEL SECURITY;
ALTER TABLE chatbot_knowledge_bases ENABLE ROW LEVEL SECURITY;
ALTER TABLE chatbot_knowledge_bases FORCE  ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='knowledge_bases' AND policyname='tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON knowledge_bases
      USING (tenant_id = app_current_tenant())
      WITH CHECK (tenant_id = app_current_tenant());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='chatbot_knowledge_bases' AND policyname='tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON chatbot_knowledge_bases
      USING (tenant_id = app_current_tenant())
      WITH CHECK (tenant_id = app_current_tenant());
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nalar_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON knowledge_bases, chatbot_knowledge_bases TO nalar_app;
  END IF;
END $$;

-- 3 ── kolom baru (nullable dulu; NOT NULL setelah backfill) ───────────
ALTER TABLE data_sources ADD COLUMN IF NOT EXISTS knowledge_base_id uuid;
ALTER TABLE documents    ADD COLUMN IF NOT EXISTS knowledge_base_id uuid;
ALTER TABLE chatbots     ADD COLUMN IF NOT EXISTS context text;

-- 4 ── backfill: 1 KB per chatbot lama yang punya sumber/dokumen ───────
DO $$
DECLARE r RECORD; kb uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='data_sources' AND column_name='chatbot_id') THEN
    FOR r IN
      SELECT DISTINCT c.id AS chatbot_id, c.tenant_id, c.name
      FROM chatbots c
      WHERE EXISTS (SELECT 1 FROM data_sources s WHERE s.chatbot_id = c.id)
         OR EXISTS (SELECT 1 FROM documents d WHERE d.chatbot_id = c.id)
    LOOP
      -- rerun-safe: pakai KB hasil run sebelumnya bila sudah ada
      SELECT id INTO kb FROM knowledge_bases
        WHERE tenant_id = r.tenant_id AND name = 'KB ' || r.name AND deleted_at IS NULL
        LIMIT 1;
      IF kb IS NULL THEN
        INSERT INTO knowledge_bases (tenant_id, name, description)
          VALUES (r.tenant_id, 'KB ' || r.name,
                  'Dibuat otomatis migrasi D11 dari chatbot "' || r.name || '"')
          RETURNING id INTO kb;
      END IF;
      UPDATE data_sources SET knowledge_base_id = kb
        WHERE chatbot_id = r.chatbot_id AND knowledge_base_id IS NULL;
      UPDATE documents SET knowledge_base_id = kb
        WHERE chatbot_id = r.chatbot_id AND knowledge_base_id IS NULL;
      INSERT INTO chatbot_knowledge_bases (tenant_id, chatbot_id, knowledge_base_id)
        SELECT r.tenant_id, r.chatbot_id, kb
        WHERE NOT EXISTS (SELECT 1 FROM chatbot_knowledge_bases
          WHERE chatbot_id = r.chatbot_id AND knowledge_base_id = kb AND deleted_at IS NULL);
    END LOOP;
  END IF;
END $$;

-- 5 ── kunci bentuk final: NOT NULL + index + drop kolom lama ──────────
DO $$
BEGIN
  -- baris yatim (chatbot-nya sudah terhapus) ikut dibuang — datanya memang
  -- tak terjangkau dari mana pun sejak chatbot-nya lenyap
  DELETE FROM data_sources WHERE knowledge_base_id IS NULL;
  DELETE FROM documents    WHERE knowledge_base_id IS NULL;
  BEGIN
    ALTER TABLE data_sources ALTER COLUMN knowledge_base_id SET NOT NULL;
    ALTER TABLE documents    ALTER COLUMN knowledge_base_id SET NOT NULL;
  EXCEPTION WHEN others THEN NULL; -- sudah NOT NULL (rerun / DB segar)
  END;
END $$;
-- Kolom lama di-drop DULU: index idx_documents_scope versi lama memakai
-- chatbot_id dan ikut lenyap bersama kolomnya — kalau CREATE di bawah jalan
-- lebih dulu, namanya sudah terpakai definisi lama dan versi baru tak pernah
-- terbentuk (IF NOT EXISTS menilai NAMA, bukan definisi).
ALTER TABLE data_sources DROP COLUMN IF EXISTS chatbot_id;
ALTER TABLE documents    DROP COLUMN IF EXISTS chatbot_id;
CREATE INDEX IF NOT EXISTS idx_data_sources_kb ON data_sources (knowledge_base_id);
CREATE INDEX IF NOT EXISTS idx_documents_kb    ON documents (knowledge_base_id);
CREATE INDEX IF NOT EXISTS idx_documents_scope ON documents (tenant_id, knowledge_base_id, embedding_model);
