# Fase 01: Planning

> **Fase perencanaan — menentukan blueprint arsitektur project sebelum coding dimulai. Semua keputusan kritis ditentukan di sini bersama user.**

---

## 🎯 Tujuan

1. Menganalisa requirement dari `user_requirement.md`
2. Menentukan arsitektur sesuai aturan [RULES-OF-THE-GAME.md](../RULES-OF-THE-GAME.md)
3. Tanya jawab dengan user via `user_requirement.md`
4. Membuat roadmap development
5. Setup environment detail

---

## 📋 Langkah-Langkah

### Langkah 1: Analisa Requirement

Baca `user_requirement.md`, ekstrak:

- **Fitur utama** — apa saja yang harus dibuat?
- **Entities/Models** — apa saja data yang perlu disimpan?
- **Relasi antar entity** — bagaimana hubungan data?
- **UI requirements** — halaman apa saja yang dibutuhkan?
- **Business logic** — aturan bisnis khusus?

**Output:** Ringkasan requirement di `progress.md`

### Langkah 2: Breakdown Arsitektur

Gunakan [TEMPLATE-ARCHITECTURE.md](../TEMPLATE-ARCHITECTURE.md) untuk tanya jawab dengan user.

**Wajib ditanyakan ke user:**
1. ✅ Framework backend
2. ✅ Framework frontend
3. ✅ Database engine
4. ✅ Deployment target
5. ✅ Domain & SSL
6. ✅ Integrasi AI (jika ada)
7. ✅ Fitur tambahan (auth, upload, queue, dll)

**Cara tanya:**
```
[AI] Halo! Untuk memulai project, saya perlu beberapa informasi:

1. Framework backend apa yang kamu mau? (Laravel/Next.js/Express/dll)
2. Framework frontend? (React/Vue/Svelte)
3. Database? (MySQL/PostgreSQL/SQLite)
4. Target deploy dimana? (VPS/shared hosting/cloud)
5. Ada domain? Butuh SSL?
6. Butuh integrasi AI? Provider apa?

Silakan jawab di user_requirement.md ya!
```

### Langkah 3: Tanya Jawab dengan User

- User jawab di `user_requirement.md`
- AI baca, tanya follow-up jika perlu
- Iterasi sampai semua jelas
- **Jangan lanjut sebelum semua keputusan firm**

### Langkah 4: Buat Project Structure

Berdasarkan arsitektur yang dipilih, buat struktur folder:

**Contoh untuk Laravel + React + MySQL:**

```
project-name/
├── backend/               ← Laravel
│   ├── app/
│   │   ├── Modules/       ← Modular Monolith modules
│   │   │   ├── User/
│   │   │   │   ├── Controllers/
│   │   │   │   ├── Models/
│   │   │   │   ├── Repositories/
│   │   │   │   ├── Services/
│   │   │   │   └── Routes/
│   │   │   ├── Product/
│   │   │   └── Transaction/
│   │   └── ...
│   ├── database/
│   │   └── migrations/
│   └── routes/
├── frontend/              ← React
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── services/
│   │   └── layouts/
│   └── ...
├── .claude/               ← Workflow files
│   └── loop.md
├── progress.md             ← Tracking
└── user_requirement.md     ← Requirements
```

### Langkah 5: Setup Environment Detail

Berdasarkan arsitektur yang dipilih:

```bash
# Jika Laravel
composer create-project laravel/laravel .
php artisan storage:link

# Jika React
npx create-vite frontend --template react
cd frontend && npm install

# Setup .env
# DB_HOST, DB_PORT, DB_DATABASE, DB_USERNAME, DB_PASSWORD
```

### Langkah 6: Buat Roadmap

Breakdown fitur ke dalam task per fase:

```markdown
## Roadmap

### Phase 03 — Backend
- [ ] Migration: users table
- [ ] Migration: products table
- [ ] Migration: transactions table
- [ ] Model & Repository User
- [ ] Model & Repository Product
- [ ] Model & Repository Transaction
- [ ] Auth API (login, register)
- [ ] CRUD API User
- [ ] CRUD API Product
- [ ] CRUD API Transaction

### Phase 04 — Frontend
- [ ] Setup layout (sidebar)
- [ ] Halaman User (list + modal)
- [ ] Halaman Product (list + modal)
- [ ] Halaman Transaction (list + modal)
- [ ] Integrasi semua API
```

---

## ✅ Output Fase 01

Setelah fase ini selesai:
- [x] Requirement sudah dianalisa
- [x] Framework backend & frontend ditentukan
- [x] Database engine ditentukan
- [x] Deployment target ditentukan
- [x] Project structure sudah dibuat
- [x] Environment sudah ter-setup
- [x] Roadmap sudah dibuat
- [x] User sudah setuju dengan keputusan arsitektur

---

## ▶️ Lanjut ke Fase 02

Setelah semua keputusan arsitektur firm, update progress dan lanjut ke [02-WIREFRAME-AUDIT.md](02-WIREFRAME-AUDIT.md).

---

## 🔗 Referensi

- [TEMPLATE-ARCHITECTURE.md](../TEMPLATE-ARCHITECTURE.md) — Template tanya jawab
- [RULES-OF-THE-GAME.md](../RULES-OF-THE-GAME.md) — Aturan wajib
- [standards/MODULAR-MONOLITH.md](../standards/MODULAR-MONOLITH.md) — Arsitektur modular
- [standards/UI-UX-STANDARDS.md](../standards/UI-UX-STANDARDS.md) — Standar UI/UX yang akan dipake di wireframe
- [templates/user_requirement.md](../templates/user_requirement.md) — Template requirement
