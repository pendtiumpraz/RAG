# Loop Status — Nalar (RAG Engine)

> Loop V2 — Context-Aware + Self-Evaluating. State file; update oleh workflow.
>
> **Berkas ini pernah tertinggal delapan hari** — ia masih menyebut Fase 04
> "pending" sementara produknya sudah tayang dan lima keputusan arsitektur
> berikutnya sudah diambil. Sebabnya struktural, bukan kelalaian: daftar
> pekerjaan yang berubah tiap jam tak bisa hidup di berkas yang diperbarui
> manual. Karena itu daftar kerja kini ada di **papan backlog** (tersimpan di
> basis data, tab Dataroom), sementara berkas ini menyusut jadi pencatat
> FASE dan KONTEKS saja — hal yang berubah beberapa kali sebulan.

---

## Status Loop

```yaml
loop:
  project_name: "Nalar — RAG Engine"
  version: "v2-context-aware"
  started_at: "2026-07-23"
  status: "active"             # active | paused | completed | killed

  current_phase:
    id: "07-IMPROVEMENT"
    name: "Improvement"
    status: "active"
    since: "2026-07-28"
    note: >
      Produk tayang di rag.sainskerta.net sejak 2026-07-24. Siklusnya kini
      Deploy → Monitor → Improve, dengan papan backlog sebagai daftar kerja.

  phase_history:
    - phase: "00-PREREQUISITES"
      status: "partial"          # kredensial pihak ketiga masih menunggu user
      started_at: "2026-07-23"
      completed_at: null
    - phase: "01-PLANNING"
      status: "completed"
      started_at: "2026-07-23"
      completed_at: "2026-07-23"
    - phase: "02-WIREFRAME-AUDIT"
      status: "completed"
      started_at: "2026-07-23"
      completed_at: "2026-07-23"
    - phase: "03-BACKEND"
      status: "completed"
      started_at: "2026-07-23"
      completed_at: "2026-07-23"
    - phase: "04-FRONTEND"
      status: "completed"
      started_at: "2026-07-23"
      completed_at: "2026-07-26"
    - phase: "05-AUDIT"
      status: "completed"
      started_at: "2026-07-24"
      completed_at: "2026-07-27"
      note: "CI ber-database + smoke ketat; uji beban belum dijalankan"
    - phase: "06-DEPLOYMENT"
      status: "completed"
      started_at: "2026-07-24"
      completed_at: "2026-07-24"
    - phase: "07-IMPROVEMENT"
      status: "active"
      started_at: "2026-07-28"
      completed_at: null

  context:
    backend_framework: "Next.js 15 App Router + React 19"
    frontend_framework: "React 19 (Next.js) — DS v4 'Retrieval Instrument'"
    database: "PostgreSQL 15+ + pgvector 0.8 — TIDAK terikat penyedia (D15)"
    deployment_target: "SaaS (Vercel + Neon) + on-prem (docker-compose)"
    ai_provider: "multi (1 aktif per tenant)"
    ai_model: "core/registry.ts — satu sumber untuk LLM & embedding"
    vector_storage: "halfvec tanpa batas dimensi (migrasi 0035) — 776 B/potongan"
    migrations_applied: "0001–0036 TERPASANG di produksi (2026-07-31, diverifikasi kolom per kolom)"
    chat_surfaces: "widget gelembung (embed.js) · halaman penuh publik /c/{publicKey} · mode embed inline"
    work_queue: "papan backlog di basis data, BUKAN berkas ini"
```

---

## Fase Aktif: `07-IMPROVEMENT`

Siklusnya **Deploy → Monitor → Improve → Deploy**. Tak ada checklist yang bisa
"selesai" di sini; yang ada adalah antrean kerja yang tak pernah habis.

**Antreannya ada di papan backlog**, bukan di berkas ini:
`src/modules/core/backlog.service.ts` (seed) → Dataroom ▸ Update & Backlog.
Status tiap kartu tersimpan di basis data, jadi papan itu mengingat posisinya
dan tak bisa tertinggal seperti berkas ini pernah tertinggal.

**Keadaan papan per 2026-07-31 (sore):** 17 selesai · 53 tersisa
(P0=3 · P1=13 · P2=25 · P3=12).

Jumlah tersisa tak berkurang walau lima kartu ditandai selesai — empat kartu
BARU masuk pada hari yang sama. Itu bukan kemunduran, dan disebut apa adanya:
tiga di antaranya lahir dari pekerjaan yang baru selesai (chat halaman penuh,
kategorisasi ulang, identitas pengunjung), satu dari temuan saat menghitung
batas Vercel untuk korpus besar (`a-ingest-worker`). Papan yang jumlahnya
hanya bisa turun adalah papan yang berhenti mencatat apa yang ditemukan.

**Ketiga P0 yang tersisa ada di jalur MANUSIA** — tak satu pun bisa dikerjakan
agen tanpa menunggu:

| Kartu | Yang menyandera |
|---|---|
| `h-smtp` | Akun email + App Password |
| `h-gateway` | Akun merchant gateway pembayaran |
| `h-drive-apikey` | Akses Google Cloud Console |

---

## Adaptation Notes

```
[🔄 ADAPTATION 2026-07-23] — Proyek di-scaffold sebelum Loop diadopsi — Selaraskan
via Fase Planning, angkat gap kepatuhan (No-FK, soft-delete, modular, UI) ke user — AI

[🔄 ADAPTATION 2026-07-23] — D1/D2/D3 approved — schema.ts direfactor compliant;
restrukturisasi modul + endpoint soft-delete jadi task Fase 03 berikutnya — User+AI

[🔄 ADAPTATION 2026-07-31] — Berkas state ini tertinggal delapan hari sementara
D11–D15 diambil dan puluhan perubahan tayang. Daftar kerja DIPINDAH ke papan
backlog yang tersimpan di basis data; berkas ini menyusut jadi pencatat fase &
konteks. Pembagiannya kini tegas: `progress.md` = sumber kebenaran STATUS,
papan backlog = sumber kebenaran ANTREAN KERJA, berkas ini = FASE — AI
```

---

## Error Log
```
(kosong — insiden produksi dicatat di progress.md § Log Perubahan, karena di
 sanalah konteks lengkap beserta perbaikannya berada)
```
