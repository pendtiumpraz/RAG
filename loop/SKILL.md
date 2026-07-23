# Sainskerta Loop Workflow — OpenClaw Skill

> **Skill untuk mengelola Sainskerta project development menggunakan loop engineering.**
>
> OpenClaw bertindak sebagai **orchestrator** antara User (via WhatsApp/Telegram) dan AI Agent (Claude Code).
> OpenClaw **TIDAK menulis kode** — hanya routing pesan, update file markdown, dan trigger AI.

---

## 📋 Identitas Skill

| Atribut | Nilai |
|---------|-------|
| **Nama Skill** | `sainskerta-loop-workflow` |
| **Versi** | 1.0 |
| **Deskripsi** | Orchestrator untuk Sainskerta project development loop — dari requirement hingga deploy |
| **AI Agent Target** | Claude Code (mengeksekusi FLOW.md) |
| **Channel Support** | WhatsApp, Telegram |
| **Bahasa** | Indonesia |
| **Dependensi** | File: `FLOW.md`, `RULES-OF-THE-GAME.md`, `templates/` |

---

## 🏗️ Arsitektur Sistem

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           OPENCLAW (Orchestrator)                        │
│                                                                          │
│  ┌──────────────┐    ┌──────────────────┐    ┌──────────────────────┐   │
│  │  SKILL.md     │───►│  File Manager     │───►│  Communication Layer │   │
│  │  (This File)  │    │  - progress.md    │    │  - WhatsApp          │   │
│  │               │    │  - user_require-  │    │  - Telegram          │   │
│  │  Trigger Map  │    │    ment.md        │    └──────────────────────┘   │
│  │  Command →    │    │  - architecture-  │              │               │
│  │  Action       │    │    decisions.md   │              │               │
│  └──────────────┘    └──────────────────┘              │               │
│                              │                          │               │
│                              ▼                          ▼               │
│                    ┌──────────────────┐    ┌──────────────────────┐     │
│                    │  AI Injector     │    │  User Messenger      │     │
│                    │  - Update .md    │    │  - Kirim pesan       │     │
│                    │  - Trigger loop  │    │  - Baca balasan      │     │
│                    └────────┬─────────┘    └──────────────────────┘     │
└─────────────────────────────┼────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                    AI AGENT (Claude Code)                                │
│                                                                          │
│  Baca FLOW.md → Eksekusi fase → Update progress.md → Minta approval    │
│  → Baca user_requirement.md → Lanjut/Iterasi                            │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 📁 File Structure yang Dikelola

### Root Project (per project folder)

```
project-name/
├── progress.md                     ← State management & tracking
├── user_requirement.md             ← Human interrupt & requirement
├── architecture-decisions.md       ← Catatan keputusan
├── audit-report.md                 ← Laporan audit (dibuat Phase 5)
├── deployment-log.md               ← Log deployment (dibuat Phase 6)
├── .claude/
│   └── loop.md                     ← Loop state (internal AI)
├── backend/                        ← Backend code (oleh AI)
├── frontend/                       ← Frontend code (oleh AI)
├── database/                       ← Migration & seed (oleh AI)
├── docs/                           ← Dokumentasi (oleh AI)
├── wireframes/                     ← Wireframe output (oleh AI)
├── .env                            ← Environment variables (oleh AI)
└──  (CLI.md, RULES-OF-THE-GAME.md, templates/, phases/  →  dari workflow)
```

### progress.md — Format Status yang Dipahami OpenClaw

```
[✅] / [✓] = Selesai
[➡️]       = Sedang dikerjakan
[⏳]       = Pending / Belum dimulai
[❌]       = Error / Gagal
[👀]       = Nunggu approval user
[🔄]       = Retry / Iterasi
[⏸️]       = Paused
[💀]       = Killed / Dihentikan
```

**OpenClaw membaca progress.md untuk:**
1. Mengetahui fase apa yang aktif saat ini
2. Mengetahui apakah ada yang butuh approval (👀)
3. Mengirim status ke user
4. Menentukan command apa yang relevan

### user_requirement.md — Format yang Dipahami OpenClaw

**Format requirement:**
```
[PENDING] - Priority HIGH - [nama fitur]
[PENDING] - Priority MEDIUM - [nama fitur]
[PENDING] - Priority LOW - [nama fitur]
[DONE] - [nama fitur/step]
[REJECTED] - [nama fitur/step] - [alasan]
```

**Format approval:**
```
[APPROVAL_SECTION_START]
Status: APPROVED / REJECTED / PENDING
Timestamp: YYYY-MM-DD HH:MM
Feedback: [optional, jika REJECTED]
[APPROVAL_SECTION_END]
```

**Format interupsi:**
```
[PENDING] - Priority HIGH (interrupt)
- [ ] [deskripsi perintah/interupsi dari user]
```

---

## 🎯 Workflow yang Didukung

### 1. Memulai Project Baru

**Trigger:** User bilang:
- "buat project [nama]"
- "mulai project [nama]"
- "bikin project baru [nama]"
- "/start-project [nama]"

**Steps:**

```
OpenClaw:
1. Buat folder project baru di workspace/projects/[nama]/
2. Copy template dari sainskerta-loop-workflow/templates/:
   - progress.md (isi [Nama Project] dengan nama user)
   - user_requirement.md (isi [Nama Project] dengan nama user)
   - loop.md (isi [Nama Project] dengan nama user)
3. Copy RULES-OF-THE-GAME.md ke folder project
4. Copy CLI.md ke folder project
5. Buat file architecture-decisions.md kosong
6. Tulis ke progress.md:
   ## Ringkasan
   | Item | Status |
   |------|--------|
   | Project | [nama] |
   | Fase Aktif | 00-INIT |
   | Status Loop | active |
   | Progress | 0% |

7. Kirim pesan ke user:
   ```
   🚀 Project "[nama]" sudah siap!
   
   Tolong kirim requirement-nya ya. Contoh:
   "Aplikasi manajemen toko dengan fitur:
   - Manajemen produk (CRUD)
   - Manajemen stok
   - Laporan penjualan"
   
   Atau kirim file requirement.
   ```
```

**File yang diupdate:** `progress.md`, `user_requirement.md`

---

### 2. Inject Requirement

**Trigger:** User kirim pesan berisi requirement aplikasi.

**Steps:**

```
OpenClaw:
1. Baca pesan user — identifikasi fitur-fitur yang disebutkan
2. Update user_requirement.md:
   
   ## 📋 Requirement Project
   
   ### Nama Project
   [nama project dari progress.md]
   
   ### Deskripsi Singkat
   [parafrase requirement user]
   
   ### Fitur Utama
   1. [Fitur 1]
      - Prioritas: HIGH
   2. [Fitur 2]
      - Prioritas: HIGH
   3. [Fitur 3]
      - Prioritas: MEDIUM
   ...

3. Update progress.md — bagian Requirement:
   - [✅] Requirement dari user

4. Kirim pesan ke user:
   ```
   ✅ Requirement udah masuk! 
   
   Yang saya tangkap:
   1. [N] fitur utama
   2. [N] fitur tambahan
   
   Saya assign prioritas:
   - HIGH: [N] fitur
   - MEDIUM: [N] fitur
   - LOW: [N] fitur
   
   
   Kalo ada yang kurang atau mau diedit, bilang aja.
   Kalo udah OK, saya akan mulai analisa.
   ```
```

**File yang diupdate:** `user_requirement.md`, `progress.md`

**Catatan:**
- Jika user kirim pesan panjang dengan requirement detail, OpenClaw harus parsing dan tulis ke user_requirement.md dengan format yang proper
- Jika user kirim file (txt/doc), baca file dan extract requirement
- Jika user kirim pesan pendek/kurang jelas, minta klarifikasi

---

### 3. Cek Progress Project

**Trigger:** User tanya:
- "progress"
- "status"  
- "seberapa jauh"
- "gimana project [nama]"
- "/status [nama]"
- "/workflow [nama]"

**Steps:**

```
OpenClaw:
1. Baca progress.md dari folder project (atau dari project yang disebut user)
2. Baca user_requirement.md untuk lihat pending items
3. Kirim pesan ke user:
   ```
   📊 Progress Project "[Nama]"
   
   📌 Fase Aktif: [Nama Fase] ([%])
   Status Loop: [active / paused]
   
   ✅ Sudah selesai:
   - Fase 00: INIT ✓
   - Fase 01: DATABASE ✓
   - Fase 02: WIREFRAME ✓
   
   ➡️ Sedang dikerjakan:
   - Fase 03: BACKEND (60%)
     - Models ✓
     - Repositories ✓
     - Services ➡️
     - Controllers ⏳
   
   ⏳ Belum dimulai:
   - Fase 04: FRONTEND
   - Fase 05: AUDIT
   - Fase 06: DEPLOY
   
   👀 Menunggu approval:
   - Tidak ada
   
   ⏸️ Paused: [jika ada]
   ❌ Error: [jika ada]
   ```
```

**File yang dibaca:** `progress.md`, `user_requirement.md`

---

### 4. Approve Fase / Lanjut

**Trigger:** User bilang:
- "approve"
- "lanjut"
- "oke"
- "ya"
- ✅
- "setuju"
- "go"

**Steps:**

```
OpenClaw:
1. Baca progress.md — cari fase dengan status [👀]
2. Baca user_requirement.md — cari [APPROVAL_SECTION_START] dengan Status: PENDING
3. Jika ada fase yang nunggu approval:
   a. Update user_requirement.md:
      [APPROVAL_SECTION_START]
      Status: APPROVED
      Timestamp: [current timestamp]
      [APPROVAL_SECTION_END]
   
   b. Update progress.md:
      - Ubah status fase dari [👀] ke [⬜] (AI akan ubah ke [➡️] di iterasi berikutnya)
      - Hapus "menunggu approval" note
   
   c. Kirim pesan ke user:
      ```
      ✅ Approved! Fase [nama] disetujui.
      
      Melanjutkan ke fase berikutnya...
      
      Saya akan update status setelah AI selesai.
      ```
   
   d. Trigger AI loop (jika ada mekanisme trigger):
      - Update .claude/loop.md — set phase status ke "ready"
      - Atau via CLI: bash templates/claude-workflow.sh resume
   
4. Jika tidak ada fase yang nunggu approval:
   Kirim: "Saat ini tidak ada fase yang butuh approval. Cek progress dengan ketik 'progress'."
```

**File yang diupdate:** `user_requirement.md`, `progress.md`, `.claude/loop.md`

---

### 5. Reject / Minta Revisi

**Trigger:** User bilang:
- "revisi"
- "ganti"
- "jangan"
- "tidak setuju"
- "ubah [bagian]"
- "feedback: [teks]"

**Steps:**

```
OpenClaw:
1. Baca progress.md — cari fase dengan status [👀]
2. Baca user_requirement.md — cari [APPROVAL_SECTION_START] dengan Status: PENDING
3. Ekstrak feedback user dari pesan
4. Update user_requirement.md:
   
   [APPROVAL_SECTION_START]
   Status: REJECTED
   Feedback: [detail feedback user]
   Timestamp: [current timestamp]
   [APPROVAL_SECTION_END]
   
5. Update progress.md:
   - Ubah status fase dari [👀] ke [🔄] (menunggu revisi)
   - Tambah note: "Menunggu revisi berdasarkan feedback user"
   
6. Kirim pesan ke user:
   ```
   📝 Feedback dicatat!
   
   Perubahan yang diminta:
   - [poin 1]
   - [poin 2]
   
   Agent akan revisi di iterasi berikutnya.
   Saya akan kasih tau kalo udah selesai revisi.
   ```
```

**File yang diupdate:** `user_requirement.md`, `progress.md`

**Variant — Revisi dengan detail spesifik:**
- User: "ganti warna sidebar jadi biru" → OpenClaw catat sebagai feedback spesifik
- User: "tambah field nomor telepon di form user" → feedback spesifik
- User: "kurang tabel kategori" → feedback spesifik

---

### 6. Interupsi / Perintah Baru di Tengah Jalan

**Trigger:** User kirim perintah baru yang tidak terkait approval (di luar konteks fase saat ini).

**Steps:**

```
OpenClaw:
1. Identifikasi bahwa ini adalah perintah baru, bukan approval/reject
2. Tulis ke user_requirement.md:
   
   ## [PENDING] - Priority HIGH (interrupt)
   - [ ] [perintah user]
   
   Atau jika perintah tidak urgent:
   ## [PENDING] - Priority MEDIUM (interrupt)
   - [ ] [perintah user]
   
3. Kirim pesan ke user:
   ```
   ✋ Perintah baru tercatat sebagai INTERRUPT priority [HIGH/MEDIUM].
   
   Perintah: "[isi perintah user]"
   
   AI akan proses setelah fase saat ini selesai.
   
   Kalo urgent banget, bilang "stop dulu" untuk pause workflow sekarang.
   ```
```

**File yang diupdate:** `user_requirement.md`

**Penting:**
- Interupsi HIGH → diproses setelah fase saat ini selesai
- Interupsi MEDIUM → diproses setelah semua fase HIGH selesai
- Interupsi LOW → masuk antrian, diproses setelah semua fase di atasnya

---

### 7. List Semua Project

**Trigger:** User tanya:
- "list project"
- "semua project"
- "project apa aja"
- "/list"

**Steps:**

```
OpenClaw:
1. Scan folder projects/ — cari semua folder project
2. Atau baca project-registry.md (jika ada)
3. Untuk setiap project, baca progress.md — ambil status
4. Kirim pesan ke user:
   ```
   📋 Daftar Project:
   
   1. [Nama Project 1] — 🟢 Active — Fase 03: BACKEND
   2. [Nama Project 2] — ⏸️ Paused — Fase 02: WIREFRAME
   3. [Nama Project 3] — ✅ Completed
   
   Total: 3 project
   ```
```

**File yang dibaca:** `projects/*/progress.md` atau `project-registry.md`

---

### 8. Pause Loop

**Trigger:** User bilang:
- "pause"
- "berhenti dulu"
- "stop dulu"
- "/workflow pause [nama]"

**Steps:**

```
OpenClaw:
1. Baca progress.md
2. Update progress.md — set Status Loop ke "paused"
3. Update .claude/loop.md — set loop.status ke "paused"
4. Kirim pesan ke user:
   ```
   ⏸️ Project "[nama]" di-pause.
   
   Fase saat ini: [nama fase]
   
   Kapan aja bisa resume dengan bilang "resume [nama]".
   ```
```

**File yang diupdate:** `progress.md`, `.claude/loop.md`

---

### 9. Resume Loop

**Trigger:** User bilang:
- "resume"
- "lanjutkan"
- "jalan lagi"
- "/workflow resume [nama]"

**Steps:**

```
OpenClaw:
1. Baca progress.md — cek Status Loop
2. Jika paused:
   a. Update progress.md — set Status Loop ke "active"
   b. Update .claude/loop.md — set loop.status ke "active"
   c. Kirim pesan ke user:
      ```
      ▶️ Project "[nama]" di-resume!
      
      Melanjutkan fase [nama fase] dari posisi terakhir.
      ```
   d. Trigger AI loop
3. Jika active:
   Kirim: "Project [nama] masih berjalan. Cek progress dengan 'progress [nama]'."
```

**File yang diupdate:** `progress.md`, `.claude/loop.md`

---

### 10. Kirim Perintah Langsung ke AI (Prompt Injection)

**Trigger:** User bilang:
- "AI: [perintah]"
- "suruh AI [perintah]"
- /ai [perintah]

**Steps:**

```
OpenClaw:
1. Tulis perintah ke user_requirement.md dengan format:
   ```
   ## [AI DIRECTIVE]
   [perintah user]
   ```
2. Kirim pesan ke user:
   ```
   📨 Perintah dikirim ke AI.
   AI akan membaca dan merespon di iterasi berikutnya.
   ```
```

**File yang diupdate:** `user_requirement.md`

---

## 🗺️ Command Mapping Lengkap

### Primary Commands

| Perintah User | Action OpenClaw | File yang Diupdate | Keterangan |
|---------------|-----------------|-------------------|------------|
| `buat project [nama]` | Init project baru | `progress.md`, `user_requirement.md` | Copy template + setup |
| `mulai project [nama]` | Init project baru | `progress.md`, `user_requirement.md` | Sama seperti di atas |
| `requirement: [teks]` | Inject requirement | `user_requirement.md` | Parsing & format requirement |
| `progress` / `status` | Read & report | — | Baca progress.md → kirim ke user |
| `progress [nama]` | Read & report specific | — | Progress project tertentu |
| `approve` / `lanjut` / ✅ | Approve phase | `user_requirement.md` | Set approval → trigger AI |
| `revisi: [feedback]` | Reject with feedback | `user_requirement.md` | Set rejected → AI iterasi |
| `[perintah baru]` | Interrupt (otomatis) | `user_requirement.md` | Tulis sebagai interrupt |
| `list project` / `list` | Status all projects | — | Scan folder projects |
| `pause` | Pause loop | `progress.md`, `.claude/loop.md` | Stop sementara |
| `resume` / `lanjutkan` | Resume loop | `progress.md`, `.claude/loop.md` | Lanjut dari posisi pause |
| `AI: [perintah]` | Direct prompt ke AI | `user_requirement.md` | Tulis sebagai AI DIRECTIVE |

### Secondary Commands

| Perintah User | Action OpenClaw | Keterangan |
|---------------|-----------------|------------|
| `help` / `bantuan` | Kirim daftar command | List semua command yang tersedia |
| `hapus project [nama]` | Konfirmasi → hapus folder | BUTUH KONFIRMASI GANDA |
| `rename project [lama] [baru]` | Rename folder + update files | Update progress.md, user_requirement.md |
| `restart project [nama]` | Reset progress ke 0 | BUTUH KONFIRMASI — progress ilang |
| `deploy [nama]` | Trigger deploy phase | Langsung ke Phase 6 jika sudah audit |
| `backup [nama]` | Trigger backup manual | Backup database+file |
| `log [nama]` | Kirim error log | Baca error dari progress.md |

### Error Recovery Commands

| Perintah User | Action OpenClaw | Keterangan |
|---------------|-----------------|------------|
| `skip` | Skip step error | Tandai error step sebagai skipped |
| `retry` | Retry step error | Reset state → coba lagi |
| `rollback [nama]` | Rollback ke commit | Git checkout commit |
| `stop` / `kill` | Stop project permanen | Set status ke killed |

---

## 🔄 Siklus Operasi OpenClaw

### Main Loop (Trigger: Pesan User Masuk)

```
1. User kirim pesan via WhatsApp/Telegram
2. OpenClaw terima pesan
3. OpenClaw cocokkan dengan Command Mapping (di atas)
4. Jika cocok → eksekusi action
5. Jika tidak cocok → default action:
   a. Cek apakah project sedang aktif
   b. Jika ya → treat sebagai interupsi atau requirement
   c. Jika tidak → tanya user mau ngapain
6. Update file yang diperlukan
7. Kirim response ke user
```

### Heartbeat Loop (Trigger: Waktu / Periodik)

```
1. Setiap [N] menit (konfigurasi OpenClaw)
2. Baca progress.md dari semua project aktif
3. Cek apakah ada fase dengan status [👀] yang belum di-notify ke user
4. Jika ada → kirim pesan:
   "🔔 [Project] nunggu approval kamu untuk fase [nama]. Cek ya!"
5. Jika tidak ada → no action
```

### AI Loop (Trigger: approval diberikan / resume)

```
1. User approve atau resume
2. OpenClaw update user_requirement.md / progress.md
3. OpenClaw trigger AI (Claude Code) — via CLI atau API
4. AI baca file → eksekusi FLOW.md
5. AI update progress.md
6. AI minta approval (tulis ke user_requirement.md)
7. AI stop — tunggu OpenClaw lagi
8. OpenClaw baca progress.md — lihat approval request
9. OpenClaw kirim pesan ke user
10. Kembali ke Main Loop (step 1)
```

---

## ⚠️ Error Handling

### Kategori Error

| Kategori | Deskripsi | Tindakan OpenClaw |
|----------|-----------|-------------------|
| **File Not Found** | progress.md atau user_requirement.md tidak ada | Minta user setup ulang project |
| **Parse Error** | Format file tidak sesuai | Coba parse ulang, kalau gagal → kasih tau user |
| **AI Loop Error** | Claude Code error / hang | Kasih tau user → tanya retry/skip/stop |
| **Multi-Project Conflict** | User bicara soal project yang berbeda | Minta user spesifik: "Yang mana?" |
| **Unknown Command** | Perintah tidak dikenali | Kirim daftar command yang tersedia |

### Prosedur Error Handling

```
1. Error terdeteksi → catat internal
2. Jika minor (parse error, file not found):
   a. Coba recover otomatis
   b. Jika gagal → kasih tau user dengan solusi
3. Jika major (AI loop error, database error):
   a. Kasih tau user segera
   b. Tawarkan opsi: retry / skip / stop
   c. Tunggu instruksi user
4. Jika critical (project folder corrupt):
   a. Kasih tau user
   b. Tawarkan rollback atau restart project
```

### Contoh Error Handling

**File tidak ditemukan:**
```
OpenClaw: "progress.md untuk project [nama] tidak ditemukan.
Mau setup ulang project? (balas 'setup [nama]' atau 'buat project [nama]')"
```

**AI Loop error:**
```
OpenClaw: "⚠️ Ada masalah di AI saat mengerjakan [fase].
Error: [deskripsi error dari progress.md]

Opsi:
1. Retry — coba lagi dari awal fase
2. Skip — lewati step yang error
3. Stop — hentikan workflow
4. Rollback — kembalikan ke versi sebelumnya

Mau pilih yang mana?
```

---

## 🛠️ Integrasi dengan Tools Lain

### Git Integration

OpenClaw bisa cek status git jika user minta:

```
User: "cek git"
OpenClaw: 
1. cd [project folder]
2. git status
3. git log --oneline -5
4. Kirim hasil ke user:
   📦 Git Status — [Project]
   
   Branch: main
   Commit terakhir: [hash] - [message]
   Status: ✅ Clean (no uncommitted changes)
   
   Atau:
   Status: ⚠️ [N] file belum di-commit
```

### Database Integration

OpenClaw tanya dulu ke user kredensial DB:

```
User: "mulai project toko"
OpenClaw: 
🚀 Project "toko" siap!

Sebelum mulai, saya butuh akses database:
1. DB Host: (contoh: localhost)
2. DB Port: (contoh: 3306)
3. DB Name: (contoh: db_toko)
4. Username: (contoh: root)
5. Password: (atau kosong)

Kirim format: "DB: localhost:3306/db_toko user/pass"
```

### Deployment Integration

OpenClaw tanya server/dns info ke user:

```
Setelah audit selesai:
OpenClaw: "🚀 Waktunya deploy!

Untuk deploy, saya butuh:
1. Server IP: (contoh: 123.123.123.123)
2. SSH Port: (default 22)
3. Username: (contoh: root)
4. SSH Key/Password:
5. Domain (jika ada): (contoh: toko.com)
6. Sudah ada Nginx? (Ya/Tidak)

Kirim format: "DEPLOY: [IP]:[port] [user] domain:[domain.com]"
```

---

## 📝 Catatan Penting untuk OpenClaw

### Yang BOLEH Dilakukan OpenClaw
- ✅ Membaca dan mengupdate file markdown (`.md`)
- ✅ Routing pesan antara User dan AI Agent
- ✅ Parsing perintah user dari chat
- ✅ Mengirim notifikasi ke user
- ✅ Mengecek status file secara periodik
- ✅ Menulis approval/interupsi ke `user_requirement.md`
- ✅ Meng-update status di `progress.md`
- ✅ Trigger AI (Claude Code) via CLI
- ✅ Membaca dan menampilkan informasi dari file (progress, audit, dll.)
- ✅ Menulis format requirement yang proper

### Yang TIDAK BOLEH Dilakukan OpenClaw
- ❌ **Menulis kode** — semua coding dilakukan Claude Code
- ❌ **Mengubah file selain .md** — terutama di backend/, frontend/, database/
- ❌ **Menjalankan migration database** — dilakukan Claude Code
- ❌ **Mengubah environment variables** — dilakukan Claude Code saat deploy
- ❌ **Mengubah git history** (kecuali clone/init) — dilakukan Claude Code
- ❌ **Menghapus project tanpa konfirmasi ganda**
- ❌ **Mengambil keputusan teknis** — AI (Claude Code) yang memutuskan
- ❌ **Override approval** — hanya user yang bisa approve
- ❌ **Skip error tanpa kasih tau user**

### Prinsip Utama OpenClaw

1. **Orchestrator, bukan executor** — OpenClaw mengatur flow, bukan mengerjakan
2. **File-based communication** — semua komunikasi lewat file .md
3. **Pasif reader** — OpenClaw baca file, AI yang menulis
4. **User-first** — semua keputusan ada di user
5. **One source of truth** — progress.md adalah satu-satunya sumber kebenaran

---

## 🔗 Cross-Reference

| File | Fungsi | SKILL.md Section |
|------|--------|-------------------|
| `FLOW.md` | Master flow AI autonomous execution | Semua workflow trigger → AI |
| `RULES-OF-THE-GAME.md` | Aturan wajib Sainskerta | Semua workflow (aturan berlaku untuk semua) |
| `TEMPLATE-ARCHITECTURE.md` | Template tanya jawab arsitektur | Workflow #1 (Init project) |
| `CLI.md` | Panduan CLI untuk workflow | Command Mapping, AI Loop |
| `templates/progress.md` | Template progress tracking | File Structure, progress.md format |
| `templates/user_requirement.md` | Template requirement & approval | File Structure, user_requirement.md format |
| `templates/loop.md` | Template loop state | File Structure, AI Loop trigger |
| `phases/00-PREREQUISITES.md` | Detail fase persiapan | Workflow #1 (Init project) |
| `phases/01-PLANNING.md` | Detail fase planning | Workflow #2 (Inject requirement) |
| `phases/02-WIREFRAME-AUDIT.md` | Detail fase wireframe | Workflow #5 (Reject/revisi) |
| `phases/03-BACKEND.md` | Detail fase backend | Workflow #4 (Approve) |
| `phases/04-FRONTEND.md` | Detail fase frontend | Workflow #4 (Approve) |
| `phases/05-AUDIT.md` | Detail fase audit | Workflow #3 (Cek progress) |
| `phases/06-DEPLOYMENT.md` | Detail fase deployment | Workflow #8 (Deploy integration) |
| `phases/07-IMPROVEMENT.md` | Detail fase improvement | Workflow #6 (Interupsi) |
| `standards/SAINSKERTA-RULES.md` | Standar aturan detail | Semua workflow |
| `standards/MODULAR-MONOLITH.md` | Standar arsitektur | Workflow #1 (Init project) |
| `standards/UI-UX-STANDARDS.md` | Standar UI/UX | Workflow #5 (Reject/revisi wireframe) |
| `standards/DATABASE-RULES.md` | Standar database | Workflow #1 (DB integration) |
| `standards/AI-PROVIDERS.md` | Standar AI provider | Workflow #1 (Init — arsitektur) |

---

## 📦 File Dependencies

Untuk menjalankan skill ini, file berikut harus ada di folder sainskerta-loop-workflow/:

```
sainskerta-loop-workflow/
├── FLOW.md                       ← (Wajib) Master flow AI
├── SKILL.md                      ← (Wajib) File ini
├── README.md                     ← (Wajib) Dokumentasi workflow
├── RULES-OF-THE-GAME.md          ← (Wajib) Aturan Sainskerta
├── TEMPLATE-ARCHITECTURE.md      ← (Wajib) Template arsitektur
├── CLI.md                        ← (Opsional) Panduan CLI
├── templates/
│   ├── progress.md               ← (Wajib) Template progress
│   ├── user_requirement.md       ← (Wajib) Template requirement
│   ├── loop.md                   ← (Wajib) Template loop state
│   └── claude-workflow.sh        ← (Opsional) Script workflow
├── phases/
│   ├── 00-PREREQUISITES.md       ← (Saran) Detail fase
│   ├── 01-PLANNING.md            ← (Saran)
│   ├── 02-WIREFRAME-AUDIT.md     ← (Saran)
│   ├── 03-BACKEND.md             ← (Saran)
│   ├── 04-FRONTEND.md            ← (Saran)
│   ├── 05-AUDIT.md               ← (Saran)
│   ├── 06-DEPLOYMENT.md          ← (Saran)
│   └── 07-IMPROVEMENT.md         ← (Saran)
├── standards/
│   ├── SAINSKERTA-RULES.md       ← (Saran)
│   ├── MODULAR-MONOLITH.md       ← (Saran)
│   ├── UI-UX-STANDARDS.md        ← (Saran)
│   ├── DATABASE-RULES.md         ← (Saran)
│   └── AI-PROVIDERS.md           ← (Saran)
└── scripts/
    ├── setup-workflow.sh         ← (Opsional) Setup script
    └── monitor.sh                ← (Opsional) Monitoring script
```

---

## 🚀 Quick Start (Cara Pasang Skill ke OpenClaw)

```yaml
# Contoh konfigurasi OpenClaw untuk memasang skill ini
# Letakkan di konfigurasi OpenClaw (sesuai platform)

skills:
  - name: sainskerta-loop-workflow
    path: /root/.openclaw/workspace/sainskerta-loop-workflow/
    enabled: true
    triggers:
      - "buat project"
      - "mulai project"
      - "progress"
      - "approve"
      - "lanjut"
      - "revisi"
      - "pause"
      - "resume"
      - "list project"
```

---

*Skill Version: 1.0*
*Last Updated: 2026-06-19*
*Referensi: [FLOW.md](FLOW.md) — Panduan AI untuk eksekusi workflow*
