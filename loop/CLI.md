# CLI.md — Sainskerta Loop Workflow Command Guide

> **Panduan lengkap command untuk menjalankan workflow Sainskerta di CLI.**

---

## 📦 Setup Workflow

Menyiapkan workflow untuk project baru.

```bash
# Dari dalam folder project yang sudah dibuat
cd /path/to/project-baru

# Clone workflow ke project
cp -r /path/to/sainskerta-loop-workflow/* .
# atau
bash /path/to/sainskerta-loop-workflow/scripts/setup-workflow.sh
```

**Setup akan:**
1. Membuat folder structure (jika belum ada)
2. Meng-copy template files
3. Membuat file `.claude/loop.md`
4. Membuat file `user_requirement.md` (kosong, siap diisi)

---

## 🔄 Mulai Loop

Memulai atau melanjutkan siklus workflow.

```bash
# Manual
bash templates/claude-workflow.sh start

# Dengan fase spesifik
bash templates/claude-workflow.sh start --fase 01-PLANNING

# Langsung ke fase tertentu
php cli/workflow.php fase:set 03-BACKEND

# Melalui OpenClaw (VPS mode)
# Kirim: /workflow start namaproject
```

**Output:** File `progress.md` akan ter-update dengan fase saat ini.

---

## 📝 Inject Requirement

Memasukkan requirement dari user ke dalam workflow.

```bash
# Manual — edit user_requirement.md
nano user_requirement.md

# Lalu inject ke workflow
bash templates/claude-workflow.sh inject user_requirement.md
```

**Format user_requirement.md:**

```markdown
## Requirement

### Fitur Utama
1. Manajemen users (CRUD)
2. Manajemen produk (CRUD)
3. Laporan penjualan

### Catatan
- Butuh dashboard
- Role: admin dan staff
```

---

## 📊 Cek Progress

Melihat status workflow saat ini.

```bash
# Lihat progress
cat progress.md

# Cek status loop
cat .claude/loop.md

# Cek fase aktif
bash templates/claude-workflow.sh status

# Melalui OpenClaw
# Kirim: /workflow status namaproject
```

**Progress.md akan menampilkan:**
- Fase aktif saat ini
- Fase yang sudah selesai
- Fase yang belum dimulai
- Checklist tiap fase
- Issue/blocker (jika ada)

---

## ⏸️ Pause Loop

Menjeda workflow di tengah jalan.

```bash
# Pause
bash templates/claude-workflow.sh pause

# Atau set status
php cli/workflow.php fase:pause

# Melalui OpenClaw
# Kirim: /workflow pause namaproject
```

**Saat paused:**
- Loop berhenti di fase saat ini
- State disimpan ke `.claude/loop.md`
- Bisa di-resume kapan saja

---

## ▶️ Resume Loop

Melanjutkan workflow yang di-pause.

```bash
# Resume dari posisi terakhir
bash templates/claude-workflow.sh resume

# Resume dari fase tertentu
bash templates/claude-workflow.sh resume --fase 02-WIREFRAME-AUDIT

# Melalui OpenClaw
# Kirim: /workflow resume namaproject
```

---

## 🛑 Kill Loop

Menghentikan workflow secara permanen.

```bash
# Stop total (permanen untuk sesi ini)
bash templates/claude-workflow.sh kill

# Hapus state loop
rm .claude/loop.md

# Melalui OpenClaw
# Kirim: /workflow kill namaproject
```

**Catatan:** Kill tidak menghapus project. Hanya menghentikan workflow loop. Project tetap bisa dilanjutkan manual.

---

## 🚀 Quick Commands (Shortcut)

| Perintah | Deskripsi |
|----------|-----------|
| `make setup` | Setup workflow + environment |
| `make start` | Mulai loop fase pertama |
| `make status` | Lihat status loop |
| `make next` | Lanjut ke fase berikutnya |
| `make pause` | Pause loop |
| `make resume` | Resume loop |
| `make kill` | Hentikan loop |

*(Shortcut di atas tersedia jika project memiliki Makefile)*

---

## 🔧 Advanced Commands

### Fase Jumping
```bash
# Langsung ke fase tertentu (lewati fase sebelumnya)
bash templates/claude-workflow.sh jump --fase 06-DEPLOYMENT

# Reset ke fase awal
bash templates/claude-workflow.sh reset
```

### Inject Multiple Requirements
```bash
# Inject dari file lain
bash templates/claude-workflow.sh inject --file requirement-extended.md

# Append (tambah, bukan replace)
bash templates/claude-workflow.sh inject --append catatan-tambahan.md
```

### Debug Mode
```bash
# Lihat semua state
bash templates/claude-workflow.sh debug

# Export state
bash templates/claude-workflow.sh export > workflow-state.json

# Import state
bash templates/claude-workflow.sh import workflow-state.json
```

---

## 🔗 Referensi Fase

| Fase | Deskripsi | Command |
|------|-----------|---------|
| `00-PREREQUISITES` | Persiapan DB & environment | `start --fase 00` |
| `01-PLANNING` | Analisa & breakdown arsitektur | `start --fase 01` |
| `02-WIREFRAME-AUDIT` | Wireframe → Mockup → Approve | `start --fase 02` |
| `03-BACKEND` | Backend coding | `start --fase 03` |
| `04-FRONTEND` | Frontend coding | `start --fase 04` |
| `05-AUDIT` | Pre-deploy audit | `start --fase 05` |
| `06-DEPLOYMENT` | Deployment | `start --fase 06` |
| `07-IMPROVEMENT` | Loop improvement | `start --fase 07` |

---

## 💬 OpenClaw WhatsApp Commands

Jika workflow dijalankan di VPS via OpenClaw:

| Pesan WhatsApp | Aksi |
|----------------|------|
| `/start-project namaproject` | Setup project baru |
| `/workflow namaproject` | Cek status project |
| `/requirement ...` | Kirim requirement |
| `/approve wireframe` | Approve wireframe |
| `/deploy namaproject` | Mulai deployment |
| `/status namaproject` | Cek status real-time |

---

## 🔗 Referensi

- [phases/00-PREREQUISITES.md](phases/00-PREREQUISITES.md) — Detail fase persiapan
- [phases/01-PLANNING.md](phases/01-PLANNING.md) — Detail fase planning
- [templates/claude-workflow.sh](templates/claude-workflow.sh) — Script utama
- [templates/loop.md](templates/loop.md) — Template state loop
