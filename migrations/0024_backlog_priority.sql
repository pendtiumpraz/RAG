-- Prioritas eksplisit pada kartu backlog.
--
-- Urutan kartu di papan sudah menyatakan antrean, tapi urutan saja tak
-- membedakan "penting" dari "kebetulan di atas". Prioritas berdiri sendiri
-- dari posisi: kartu P0 tetap P0 ke mana pun ia diseret, sehingga menyeret
-- kartu untuk mengatur alur kerja tak diam-diam mengubah penilaian
-- kepentingannya.
--
--   P0 kerjakan lebih dulu · P1 penting · P2 normal · P3 nanti
ALTER TABLE backlog_items ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'P2';

CREATE INDEX IF NOT EXISTS idx_backlog_priority ON backlog_items (track, priority);

COMMENT ON COLUMN backlog_items.priority IS
  'P0..P3 — kepentingan, terpisah dari `position` yang menyatakan urutan antrean.';
