# Loop Status — [Nama Project]

> **Loop V2 — Context-Aware + Self-Evaluating.**
> File state loop — jangan edit manual kecuali tahu apa yang dilakukan. Update otomatis oleh workflow.
> Loop TIDAK cuma baca step berikutnya: **baca konteks penuh → evaluasi → putuskan prioritas → eksekusi → self-evaluate → adapt.**

---

## 0. Dua Fundamental (WAJIB)

1. **Context Engineering** — baca konteks lengkap (progress.md, user_requirement.md, architecture-decisions.md, error logs, hasil sub-agent sebelumnya) SEBELUM eksekusi. Bukan cuma checklist.
2. **Harness Engineering** — evaluasi konteks dulu, putuskan apa yang paling penting *saat ini*, baru eksekusi. Dilarang asal lompat ke step berikutnya.

---

## Loop Protocol (tiap iterasi, urut)

1. **CONTEXT INTAKE** — baca semua sumber, susun ringkasan situasi terkini.
2. **EVALUATE** — ada gate/PENDING HIGH? error iterasi lalu? step berikutnya masih valid? dependency siap?
3. **DECIDE** — pilih aksi paling penting: blocker → HIGH user → step aktif (jika valid) → MEDIUM → LOW.
4. **EXECUTE** — spawn sub-agent (prompt self-contained, ikut standards).
5. **SELF-EVALUATE** — output benar-benar memenuhi tujuan? lint/typecheck/test PASS? muncul kebutuhan adaptasi?
6. **ADAPT & LOG** — kalau menyimpang dari checklist / scope berubah → tulis Adaptation Note.
7. **APPROVAL & ADVANCE** — gate user approved → maju fase berikutnya.
8. **REPEAT** — tiap iterasi mulai lagi dari CONTEXT INTAKE, bukan dari "step terakhir yang diingat".

---

## Status Loop

```yaml
loop:
  project_name: "[Nama Project]"
  version: "v2-context-aware"
  started_at: "[YYYY-MM-DD HH:MM]"
  status: "active"             # active | paused | completed | killed

  # Fase saat ini (DESIGN LAYER)
  current_phase:
    id: "00-PREREQUISITES"     # Kode fase
    name: "Prerequisites"      # Nama fase
    status: "in_progress"      # pending | in_progress | completed | skipped

  # Riwayat fase
  phase_history:
    - phase: "00-PREREQUISITES"
      status: "in_progress"
      started_at: "[YYYY-MM-DD HH:MM]"
      completed_at: null

  # Context penting
  context:
    backend_framework: null     # Diisi saat planning
    frontend_framework: null    # Diisi saat planning
    database: null              # Diisi saat planning
    deployment_target: null     # Diisi saat planning
    ai_provider: null           # Diisi saat planning
    ai_model: null              # Diisi saat planning
```

---

## Phase Details (DESIGN LAYER)

### Current Phase: `[00-PREREQUISITES]`

**Checklist progress:**
- [ ] Task 1: `[deskripsi]`
- [ ] Task 2: `[deskripsi]`
- [ ] Task 3: `[deskripsi]`

**Notes:**
```
[Catatan untuk fase ini]
```

---

## Aturan: Sub-Agent WAJIB Update Shared Context

> Konsep inti: **Context In → Work → Context Out.** BUKAN *Context In → Work → Selesai.*
> Sub-agent yang kerja lalu balik tanpa nulis apa-apa = pelanggaran. Hasilnya hilang dari shared context.

Setiap sub-agent yang dispawn (Loop Protocol langkah 4 EXECUTE) WAJIB, berurutan:

1. **BACA shared context sebelum kerja** — `progress.md`, `user_requirement.md`, `architecture-decisions.md`.
2. **KERJAIN task spesifik** yang diberikan main loop.
3. **UPDATE shared context setelah selesai:**
   - `progress.md` — update ✅/❌ step yang dikerjain, tambah adaptation note kalau perlu.
   - `architecture-decisions.md` — catat keputusan arsitektur baru kalau ada.
   - `audit-logs.md` — catat apa yang terjadi, error, hasil.
4. **BALIK laporan ringkas** ke main loop.

> Prompt sub-agent yang dispawn WAJIB menyertakan 4 kewajiban di atas + format adaptation note di bawah.

**Format adaptation note dari sub-agent (tulis ke `progress.md`):**

```
[🔄 SUB-AGENT YYYY-MM-DD HH:MM] — <agent_id> — <step dikerjain> — <hasil> — <konteks baru>
```

Contoh:

```
[🔄 SUB-AGENT 2026-06-19 17:00] — wireframe-agent — Wireframe popup extension — ✅ Selesai — Perlu nambah modal consent di wireframe
```

---

## Adaptation Notes (EXECUTION LAYER)

> Ditulis loop setiap kali eksekusi menyimpang dari urutan checklist design awal, keputusan/scope berubah,
> atau self-evaluate memunculkan perubahan rencana. Design awal TIDAK dihapus — hanya di-override dengan alasan tercatat.

**Format:** `[🔄 ADAPTATION YYYY-MM-DD HH:MM] — <alasan> — <keputusan> — <siapa: AI/User>`

```
(belum ada adaptasi)
```

---

## Pause/Resume Info

Jika loop di-pause:
```
Paused at: [YYYY-MM-DD HH:MM]
Reason: [Alasan pause]
Resume at: [YYYY-MM-DD HH:MM]  (diisi saat resume)
```

---

## Error Log

```
[YYYY-MM-DD HH:MM] - [Error description]
[YYYY-MM-DD HH:MM] - [Error description]
```
