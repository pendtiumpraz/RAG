-- 0030 — KEBIJAKAN JAWABAN per chatbot (anti-halusinasi + bahasa + nada)
--
-- Sebelum ini tak satu pun penyedia LLM dikirimi `temperature`, jadi semuanya
-- berjalan pada default masing-masing: OpenAI dan Anthropic memakai 1.0. Untuk
-- mesin yang tugasnya mengutip dokumen, 1.0 berarti model diminta kreatif
-- justru pada saat ia harus patuh. Default kolom di bawah (0.2 + grounding
-- 'strict') adalah perbaikan perilaku, bukan sekadar penambahan pengaturan.
--
-- Idempoten & aman dijalankan berkali-kali (aturan proyek: perubahan skema
-- produksi HANYA lewat berkas migrasi, tidak pernah lewat drizzle-kit push).

alter table chatbots add column if not exists temperature   real    not null default 0.2;
alter table chatbots add column if not exists max_tokens    integer not null default 2048;
-- 'auto' | 'id' | 'en'
alter table chatbots add column if not exists language_mode text    not null default 'auto';
-- 'netral' | 'formal' | 'ramah' | 'ringkas' | 'teknis'
alter table chatbots add column if not exists tone          text    not null default 'netral';
-- 'strict' | 'balanced' | 'open'
alter table chatbots add column if not exists grounding     text    not null default 'strict';
-- Aturan bebas dari pemilik chatbot. Disisipkan sebagai PREFERENSI GAYA,
-- tak pernah bisa melonggarkan aturan kepatuhan sumber (lihat answer-policy.ts).
alter table chatbots add column if not exists answer_rules  text;

-- Batas ditegakkan di database juga, bukan hanya di service: baris bisa masuk
-- lewat jalur lain (impor, perbaikan manual), dan temperature 1.8 pada mesin
-- RAG adalah cacat data, bukan sekadar preferensi yang aneh.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'chatbots_temperature_range') then
    alter table chatbots add constraint chatbots_temperature_range
      check (temperature >= 0 and temperature <= 1);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chatbots_max_tokens_range') then
    alter table chatbots add constraint chatbots_max_tokens_range
      check (max_tokens >= 256 and max_tokens <= 8192);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chatbots_language_mode_valid') then
    alter table chatbots add constraint chatbots_language_mode_valid
      check (language_mode in ('auto', 'id', 'en'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chatbots_tone_valid') then
    alter table chatbots add constraint chatbots_tone_valid
      check (tone in ('netral', 'formal', 'ramah', 'ringkas', 'teknis'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'chatbots_grounding_valid') then
    alter table chatbots add constraint chatbots_grounding_valid
      check (grounding in ('strict', 'balanced', 'open'));
  end if;
end $$;
