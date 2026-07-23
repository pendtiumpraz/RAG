# Fase 00: Prerequisites

> **Fase persiapan — ini WAJIB dilakukan SEBELUM project dikerjakan. Tanpa prerequisites, project tidak bisa dimulai.**

---

## 📋 Checklist Prerequisites

### □ 1. Database Access dari User

User WAJIB menyediakan akses database. Tanpa ini, project **tidak bisa dimulai**.

**User harus memberikan:**
- Host database (misal: `localhost` atau `192.168.1.100`)
- Port database (default: `3306` untuk MySQL, `5432` untuk PostgreSQL)
- Username database
- Password database
- Nama database (harus sudah dibuat)

**Jika user tidak punya:**
- Bantu user setup database di server mereka
- Atau setup di local untuk development sementara

**⚠️ Catatan:** Jangan pernah menyimpan credentials di kode. Pakai `.env` file.

### □ 2. Framework & Target Deployment dari User

User menentukan:
- **Framework Backend:** Laravel, Next.js, Express, Django, dll
- **Framework Frontend:** React, Vue, Svelte, dll
- **CSS Framework:** Tailwind, Bootstrap, dll
- **Database Engine:** MySQL, PostgreSQL, SQLite
- **Target Deployment:** VPS, shared hosting, cloud
- **Domain:** sudah/belum
- **SSL:** sudah/belum

**Template tanya jawab:** Lihat [TEMPLATE-ARCHITECTURE.md](../TEMPLATE-ARCHITECTURE.md)

### □ 3. Requirement Dasar

User memberikan requirement dasar project di `user_requirement.md`.

**Minimal requirement:**
- Nama project
- Tujuan/fungsi utama project
- Fitur-fitur yang dibutuhkan
- Target pengguna
- Deadline (jika ada)

### □ 4. Setup Environment

Setup environment development:

```bash
# Contoh untuk Laravel + React
composer create-project laravel/laravel project-name
npm create vite@latest frontend -- --template react

# Setup environment variables
cp .env.example .env
# Isi DB credentials dari user
```

### □ 5. Setup Version Control

```bash
git init
git add .
git commit -m "init: project setup by Sainskerta Loop Workflow"
```

### □ 6. Install Workflow Files

```bash
# Copy workflow files ke project
bash /path/to/sainskerta-loop-workflow/scripts/setup-workflow.sh
```

Atau manual:
```bash
# Copy folder
mkdir -p .claude standards templates phases scripts

# Init loop state
cat > .claude/loop.md << 'EOF'
# Loop Status
fase_saat_ini: "00-PREREQUISITES"
status: "active" # active | paused | completed | killed
started_at: ""
completed_at: ""
current_phase_status: "in_progress"
EOF
```

---

## ✅ Output Fase 00

Setelah fase ini selesai, harus ada:
- [x] Database credentials terisi di `.env`
- [x] Framework sudah dipilih dan ter-install
- [x] Requirement dasar ada di `user_requirement.md`
- [x] Project folder sudah ter-structure
- [x] Git initialized
- [x] Workflow files ter-install
- [x] `.claude/loop.md` berstatus "ready"

---

## ▶️ Lanjut ke Fase 01

Kalau semua checklist sudah terpenuhi, update `progress.md` dan lanjut ke fase [01-PLANNING.md](01-PLANNING.md).

```bash
# Update progress
echo "## Fase 00: ✅ Selesai" >> progress.md

# Update loop state
# Set status ke '01-PLANNING'
```

---

## 🔗 Referensi

- [RULES-OF-THE-GAME.md](../RULES-OF-THE-GAME.md) — Aturan wajib project
- [TEMPLATE-ARCHITECTURE.md](../TEMPLATE-ARCHITECTURE.md) — Template tanya jawab arsitektur
- [standards/DATABASE-RULES.md](../standards/DATABASE-RULES.md) — Aturan database
- [templates/user_requirement.md](../templates/user_requirement.md) — Template requirement user
- [templates/progress.md](../templates/progress.md) — Template tracking progress
