# FLOW.md — Sainskerta Loop Workflow
## Master Flow untuk AI Autonomous Execution

> **Dokumen ini adalah panduan utama bagi AI (Claude Code) untuk menjalankan project Sainskerta dari 0 hingga selesai secara FULLY AUTOMATED.**
>
> User hanya melakukan APPROVE di titik-titik tertentu. Semua eksekusi teknis dikerjakan oleh AI.
>
> **Bahasa:** Indonesia
> **Versi:** 1.0
> **Status:** 🟢 Active

---

## 📋 Daftar Isi

1. [Arsitektur Flow](#arsitektur-flow)
2. [Phase 0: INIT — AI Auto-Analyze Requirement](#phase-0-init--ai-auto-analyze-requirement)
3. [Phase 1: DATABASE — AI Build Schema](#phase-1-database--ai-build-schema)
4. [Phase 2: WIREFRAME — AI Generate + User Feedback Loop](#phase-2-wireframe--ai-generate--user-feedback-loop)
5. [Phase 3: BACKEND — AI Build Full Backend](#phase-3-backend--ai-build-full-backend)
6. [Phase 4: FRONTEND — AI Build Full Frontend](#phase-4-frontend--ai-build-full-frontend)
7. [Phase 5: AUDIT — AI Auto-Audit](#phase-5-audit--ai-auto-audit)
8. [Phase 6: DEPLOY — AI Deploy](#phase-6-deploy--ai-deploy)
9. [Phase 7: IMPROVEMENT — AI Maintenance Loop](#phase-7-improvement--ai-maintenance-loop)
10. [Approval Flow Detail](#approval-flow-detail)
11. [AI Auto-Fill Rules](#ai-auto-fill-rules)
12. [Error Recovery](#error-recovery)
13. [Referensi File](#referensi-file)

---

## Arsitektur Flow

```
                                    ┌─────────────────────────────────────────────────────────────┐
                                    │                    OPENCLAW (Orchestrator)                    │
                                    │  WhatsApp/Telegram ──► SKILL.md ──► progress.md              │
                                    │  ──► user_requirement.md ──► Inject ke Claude Code            │
                                    └──────────┬──────────────────────────────────────────────────┘
                                               │
                    ┌──────────────────────────┼──────────────────────────┐
                    │                          │                          │
                    ▼                          ▼                          ▼
        ┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
        │  USER (via WA/TG)   │    │  user_requirement   │    │   AI AGENT           │
        │                     │    │     .md             │    │   (Claude Code)       │
        │  • Kirim requirement│◄──►│                     │◄──►│                       │
        │  • Approve ✅       │    │  [PENDING] - HIGH   │    │  • Baca requirement   │
        │  • Kasih feedback   │    │  [PENDING] - MED    │    │  • Eksekusi fase      │
        │  • Minta revisi     │    │  [DONE]             │    │  • Tulis ke progress   │
        │  • Interupsi        │    │  [REJECTED]         │    │  • Minta approval      │
        └─────────────────────┘    └─────────────────────┘    └──────────┬──────────┘
                                                                         │
                                                                         ▼
                                                  ┌─────────────────────────────────────┐
                                                  │         FLOW LOOPS (Phases)          │
                                                  │                                     │
                                                  │  Phase 0: INIT ──────────────────►  │
                                                  │       │ AI analisa requirement        │
                                                  │       ▼ User approve                  │
                                                  │  Phase 1: DATABASE ──────────────►  │
                                                  │       │ AI bikin schema              │
                                                  │       ▼ User approve                  │
                                                  │  Phase 2: WIREFRAME ────────────►  │
                                                  │       │ AI generate + feedback        │
                                                  │       ▼ User approve                  │
                                                  │  Phase 3: BACKEND ──────────────►   │
                                                  │       │ AI build full backend        │
                                                  │       ▼ User approve                  │
                                                  │  Phase 4: FRONTEND ─────────────►   │
                                                  │       │ AI build full frontend       │
                                                  │       ▼ User approve                  │
                                                  │  Phase 5: AUDIT ─────────────────►   │
                                                  │       │ AI auto-audit                │
                                                  │       ▼ User approve                  │
                                                  │  Phase 6: DEPLOY ───────────────►   │
                                                  │       │ AI deploy to production      │
                                                  │       ▼ User approve                  │
                                                  │  Phase 7: IMPROVEMENT ──────────►   │
                                                  │       │ AI maintenance loop          │
                                                  │       ▼ (back to Phase 0 for new     │
                                                  │          requirements)                │
                                                  └─────────────────────────────────────┘
                                                                         │
                                                                         ▼
                                                  ┌─────────────────────────────────────┐
                                                  │         OUTPUT FILES                 │
                                                  │                                     │
                                                  │  progress.md  ← Status real-time    │
                                                  │  user_requirement.md ← Input user   │
                                                  │  architecture-decisions.md ← ADR    │
                                                  │  audit-report.md ← Hasil audit      │
                                                  │  deployment-log.md ← Log deploy     │
                                                  └─────────────────────────────────────┘
```

**Siklus lengkap:**
1. User kirim pesan → OpenClaw (SKILL.md) → update `user_requirement.md`
2. AI (Claude Code) baca `user_requirement.md` → eksekusi fase sesuai FLOW.md
3. AI update `progress.md` + tulis output (kode, schema, wireframe)
4. AI minta approval → tulis ke `user_requirement.md` → OpenClaw kirim pesan ke user
5. User approve/reject → OpenClaw update `user_requirement.md`
6. AI baca approval → lanjut ke fase berikutnya atau iterasi
7. **Repeat** sampai semua fase selesai

---

## Phase 0: INIT — AI Auto-Analyze Requirement

> **Tujuan:** AI membaca requirement dari `user_requirement.md`, menganalisa, mem-breakdown fitur, menentukan arsitektur, dan menyiapkan project.

### Step-by-Step AI Execution

#### Step 0.1: Baca Requirement
```
Input: user_requirement.md
Output: Analisis requirement di memory AI
```

**Yang dilakukan AI:**
1. Baca file `user_requirement.md` dari root project
2. Identifikasi semua fitur yang disebutkan
3. Kelompokkan fitur ke dalam modul (sesuai Modular Monolith)
4. Tentukan prioritas masing-masing fitur (HIGH/MEDIUM/LOW)
5. Catat batasan khusus yang disebutkan user

**Output ke progress.md:**
```
- [✅] Baca user_requirement.md
- [✅] Identifikasi [N] fitur
- [✅] Kelompokkan ke [N] modul
- [➡️] Tentukan arsitektur...
```

#### Step 0.2: Analisa & Breakdown Fitur
```
Input: Hasil Step 0.1
Output: Fitur breakdown di progress.md
```

**Yang dilakukan AI:**
1. Untuk setiap fitur, breakdown ke sub-tasks:
   - Backend: endpoint API, model, service, validasi
   - Frontend: halaman, komponen, form, state management
   - Database: tabel, kolom, relasi
2. Tentukan dependensi antar fitur
3. Tentukan mana yang bisa dikerjakan paralel
4. Catat ke `progress.md` — bagian "Rencana Eksekusi"

**Output ke progress.md (bagian Rencana Eksekusi):**
```
## Rencana Eksekusi

### Modul 1: Manajemen Users
- [ ] DB: tabel users, roles, permissions
- [ ] BE: CRUD User endpoint
- [ ] BE: Auth middleware
- [ ] FE: Halaman users list
- [ ] FE: Modal create/edit user
- Dependensi: Tidak ada
- Prioritas: HIGH

### Modul 2: ...
```

#### Step 0.3: Tentukan Arsitektur
```
Input: Hasil Step 0.1 + 0.2 + RULES-OF-THE-GAME.md
Output: architecture-decisions.md
```

**Yang dilakukan AI:**
1. Baca `RULES-OF-THE-GAME.md` untuk aturan wajib
2. Baca `TEMPLATE-ARCHITECTURE.md` untuk template tanya jawab
3. Isi keputusan arsitektur berdasarkan **AI Auto-Fill Rules** (lihat bagian terpisah)
4. Buat file `architecture-decisions.md` dengan format berikut:

```markdown
# Architecture Decisions — [Nama Project]

## Keputusan Arsitektur

| Aspek | Keputusan | Alasan |
|-------|-----------|--------|
| Backend Framework | [Laravel / Next.js] | [Alasan] |
| Frontend Framework | [React / Vue / ...] | [Alasan] |
| CSS Framework | [Tailwind CSS] | [Alasan] |
| Database | [MySQL / PostgreSQL] | [Alasan] |
| Deployment | [VPS] | [Alasan] |
| Arsitektur | Modular Monolith | Aturan Sainskerta |
| Soft Delete | Wajib semua tabel | Aturan Sainskerta |
| CRUD Pattern | One page + right drawer | Aturan Sainskerta |
```

5. Tulis ke `user_requirement.md` — bagian Arsitektur — untuk persetujuan user
6. Update `progress.md` — set status ke "👀 Nunggu approval user"

#### Step 0.4: Minta Approval User (via OpenClaw)
```
State: progress.md → [👀] Nunggu approval user
```

**Yang dilakukan AI:**
1. Tulis ke `user_requirement.md`:
   ```
   ## [APPROVAL NEEDED] — Arsitektur Project
   
   Berikut rekomendasi arsitektur untuk project [nama]:
   
   **Backend:** Laravel 11
   **Frontend:** React + Next.js 14 + Tailwind CSS
   **Database:** MySQL 8
   **Deployment:** VPS Ubuntu
   
   Detail lengkap: architecture-decisions.md
   
   User, silakan approve atau minta perubahan.
   ```
2. Update `progress.md` — set fase 0 ke status `👀 menunggu approval`
3. Stop eksekusi AI. Tunggu input dari OpenClaw.

**Setelah user approve (via OpenClaw):**
1. AI baca `user_requirement.md` — lihat approval
2. Lanjut ke **Step 0.5**

#### Step 0.5: Setup Project Structure + Environment
```
Input: Approval dari user
Output: Project structure siap
```

**Yang dilakukan AI:**
1. Buat folder structure project:
   ```
   project-name/
   ├── backend/           # Backend codebase
   ├── frontend/          # Frontend codebase
   ├── database/          # Migration & seed
   ├── docs/              # Dokumentasi
   ├── wireframes/        # Output wireframe
   ├── .env.example
   ├── .gitignore
   ├── progress.md
   ├── user_requirement.md
   └── architecture-decisions.md
   ```
2. Initialize Git: `git init`
3. Setup backend framework (composer create-project / npm init)
4. Setup frontend framework (create-next-app / vite)
5. Setup database connection di `.env`
6. Commit: `git add . && git commit -m "init: project structure"`
7. Update `progress.md` — semua checklist Phase 0 centang ✅

**Output checklist di progress.md:**
```
### ✅ Fase 00: INIT — Selesai
- [✅] Baca user_requirement.md
- [✅] Analisa & breakdown [N] fitur
- [✅] Tentukan arsitektur
- [✅] User approve arsitektur
- [✅] Setup project structure
- [✅] Initialize Git
- [✅] Setup environment
```

#### Step 0.6: Lanjut ke Phase 1
- Update `progress.md` — set Phase 1 ke `[➡️] Sedang dikerjakan`
- Mulai eksekusi Phase 1

---

## Phase 1: DATABASE — AI Build Schema

> **Tujuan:** AI membuat migration database, menjalankan seeder, dan memastikan schema siap untuk development.

### Step-by-Step AI Execution

#### Step 1.1: Analisa Kebutuhan Database
```
Input: user_requirement.md + architecture-decisions.md
Output: Daftar tabel, kolom, relasi
```

**Yang dilakukan AI:**
1. Dari breakdown fitur, tentukan semua tabel yang dibutuhkan
2. Untuk setiap tabel, tentukan kolom, tipe data, index
3. Tentukan relasi antar tabel (tanpa FK — sesuai aturan)
4. Pastikan soft delete di setiap tabel (`deleted_at` TIMESTAMP nullable)

**Aturan database yang WAJIB dipatuhi:**
- ✅ Snake_case untuk nama tabel dan kolom
- ✅ `id` sebagai primary key (BIGINT AUTO_INCREMENT / UUID)
- ✅ `created_at` dan `updated_at` timestamps
- ✅ `deleted_at` nullable timestamp (soft delete)
- ✅ NO foreign key constraints — handle di aplikasi
- ✅ Index di kolom yang sering di-query
- ✅ No reserved words untuk nama tabel/kolom

Lihat [standards/DATABASE-RULES.md](standards/DATABASE-RULES.md)

**Output ke progress.md:**
```
- [✅] Analisa kebutuhan tabel → [N] tabel
- [➡️] Bikin migration files...
```

#### Step 1.2: Generate Migration Files
```
Input: Daftar tabel dari Step 1.1
Output: File migration (backend/database/migrations/)
```

**Yang dilakukan AI:**
1. Generate migration untuk setiap tabel
2. Prioritaskan tabel master (yang tidak punya dependensi) duluan

**Urutan migration (contoh):**
```
1. create_users_table.php         — Tabel master
2. create_roles_table.php         — Tabel master  
3. create_permissions_table.php   — Tabel master
4. create_role_user_table.php     — Pivot (relasi)
5. create_categories_table.php    — Tabel master
6. create_products_table.php      — Tabel transaksional
7. create_orders_table.php        — Tabel transaksional
8. create_order_items_table.php   — Tabel transaksional
```

**Contoh struktur migration:**
```php
Schema::create('users', function (Blueprint $table) {
    $table->id();
    $table->string('name');
    $table->string('email')->unique();
    $table->string('password');
    $table->string('phone')->nullable();
    $table->boolean('is_active')->default(true);
    $table->timestamps();
    $table->softDeletes(); // Soft delete
    $table->index('email');
    $table->index('is_active');
});
```

#### Step 1.3: Generate Seeder
```
Input: Migration dari Step 1.2
Output: File seeder
```

**Yang dilakukan AI:**
1. Buat DatabaseSeeder yang menjalankan semua seeder
2. Buat seeder untuk data master (roles, permissions, dll.)
3. **TIDAK BOLEH hardcode data testing** — seeder untuk development, bukan dummy

**Aturan seeder:**
- ✅ Data minimal yang diperlukan untuk app berfungsi
- ✅ Role default: admin, staff/operator
- ✅ Admin user default dengan password hash
- ❌ Tidak ada data dummy acak (contoh: 100 produk random)
- ✅ Seeder bisa dijalankan kapan saja untuk reset development

#### Step 1.4: Setup Soft Delete & Restore di Database
```
Input: Migration files
Output: Semua tabel punya soft delete
```

**Yang dilakukan AI:**
1. Pastikan semua migration punya `$table->softDeletes();`
2. Buat view/query helper untuk soft delete:
   - Query dengan `WHERE deleted_at IS NULL` default
   - Query untuk lihat trashed (data terhapus)
   - Query termasuk trashed

#### Step 1.5: Minta Approval User (via OpenClaw)
```
State: progress.md → [👀] Nunggu approval schema
```

1. Tulis ringkasan schema ke `user_requirement.md`:
   ```
   ## [APPROVAL NEEDED] — Schema Database
   
   Tabel yang akan dibuat:
   1. users — id, name, email, password, phone, is_active, timestamps, softDeletes
   2. roles — id, name, slug, description, timestamps, softDeletes
   3. categories — id, name, slug, description, icon, timestamps, softDeletes
   4. products — id, category_id, name, slug, description, price, stock, image, timestamps, softDeletes
   5. orders — id, user_id, total, status, notes, timestamps, softDeletes
   6. order_items — id, order_id, product_id, quantity, price, subtotal, timestamps, softDeletes
   
   Relasi (tanpa FK database):
   - products.category_id → categories.id
   - orders.user_id → users.id
   - order_items.order_id → orders.id
   - order_items.product_id → products.id
   
   User, silakan approve schema ini atau minta perubahan.
   ```
2. Update `progress.md` — set ke `👀 menunggu approval schema`
3. Stop. Tunggu user.

#### Step 1.6: Jalankan Migration (setelah approve)
```
Input: Approval user
Output: Database schema terbuat
```

1. Jalankan: `php artisan migrate` (Laravel) atau migration runner sesuai framework
2. Jalankan: `php artisan db:seed` (Laravel)
3. Verifikasi semua tabel terbuat
4. **Commit**: `git add . && git commit -m "feat: database schema"`
5. Update `progress.md` — semua checklist Phase 1 ✅

**Output checklist di progress.md:**
```
### ✅ Fase 01: DATABASE — Selesai
- [✅] Analisa kebutuhan database
- [✅] Generate migration [N] tabel
- [✅] Setup soft delete semua tabel
- [✅] Generate seeder
- [✅] User approve schema
- [✅] Migration berhasil dijalankan
- [✅] Seed berhasil
```

#### Step 1.7: Lanjut ke Phase 2
- Update `progress.md` — set Phase 2 ke `[➡️] Sedang dikerjakan`

---

## Phase 2: WIREFRAME — AI Generate + User Feedback Loop

> **Tujuan:** AI membuat wireframe untuk setiap fitur, user review & feedback, AI iterasi, sampai user approve. Setelah approve, AI upgrade ke mockup high fidelity.

### Step-by-Step AI Execution

#### Step 2.1: Generate Wireframe Low Fidelity
```
Input: user_requirement.md (fitur-fitur)
Output: File .html wireframe di folder wireframes/
```

**Yang dilakukan AI:**
1. Untuk setiap fitur/modul, buat wireframe HTML
2. Wireframe low fidelity = hitam putih, layout saja, tanpa styling
3. Fokus pada: tata letak elemen, flow navigasi, hierarki informasi
4. Gunakan HTML + CSS minimal (border, box model, grid)

**Aturan wireframe:**
- ✅ Setiap halaman fitur = 1 file HTML
- ✅ Navigasi antar halaman (link antar file)
- ✅ Simpan di `wireframes/low-fidelity/`
- ✅ Tampilkan sidebar layout yang sesuai spec
- ✅ Form create/edit menggunakan right-side drawer modal

**File output:**
```
wireframes/
├── low-fidelity/
│   ├── index.html               — Dashboard overview
│   ├── users.html               — Manajemen users
│   ├── roles.html               — Manajemen roles
│   ├── products.html            — Manajemen produk
│   ├── categories.html          — Manajemen kategori
│   ├── orders.html              — Manajemen pesanan
│   └── README.md                — Cara lihat wireframe
```

**Setiap wireframe minimal mencakup:**
1. Sidebar (dengan 1 color icon per menu)
2. Header (judul halaman + tombol aksi)
3. Table list (data dari database — placeholder)
4. Right-side drawer modal (untuk create/edit)
5. Delete confirmation modal
6. Empty state (kalo data kosong)
7. Loading state (animasi/placeholder)

#### Step 2.2: Tampilkan Wireframe ke User
1. Simpan semua wireframe
2. Tulis ke `user_requirement.md`:
   ```
   ## [APPROVAL NEEDED] — Wireframe Low Fidelity
   
   Wireframe untuk [N] halaman sudah siap:
   - wireframes/low-fidelity/index.html       — Dashboard
   - wireframes/low-fidelity/users.html       — Manajemen Users
   - wireframes/low-fidelity/products.html    — Manajemen Produk
   - [dst]
   
   Silakan lihat dan berikan feedback.
   ```
3. Update `progress.md` — set ke `👀 menunggu feedback wireframe`
4. **Stop. Tunggu user feedback.**

#### Step 2.3: Iterasi Wireframe (feedback loop)
```
Input: Feedback user dari user_requirement.md
Output: Wireframe revisi
```

**Saat user kasih feedback:**
1. AI baca feedback dari `user_requirement.md`
2. Identifikasi perubahan yang diminta
3. Update wireframe HTML sesuai feedback
4. Tulis ke `user_requirement.md`: "Wireframe sudah direvisi berdasarkan feedback. Silakan cek lagi."
5. Update `progress.md` — catat iterasi

**Loop ini berulang sampai:**
- User bilang "approve" atau "lanjut" → lanjut Step 2.4
- User bilang "revisi [detail]" → AI iterasi lagi

#### Step 2.4: Upgrade ke Mockup High Fidelity (setelah wireframe approve)
```
Input: Approved wireframe + architecture-decisions.md
Output: Mockup HTML high fidelity di folder wireframes/
```

**Yang dilakukan AI:**
1. Copy semua wireframe ke `wireframes/high-fidelity/`
2. Upgrade dengan styling sesuai framework CSS yang dipilih (Tailwind / Bootstrap)
3. Tambahkan:
   - Warna sesuai brand (generated atau dari user)
   - Tipografi yang proper (font dari Google Fonts)
   - Icon (Heroicons / Lucide / Font Awesome)
   - Animasi transisi (modal slide, hover effect)
   - Responsive (mobile < 768px, tablet, desktop)
   - Form yang proper (label, input, error state)
   - Notification toast
   - Loading skeleton (bukan spinner)

**Spesifikasi mockup:**
```html
<!-- Contoh struktur mockup halaman -->
<!DOCTYPE html>
<html>
<head>
  <title>Manajemen Users — [Nama Project]</title>
  <!-- Tailwind CSS CDN / Tailwind build -->
  <!-- Google Fonts -->
  <!-- Icon library -->
</head>
<body>
  <div class="app-layout">
    <!-- Sidebar (1 color icon per menu, active state) -->
    <aside class="sidebar">
      <div class="logo">...</div>
      <nav>
        <a href="dashboard.html" class="menu-item">
          <svg class="icon" fill="#4F46E5">...</svg>
          <span>Dashboard</span>
        </a>
        <a href="users.html" class="menu-item active">
          <svg class="icon" fill="#10B981">...</svg>
          <span>Users</span>
        </a>
        ...
      </nav>
    </aside>
    
    <!-- Main content -->
    <main class="content">
      <header>
        <h1>Users</h1>
        <button onclick="openDrawer()">+ Tambah User</button>
      </header>
      
      <!-- Table -->
      <table>
        <thead>...</thead>
        <tbody id="user-table">
          <!-- Data dari database/view -->
          <tr>
            <td>1</td>
            <td>Admin</td>
            <td>admin@email.com</td>
            <td>
              <button onclick="editUser(1)">Edit</button>
              <button onclick="deleteUser(1)">Hapus</button>
            </td>
          </tr>
        </tbody>
      </table>
      
      <!-- Trashed items section -->
      <div class="trashed-section">
        <h2>Data Terhapus</h2>
        <table id="trashed-table">
          <!-- Data soft deleted -->
        </table>
      </div>
    </main>
    
    <!-- Right-side drawer modal -->
    <div id="drawer" class="drawer">
      <div class="drawer-backdrop" onclick="closeDrawer()"></div>
      <div class="drawer-content">
        <div class="drawer-header">
          <h2 id="drawer-title">Tambah User</h2>
          <button onclick="closeDrawer()">✕</button>
        </div>
        <div class="drawer-body">
          <form id="user-form">
            <div class="form-group">
              <label>Nama</label>
              <input type="text" name="name" required>
              <span class="error-message">Nama wajib diisi</span>
            </div>
            <div class="form-group">
              <label>Email</label>
              <input type="email" name="email" required>
              <span class="error-message">Email tidak valid</span>
            </div>
            ...
          </form>
        </div>
        <div class="drawer-footer">
          <button onclick="closeDrawer()">Batal</button>
          <button onclick="submitForm()">Simpan</button>
        </div>
      </div>
    </div>
  </div>
  
  <!-- Toast notification -->
  <div id="toast" class="toast hidden">
    <span id="toast-message">Berhasil menyimpan data</span>
  </div>
  
  <!-- Loading skeleton -->
  <div id="loading" class="loading-skeleton">
    <!-- Skeleton placeholders -->
  </div>
</body>
</html>
```

#### Step 2.5: Minta Approval Mockup
1. Tulis ke `user_requirement.md`:
   ```
   ## [APPROVAL NEEDED] — Mockup High Fidelity
   
   Mockup sudah di-upgrade. Silakan cek di folder wireframes/high-fidelity/
   
   Feedback? Atau approve?
   ```
2. Update `progress.md` — set ke `👀 menunggu approval mockup`
3. **Stop. Tunggu user feedback/approval.**

#### Step 2.6: Iterasi Mockup (jika perlu)
- Sama seperti wireframe — loop feedback sampai user approve

#### Step 2.7: Finalisasi (setelah mockup approve)
1. Update `progress.md` — semua checklist Phase 2 ✅
2. **Commit**: `git add . && git commit -m "feat: wireframe & mockup approved"`
3. Lanjut ke Phase 3

**Output checklist di progress.md:**
```
### ✅ Fase 02: WIREFRAME — Selesai
- [✅] Generate wireframe low fidelity [N] halaman
- [✅] User approve wireframe
- [✅] Upgrade ke mockup high fidelity [N] halaman
- [✅] User approve mockup
```

---

## Phase 3: BACKEND — AI Build Full Backend

> **Tujuan:** AI membangun backend lengkap: models, repositories, services, controllers, auth, validasi, error handling, dan dokumentasi API.

### Step-by-Step AI Execution

#### Step 3.1: Generate Models
```
Input: Schema database dari Phase 1
Output: File Model untuk setiap tabel
```

**Yang dilakukan AI:**
1. Buat model untuk setiap tabel
2. Pastikan soft delete trait/include:
   ```php
   use Illuminate\Database\Eloquent\SoftDeletes;
   
   class User extends Model
   {
       use SoftDeletes;
       
       protected $fillable = ['name', 'email', 'password', 'phone', 'is_active'];
       protected $hidden = ['password', 'remember_token'];
       protected $casts = ['is_active' => 'boolean'];
   }
   ```
3. Setup relationships (dengan null safety — karena tidak ada FK):
   ```php
   public function products()
   {
       return $this->hasMany(Product::class);
   }
   
   public function category()
   {
       return $this->belongsTo(Category::class);
   }
   ```
4. Buat accessor/mutator jika diperlukan

#### Step 3.2: Generate Repository Pattern
```
Input: Models dari Step 3.1
Output: File Repository untuk setiap model
```

**Yang dilakukan AI:**
1. Buat interface/contract untuk setiap repository
2. Implementasi CRUD dasar: all, find, create, update, delete, restore, forceDelete
3. Implementasi soft delete queries:
   ```php
   class UserRepository
   {
       public function getAll() { ... }           // Hanya aktif
       public function getTrashed() { ... }       // Hanya terhapus
       public function find($id) { ... }          // Satu data
       public function findWithTrashed($id) { ... } // Termasuk terhapus
       public function create($data) { ... }
       public function update($id, $data) { ... }
       public function softDelete($id) { ... }     // Soft delete
       public function restore($id) { ... }        // Restore
       public function forceDelete($id) { ... }    // Hard delete (opsional)
   }
   ```
4. Implementasi pagination, filter, search
5. Implementasi null safety di semua method

#### Step 3.3: Generate Service Layer
```
Input: Repository dari Step 3.2
Output: File Service
```

**Yang dilakukan AI:**
1. Buat service class untuk business logic
2. Pisahkan business logic dari controller
3. Implementasi validasi di service layer
4. Implementasi event/notification hooks

**Contoh:**
```php
class UserService
{
    public function __construct(
        private UserRepository $userRepo,
        private RoleRepository $roleRepo
    ) {}
    
    public function createUser(array $data): User
    {
        // Validasi
        // Hash password
        // Assign role default
        // Fire event
        return $this->userRepo->create($data);
    }
    
    public function restoreUser(int $id): ?User
    {
        $user = $this->userRepo->findWithTrashed($id);
        if (!$user) throw new NotFoundException('User tidak ditemukan');
        if (!$user->trashed()) throw new BadRequestException('User tidak dalam status terhapus');
        
        return $this->userRepo->restore($id);
    }
}
```

#### Step 3.4: Generate Controllers & API Endpoints
```
Input: Service dari Step 3.3
Output: Controller dengan REST API endpoints
```

**Yang dilakukan AI:**
1. Buat controller untuk setiap resource
2. Implementasi CRUD satu halaman:
   - `GET /api/{resource}` — List data (paginated, filterable, searchable)
   - `GET /api/{resource}/{id}` — Detail satu data
   - `POST /api/{resource}` — Create data baru
   - `PUT/PATCH /api/{resource}/{id}` — Update data
   - `DELETE /api/{resource}/{id}` — Soft delete
   - `GET /api/{resource}/trashed` — List data terhapus
   - `PATCH /api/{resource}/{id}/restore` — Restore data
3. Implementasi middleware auth di semua endpoint
4. Implementasi middleware role/permission jika ada
5. Implementasi response format yang konsisten:
   ```json
   {
     "success": true,
     "message": "Data berhasil disimpan",
     "data": { ... },
     "meta": {
       "current_page": 1,
       "last_page": 10,
       "per_page": 15,
       "total": 150
     }
   }
   ```

**Error response format:**
```json
{
  "success": false,
  "message": "Validasi gagal",
  "errors": {
    "email": ["Email sudah terdaftar"],
    "name": ["Nama wajib diisi"]
  }
}
```

#### Step 3.5: Implementasi Auth & Authorization
```
Input: Controller + Service
Output: Auth endpoints + middleware
```

**Yang dilakukan AI:**
1. Register/Login endpoints:
   - `POST /api/auth/register`
   - `POST /api/auth/login`
   - `POST /api/auth/logout`
   - `POST /api/auth/refresh`
   - `GET /api/auth/me`
2. Implementasi token-based auth (Sanctum/JWT)
3. Implementasi role & permission middleware:
   ```php
   Route::middleware(['auth:sanctum', 'role:admin'])->group(...);
   Route::middleware(['auth:sanctum', 'permission:edit-users'])->group(...);
   ```
4. Implementasi rate limiting
5. Implementasi CORS

#### Step 3.6: Implementasi Validation & Error Handling
```
Input: Controller + Service
Output: Form Request + Exception Handler
```

**Yang dilakukan AI:**
1. Buat Form Request untuk validasi setiap endpoint
2. Custom error messages dalam Bahasa Indonesia
3. Global exception handler:
   - NotFoundException → 404
   - ValidationException → 422
   - AuthenticationException → 401
   - AuthorizationException → 403
   - ServerException → 500

#### Step 3.7: Generate API Documentation
```
Input: Semua endpoint dari Step 3.4
Output: File API docs + route list
```

**Yang dilakukan AI:**
1. Generate route list: `php artisan route:list` (Laravel)
2. Buat file `docs/api.md` berisi:
   ```
   # API Documentation — [Nama Project]
   
   ## Authentication
   | Method | Endpoint | Deskripsi | Auth |
   |--------|----------|-----------|------|
   | POST | /api/auth/login | Login user | No |
   | POST | /api/auth/logout | Logout user | Yes |
   | GET | /api/auth/me | Profile user | Yes |
   
   ## Users
   | Method | Endpoint | Deskripsi | Auth |
   |--------|----------|-----------|------|
   | GET | /api/users | List users | Yes |
   | POST | /api/users | Create user | Yes |
   | GET | /api/users/{id} | Detail user | Yes |
   | PUT | /api/users/{id} | Update user | Yes |
   | DELETE | /api/users/{id} | Soft delete user | Yes |
   | GET | /api/users/trashed | List deleted users | Yes |
   | PATCH | /api/users/{id}/restore | Restore user | Yes |
   ```

#### Step 3.8: Minta Approval User (via OpenClaw)
```
State: progress.md → [👀] Nunggu approval backend
```

1. Tulis ke `user_requirement.md`:
   ```
   ## [APPROVAL NEEDED] — Backend Selesai
   
   Backend sudah selesai dibangun:
   - [N] Models
   - [N] Repositories
   - [N] Services
   - [N] Controllers (REST API)
   - Auth: Sanctum Token
   - [N] Form Request validations
   - API docs: docs/api.md
   
   Untuk testing, user bisa akses:
   - Postman collection: docs/api.postman.json
   - Base URL: http://localhost:8000/api
   
   User bisa test endpoint-endpoint berikut:
   - Login → dapat token → test CRUD
   
   Feedback atau approve?
   ```
2. Update `progress.md` — set ke `👀 menunggu approval backend`
3. **Stop. Tunggu user.**

**Catatan penting:**
- Jika user minta perubahan → AI iterasi backend
- Jika user approve → lanjut ke Phase 4

#### Step 3.9: Commit (setelah approve)
- `git add . && git commit -m "feat: backend completed"`

**Output checklist di progress.md:**
```
### ✅ Fase 03: BACKEND — Selesai
- [✅] Generate [N] Models
- [✅] Generate [N] Repositories
- [✅] Generate [N] Services
- [✅] Generate [N] Controllers
- [✅] Auth & authorization
- [✅] Validation & error handling
- [✅] API documentation
- [✅] User approve
```

#### Step 3.10: Lanjut ke Phase 4
- Update `progress.md` — set Phase 4 ke `[➡️] Sedang dikerjakan`

---

## Phase 4: FRONTEND — AI Build Full Frontend

> **Tujuan:** AI membangun frontend lengkap dengan integrasi real API backend — TANPA hardcoded data.

### Step-by-Step AI Execution

#### Step 4.1: Setup Frontend Project
```
Input: architecture-decisions.md (frontend framework)
Output: Frontend project siap
```

**Yang dilakukan AI:**
1. Setup project dengan framework yang ditentukan (Next.js / Vite + React / Vue)
2. Setup Tailwind CSS (default Sainskerta)
3. Setup icon library (Heroicons / Lucide)
4. Setup HTTP client (Axios / fetch wrapper)
5. Setup routing (React Router / Vue Router / Next.js App Router)
6. Setup state management (Zustand / Pinia / Context API — minimalis)
7. Setup environment variables: `NEXT_PUBLIC_API_URL=http://localhost:8000/api`

#### Step 4.2: Build Layout Components
```
Input: Mockup dari Phase 2
Output: Layout components reusable
```

**Yang dilakukan AI:**
1. **AppLayout** — wrapper layout dengan sidebar + content area
2. **Sidebar** — dengan 1 color icon per menu:
   ```jsx
   const menuItems = [
     { path: '/', label: 'Dashboard', icon: DashboardIcon, color: '#4F46E5' },
     { path: '/users', label: 'Users', icon: UsersIcon, color: '#10B981' },
     { path: '/products', label: 'Produk', icon: ProductIcon, color: '#F59E0B' },
     { path: '/orders', label: 'Pesanan', icon: OrderIcon, color: '#EF4444' },
   ];
   ```
3. **Drawer** — right-side drawer modal (reusable untuk semua form)
4. **DataTable** — table component dengan pagination, search, sorting
5. **Toast** — notification component
6. **LoadingSkeleton** — skeleton loading component
7. **EmptyState** — empty state component
8. **ConfirmDialog** — confirmation modal untuk delete
9. **Breadcrumb** — breadcrumb navigation

#### Step 4.3: Build API Service Layer
```
Input: Backend API dari Phase 3
Output: API service functions
```

**Yang dilakukan AI:**
1. Buat Axios instance dengan base URL dan interceptor:
   ```js
   const api = axios.create({
     baseURL: process.env.NEXT_PUBLIC_API_URL,
     headers: { 'Content-Type': 'application/json' },
   });
   
   // Auto-attach token
   api.interceptors.request.use(config => {
     const token = localStorage.getItem('token');
     if (token) config.headers.Authorization = `Bearer ${token}`;
     return config;
   });
   
   // Handle 401 auto logout
   api.interceptors.response.use(
     response => response,
     error => {
       if (error.response?.status === 401) {
         localStorage.removeItem('token');
         window.location.href = '/login';
       }
       return Promise.reject(error);
     }
   );
   ```
2. Buat service functions untuk setiap resource:
   ```js
   export const userService = {
     getAll: (params) => api.get('/users', { params }),
     getTrashed: (params) => api.get('/users/trashed', { params }),
     getById: (id) => api.get(`/users/${id}`),
     create: (data) => api.post('/users', data),
     update: (id, data) => api.put(`/users/${id}`, data),
     delete: (id) => api.delete(`/users/${id}`),
     restore: (id) => api.patch(`/users/${id}/restore`),
   };
   ```
3. **TIDAK BOLEH ada hardcoded data.** Semua melalui API.

#### Step 4.4: Build Auth Pages
```
Input: Auth API dari Step 3.5
Output: Login page + protected routes
```

**Yang dilakukan AI:**
1. Login page (form email + password)
2. Hooks/Context untuk auth state:
   - Login/logout functions
   - Token management (localStorage)
   - User profile (from `/api/auth/me`)
   - Auto-login check on mount
3. Protected Route wrapper:
   ```jsx
   function ProtectedRoute({ children }) {
     const { user, isLoading } = useAuth();
     
     if (isLoading) return <LoadingSkeleton />;
     if (!user) return <Navigate to="/login" />;
     
     return children;
   }
   ```

#### Step 4.5: Build CRUD Pages
```
Input: Service layer + mockup
Output: Halaman CRUD untuk setiap fitur
```

**Yang dilakukan AI:**
1. Untuk setiap resource, buat halaman dengan pola:
   ```
   pages/
   ├── users/
   │   ├── index.jsx       — List + Drawer CRUD + Trashed tab
   │   └── hooks.js        — Custom hooks (data fetching, mutations)
   ├── products/
   │   ├── index.jsx
   │   └── hooks.js
   ├── categories/
   ├── orders/
   └── ...
   ```

2. **List page structure:**
   ```jsx
   function UsersPage() {
     // State
     const [users, setUsers] = useState([]);
     const [trashed, setTrashed] = useState([]);
     const [isLoading, setIsLoading] = useState(true);
     const [isDrawerOpen, setIsDrawerOpen] = useState(false);
     const [editingUser, setEditingUser] = useState(null);
     const [showTrashed, setShowTrashed] = useState(false);
     const [search, setSearch] = useState('');
     const [pagination, setPagination] = useState({ page: 1, lastPage: 1 });
     
     // Data fetching — REAL API, NO HARDCODE
     useEffect(() => {
       fetchUsers();
     }, [pagination.page, search]);
     
     const fetchUsers = async () => {
       setIsLoading(true);
       try {
         const res = await userService.getAll({ page: pagination.page, search });
         setUsers(res.data.data);
         setPagination(prev => ({ ...prev, lastPage: res.data.meta.last_page }));
       } catch (err) {
         showToast('Gagal memuat data', 'error');
       } finally {
         setIsLoading(false);
       }
     };
     
     const fetchTrashed = async () => {
       const res = await userService.getTrashed();
       setTrashed(res.data.data);
     };
     
     const handleSubmit = async (formData) => {
       try {
         if (editingUser) {
           await userService.update(editingUser.id, formData);
           showToast('User berhasil diupdate', 'success');
         } else {
           await userService.create(formData);
           showToast('User berhasil ditambahkan', 'success');
         }
         closeDrawer();
         fetchUsers();
       } catch (err) {
         // Show validation errors from API
       }
     };
     
     const handleDelete = async (id) => {
       if (!confirm('Yakin ingin menghapus user ini?')) return;
       try {
         await userService.delete(id);
         showToast('User berhasil dihapus', 'success');
         fetchUsers();
       } catch (err) {
         showToast('Gagal menghapus user', 'error');
       }
     };
     
     const handleRestore = async (id) => {
       try {
         await userService.restore(id);
         showToast('User berhasil direstore', 'success');
         fetchTrashed();
         fetchUsers();
       } catch (err) { ... }
     };
     
     // Empty state
     if (!isLoading && users.length === 0) {
       return <EmptyState
         title="Belum ada user"
         description="Tambahkan user pertama Anda"
         actionLabel="+ Tambah User"
         onAction={() => openDrawer()}
       />;
     }
     
     // Loading state
     if (isLoading) {
       return <LoadingSkeleton rows={5} />;
     }
     
     return (
       <div>
         {/* Header */}
         <PageHeader title="Users" onAdd={() => openDrawer()} />
         
         {/* Search + Tabs */}
         <SearchInput value={search} onChange={setSearch} />
         <TabSwitcher
           tabs={[
             { label: 'Aktif', count: users.length, active: !showTrashed },
             { label: 'Terhapus', count: trashed.length, badge: trashed.length },
           ]}
           onChange={() => setShowTrashed(!showTrashed)}
         />
         
         {/* Table */}
         {showTrashed ? (
           <TrashedTable data={trashed} onRestore={handleRestore} />
         ) : (
           <DataTable
             data={users}
             columns={[
               { key: 'id', label: 'ID' },
               { key: 'name', label: 'Nama' },
               { key: 'email', label: 'Email' },
               { key: 'is_active', label: 'Status', render: (v) => v ? 'Aktif' : 'Nonaktif' },
               { key: 'actions', label: 'Aksi', render: (_, row) => (
                 <ActionsMenu
                   onEdit={() => openDrawer(row)}
                   onDelete={() => handleDelete(row.id)}
                 />
               )},
             ]}
             pagination={pagination}
             onPageChange={(p) => setPagination(prev => ({ ...prev, page: p }))}
           />
         )}
         
         {/* Right-side Drawer Modal */}
         <Drawer isOpen={isDrawerOpen} onClose={closeDrawer} title={editingUser ? 'Edit User' : 'Tambah User'}>
           <UserForm
             initialData={editingUser}
             onSubmit={handleSubmit}
             isLoading={isSubmitting}
           />
         </Drawer>
       </div>
     );
   }
   ```

**Aturan yang WAJIB dipatuhi:**
- ✅ Data dari API — TIDAK BOLEH hardcode
- ✅ Loading state — skeleton, bukan "Loading..." text
- ✅ Error state — toast notification + retry option
- ✅ Empty state — ilustrasi + CTA
- ✅ Soft delete & restore — tab "Terhapus" dengan tabel data trashed
- ✅ Form validation — client-side + server-side errors
- ✅ Right-side drawer modal — 400px lebar, slide-in animation

#### Step 4.6: Build Dashboard Page
```
Input: Data dari API
Output: Dashboard dengan cards + charts
```

**Yang dilakukan AI:**
1. Dashboard page dengan:
   - Stats cards (total users, total products, total orders, dll.)
   - Recent activity list
   - Quick actions (tambah user, tambah produk)
2. Semua data dari API endpoint khusus `/api/dashboard`

#### Step 4.7: Error & Edge Case Handling
```
Input: Semua halaman dari Step 4.5
Output: Error handling di setiap komponen
```

**Yang dilakukan AI:**
1. Network error → toast "Koneksi terputus. Coba lagi."
2. Server error (500) → toast "Terjadi kesalahan server"
3. Validation error → tampilkan error dari API di masing-masing field form
4. Empty state → untuk setiap tabel
5. Not found (404) → redirect atau pesan "Data tidak ditemukan"
6. Unauthorized (401) → auto logout
7. Forbidden (403) → toast "Tidak punya akses"

#### Step 4.8: Final Testing & Approve
1. Pastikan frontend bisa dijalankan: `npm run dev`
2. Pastikan integrasi dengan backend berfungsi (API call success)
3. Tulis ke `user_requirement.md`:
   ```
   ## [APPROVAL NEEDED] — Frontend Selesai
   
   Frontend sudah selesai dibangun.
   
   Halaman:
   - / — Dashboard
   - /users — Manajemen Users
   - /products — Manajemen Produk
   - [dst]
   
   Fitur:
   - ✅ Sidebar 1 color icon per menu
   - ✅ CRUD one page + right drawer modal
   - ✅ Soft delete & restore
   - ✅ Loading & empty states
   - ✅ Error handling
   - ✅ Integrasi API backend
   
   User bisa test dengan:
   1. Jalankan backend: php artisan serve
   2. Jalankan frontend: npm run dev
   3. Buka browser → login → test CRUD
   
   Feedback atau approve?
   ```
4. Update `progress.md` — set ke `👀 menunggu approval frontend`
5. **Stop. Tunggu user.**

**Output checklist di progress.md:**
```
### ✅ Fase 04: FRONTEND — Selesai
- [✅] Setup frontend project ([framework])
- [✅] Layout components (sidebar, drawer, datatable)
- [✅] API service layer (NO hardcoded data)
- [✅] Auth pages
- [✅] CRUD pages [N] halaman
- [✅] Dashboard page
- [✅] Error & edge case handling
- [✅] User approve
```

#### Step 4.9: Commit (setelah approve)
- `git add . && git commit -m "feat: frontend completed"`

#### Step 4.10: Lanjut ke Phase 5
- Update `progress.md` — set Phase 5 ke `[➡️] Sedang dikerjakan`

---

## Phase 5: AUDIT — AI Auto-Audit

> **Tujuan:** AI melakukan audit menyeluruh sebelum deployment: security, performance, code review, UI/UX, database optimization.

### Step-by-Step AI Execution

#### Step 5.1: Security Scan
```
Input: Semua kode dari Phase 3 + 4
Output: Security report
```

**Yang dilakukan AI:**
1. **XSS Check:**
   - Cek semua input user → apakah di-escape saat render?
   - Cek `dangerouslySetInnerHTML` / `v-html` → apakah ada?
   - Cek output di blade template → pakai `{{ }}` atau `{!! !!}`?

2. **SQL Injection Check:**
   - Cek semua query → pakai parameterized/ORM atau raw query?
   - Jika ada raw query → pastikan ter-binding parameter

3. **CSRF Check:**
   - Cek semua form → apakah ada CSRF token?
   - Cek middleware CSRF aktif?

4. **Auth Bypass Check:**
   - Cek semua route → apakah yang perlu auth sudah pakai middleware?
   - Cek role/permission di setiap endpoint sensitif

5. **File Upload Check:**
   - Cek validasi tipe file
   - Cek maksimum ukuran
   - Cek path traversal prevention

**Output ke audit-report.md:**
```markdown
## Security Scan

| Check | Status | Detail |
|-------|--------|--------|
| XSS Protection | ✅ Aman | Semua output di-escape |
| SQL Injection | ✅ Aman | ORM query semua |
| CSRF Protection | ✅ Aktif | Middleware global |
| Auth Middleware | ✅ Lengkap | [N] route terproteksi |
| File Upload | ⚠️ Perlu dicek | Validasi tipe: OK. Ukuran: perlu batas 5MB |
```

#### Step 5.2: Performance Test
```
Input: Kode backend + database
Output: Performance report
```

**Yang dilakukan AI:**
1. **N+1 Query Check:**
   - Cek relasi model → apakah pakai eager loading?
   - Cek loop di views → apakah ada query berulang?

2. **Database Index Check:**
   - Cek kolom yang sering di-query → ada index?
   - Cek query yang lambat → perlu index?

3. **API Response Time:**
   - Test beberapa endpoint → cek response time
   - Catat yang > 500ms

4. **Asset Optimization:**
   - Cek bundle size frontend
   - Cek image optimization
   - Cek code splitting

**Output ke audit-report.md:**
```markdown
## Performance Test

| Check | Status | Detail |
|-------|--------|--------|
| N+1 Query | ✅ Clean | Semua eager loading |
| Database Index | ✅ Optimal | [N] index terpasang |
| API Response | ✅ < 200ms | Semua endpoint cepat |
| Bundle Size | ⚠️ 280KB | Perlu code splitting untuk halaman besar |
```

#### Step 5.3: Code Review — Sainskerta Rules Compliance
```
Input: Semua kode
Output: Compliance report
```

**Yang dilakukan AI:**

Checklist terhadap [RULES-OF-THE-GAME.md](RULES-OF-THE-GAME.md):

| Rule | Status | Detail |
|------|--------|--------|
| Modular Monolith | ✅ | Satu codebase, module terpisah |
| No Foreign Keys | ✅ | Tidak ada FK constraint |
| Soft Delete | ✅ | Semua tabel punya deleted_at |
| CRUD One Page | ✅ | List + right drawer modal |
| Right-Side Drawer | ✅ | 400px, slide-in animation |
| Sidebar 1 Color Icon | ✅ | Solid color per menu |
| No Hardcoded Data | ✅ | Semua dari API |
| Backend First | ✅ | Backend selesai duluan |
| Validation | ✅ | Form Request + FE validasi |
| Error Handling | ✅ | Global handler + toast |

#### Step 5.4: UI/UX Consistency Check
```
Input: Frontend code + mockup
Output: UI/UX report
```

**Yang dilakukan AI:**
1. **Consistency Check:**
   - Warna → semua pakai dari design system yang sama?
   - Font → konsisten?
   - Spacing → margin/padding konsisten?
   - Button style → semua tombol punya style yang sama?

2. **Mobile Responsive Check:**
   - Layout → responsive di mobile?
   - Drawer → full screen di mobile?
   - Table → horizontal scroll atau card view di mobile?

3. **Accessibility Check:**
   - Form labels → semua input punya label?
   - Alt text → semua image punya alt?
   - Keyboard navigation → bisa tab ke semua elemen?

**Output ke audit-report.md:**
```markdown
## UI/UX Consistency

| Check | Status | Detail |
|-------|--------|--------|
| Color Consistency | ✅ | Design system diterapkan |
| Typography | ✅ | Font konsisten |
| Spacing | ✅ | Margin/padding seragam |
| Mobile Responsive | ⚠️ | Table di mobile perlu card view |
| Form Labels | ✅ | Semua input ada label |
| Keyboard Nav | ✅ | Fokus visible |
```

#### Step 5.5: Database Optimization Check
```
Input: Database schema + queries
Output: Database report
```

**Yang dilakukan AI:**
1. Cek apakah ada kolom yang perlu index tapi belum
2. Cek tipe data → apakah sudah sesuai (INT vs BIGINT, VARCHAR length)
3. Cek migration → apakah ada perubahan schema yang bisa digabung

**Output ke audit-report.md:**
```markdown
## Database Optimization

| Check | Status | Detail |
|-------|--------|--------|
| Indexes | ✅ | Optimal untuk query utama |
| Data Types | ✅ | Sesuai kebutuhan |
| Migration | ✅ | Tidak ada perubahan tertunda |
```

#### Step 5.6: Generate Audit Report Lengkap
```
Input: Semua hasil audit
Output: audit-report.md final
```

**Yang dilakukan AI:**
1. Gabungkan semua hasil audit ke satu file `audit-report.md`
2. Beri rating keseluruhan:
   - 🟢 **Siap Deploy** — semua check ✅
   - 🟡 **Siap dengan Catatan** — ada ⚠️ minor
   - 🔴 **Jangan Deploy** — ada ❌ critical
3. Jika ada ❌ critical → AI harus fix dulu sebelum minta approve

#### Step 5.7: Minta Approval User
1. Tulis ke `user_requirement.md`:
   ```
   ## [APPROVAL NEEDED] — Laporan Audit
   
   Audit selesai. Rating: 🟢 Siap Deploy
   
   Ringkasan:
   - Security: ✅ Semua aman
   - Performance: ✅ Optimal
   - Rules Compliance: ✅ 100%
   - UI/UX: ✅ Konsisten
   - Database: ✅ Optimal
   
   Detail lengkap: audit-report.md
   
   User, approve untuk lanjut ke deployment?
   ```
2. Update `progress.md` — set ke `👀 menunggu approval audit`
3. **Stop. Tunggu user.**

**Jika ada issue:**
- AI catat issue dan fix otomatis
- Minta user re-approve setelah fix

**Output checklist di progress.md:**
```
### ✅ Fase 05: AUDIT — Selesai
- [✅] Security scan
- [✅] Performance test
- [✅] Code review (Sainskerta rules)
- [✅] UI/UX consistency check
- [✅] Database optimization check
- [✅] Laporan audit
- [✅] User approve
```

#### Step 5.8: Commit + Lanjut ke Phase 6
- `git add . && git commit -m "audit: pre-deploy audit completed"`
- Update `progress.md` — set Phase 6 ke `[➡️] Sedang dikerjakan`

---

## Phase 6: DEPLOY — AI Deploy

> **Tujuan:** AI melakukan deployment ke production: build, deploy, setup SSL, domain, health check, backup.

### Step-by-Step AI Execution

#### Step 6.1: Persiapan Deployment
```
Input: architecture-decisions.md (target deploy)
Output: Checklist deployment siap
```

**Yang dilakukan AI:**
1. Baca target deployment dari `architecture-decisions.md`
2. Cek apakah user sudah memberikan:
   - Server IP / hostname
   - SSH credentials atau akses
   - Domain (jika ada)
   - DNS settings
3. Jika belum → minta ke user via `user_requirement.md`:
   ```
   ## [INPUT NEEDED] — Informasi Deployment
   
   Untuk deploy ke production, saya butuh:
   1. Server IP atau hostname: [user isi]
   2. SSH username & password/key: [user isi]
   3. Domain (jika ada): [user isi]
   4. Apakah pakai reverse proxy? [Nginx / Apache / Cloudflare]
   5. SSH Port: [22 / lainnya]
   6. Apakah sudah ada webserver? [Ya / Tidak]
   ```
4. **Stop. Tunggu user mengisi informasi.**

#### Step 6.2: Build Production
```
Input: Semua kode
Output: Production build
```

**Yang dilakukan AI:**
1. **Backend:**
   - Set environment ke production (`.env`)
   - Optimize: `php artisan optimize`
   - Cache: `php artisan config:cache`, `route:cache`, `view:cache`

2. **Frontend:**
   - Build: `npm run build`
   - Hasil build di folder `frontend/dist/` atau `frontend/.next/`

#### Step 6.3: Deploy ke Server
```
Input: Build files + server info
Output: Aplikasi hidup di server
```

**Yang dilakukan AI:**
1. Setup di server:
   ```bash
   # Install dependencies jika perlu
   apt update && apt install -y nginx mysql-server php8.2 php8.2-{fpm,mysql,mbstring,xml,curl,gd,redis}
   
   # Setup Node.js (untuk frontend)
   curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
   apt install -y nodejs
   ```
2. Copy file ke server (SCP / Git pull)
3. Setup environment variables
4. Setup web server (Nginx virtual host)
5. Setup PHP-FPM
6. Run migration di server
7. Setup storage link

**Nginx config contoh:**
```nginx
server {
    listen 80;
    server_name domain.com www.domain.com;
    root /var/www/project-name/backend/public;
    index index.php;
    
    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }
    
    location ~ \.php$ {
        fastcgi_pass unix:/var/run/php/php8.2-fpm.sock;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
        include fastcgi_params;
    }
    
    location ~ /\.ht {
        deny all;
    }
}
```

#### Step 6.4: Setup SSL
```
Input: Domain info
Output: SSL aktif
```

**Yang dilakukan AI:**
1. Install Certbot: `apt install -y certbot python3-certbot-nginx`
2. Generate SSL: `certbot --nginx -d domain.com -d www.domain.com`
3. Auto-renewal: `systemctl enable certbot.timer`

#### Step 6.5: Health Check
```
Input: App yang sudah running
Output: Confirmation app works
```

**Yang dilakukan AI:**
1. Buat endpoint health check: `GET /api/health`
   ```php
   Route::get('/health', function () {
       return response()->json([
           'status' => 'healthy',
           'timestamp' => now(),
           'database' => DB::connection()->getDatabaseName(),
       ]);
   });
   ```
2. Test endpoint: `curl https://domain.com/api/health`
3. Test login flow via production URL
4. Test salah satu CRUD endpoint

#### Step 6.6: Backup Database Pertama
```
Input: Database production
Output: Backup file
```

**Yang dilakukan AI:**
1. Setup directory backup: `mkdir -p /var/backups/[project-name]/`
2. Backup database:
   ```bash
   mysqldump -u [user] -p[password] [database] > /var/backups/[project-name]/backup-$(date +%Y%m%d).sql
   ```
3. Setup cron untuk backup harian:
   ```bash
   0 2 * * * mysqldump -u [user] -p[password] [database] > /var/backups/[project-name]/backup-$(date +%%Y%%m%%d).sql
   ```

#### Step 6.7: Buat Deployment Log
```
Input: Semua step deployment
Output: deployment-log.md
```

```markdown
# Deployment Log — [Nama Project]

| Aspek | Detail |
|-------|--------|
| Tanggal | YYYY-MM-DD HH:MM |
| Target | VPS / Cloud |
| Server IP | xxx.xxx.xxx.xxx |
| Domain | domain.com |
| SSL | Let's Encrypt (aktif) |
| Backend | Laravel 11 — Production |
| Frontend | Next.js 14 — Production |
| Database | MySQL 8 |
| Backup | ✅ Jadwal harian 02:00 |

## Verifikasi
- ✅ Health check: /api/health → 200 OK
- ✅ Login: OK
- ✅ CRUD: OK
- ✅ SSL: Active
- ✅ Backup: OK
```

#### Step 6.8: Minta Approval User
1. Tulis ke `user_requirement.md`:
   ```
   ## [APPROVAL NEEDED] — Deployment Selesai
   
   Aplikasi sudah live di:
   🌐 https://domain.com
   
   Detail: deployment-log.md
   
   Silakan akses dan verifikasi.
   
   Feedback atau approve?
   
   **Catatan:** Jika ada issue, laporkan. Saya akan fix.
   ```
2. Update `progress.md` — set ke `👀 menunggu approval deployment`
3. **Stop. Tunggu user.**

**Output checklist di progress.md:**
```
### ✅ Fase 06: DEPLOY — Selesai
- [✅] Persiapan deployment
- [✅] Build production (backend + frontend)
- [✅] Deploy ke server
- [✅] Setup domain & SSL
- [✅] Environment variables
- [✅] Health check
- [✅] Backup database pertama
- [✅] User approve
```

#### Step 6.9: Commit (setelah approve)
- `git add . && git commit -m "deploy: production deployment completed"`

#### Step 6.10: Lanjut ke Phase 7
- Update `progress.md` — set Phase 7 ke `[➡️] Sedang dikerjakan`

---

## Phase 7: IMPROVEMENT — AI Maintenance Loop

> **Tujuan:** AI melakukan maintenance loop otomatis: monitoring, security update, performance check, dan menangani request baru dari user.

### Step-by-Step AI Execution

#### Step 7.1: Setup Monitoring Loop
```
Input: Server + app info
Output: Monitoring berjalan
```

**Yang dilakukan AI:**
1. Setup cron jobs untuk monitoring:
   ```
   # Setiap 1 jam — cek error logs
   */60 * * * * cd /path/to/project && php cli/monitor:check-logs
   
   # Setiap 6 jam — cek performance
   */360 * * * * cd /path/to/project && php cli/monitor:performance
   
   # Setiap 24 jam — cek security updates
   0 3 * * * cd /path/to/project && php cli/monitor:security-updates
   
   # Setiap 24 jam — backup database
   0 2 * * * /path/to/backup-script.sh
   ```

2. Error monitoring script:
   ```
   php cli/monitor:check-logs
   ```
   - Cek `storage/logs/laravel.log` (Laravel) untuk error baru
   - Cek `nginx/error.log`
   - Jika ada error baru → catat ke `progress.md` → kasih tau user

3. Performance monitoring script:
   ```
   php cli/monitor:performance
   ```
   - Cek response time API
   - Cek CPU & memory usage server
   - Cek disk usage
   - Jika ada anomali → catat di `progress.md`

4. Security update script:
   ```
   php cli/monitor:security-updates
   ```
   - Cek apakah ada update security untuk framework
   - Cek apakah ada CVE untuk dependency
   - List update yang perlu dijalankan

#### Step 7.2: Handle New Requirements (Loop Back)
```
Input: user_requirement.md — bagian [PENDING]
Output: Requirement baru masuk ke pipeline
```

**Yang dilakukan AI:**
1. Setiap iterasi, baca `user_requirement.md`
2. Cari bagian dengan format `[PENDING] - Priority [HIGH/MEDIUM/LOW]`
3. Jika ada requirement baru:
   - Baca requirement
   - Analisa dampak ke existing code
   - Breakdown ke tasks
   - Tulis ke `progress.md` sebagai "Improvement Tasks"
   - Mulai eksekusi (mulai dari Phase 0 lagi untuk fitur baru)

**Cycle untuk requirement baru:**
```
[PENDING] di user_requirement.md
  → AI baca & analisa
  → AI breakdown (Phase 0)
  → AI update database jika perlu (Phase 1)
  → AI update backend (Phase 3)
  → AI update frontend (Phase 4)
  → AI audit (Phase 5)
  → AI deploy (Phase 6)
  → User approve
```

#### Step 7.3: User Interrupt Handling
```
Input: Pesan user via OpenClaw (di luar approval)
Output: Interrupt diproses
```

**Flow interupsi:**
1. User kirim pesan: "Tambah fitur export PDF" (misalnya)
2. OpenClaw tulis ke `user_requirement.md`:
   ```
   ## [PENDING] - Priority HIGH (interrupt)
   - [ ] Tambah fitur export PDF untuk laporan
   ```
3. AI baca di iterasi berikutnya
4. AI proses seperti requirement baru
5. Jika AI sedang di tengah fase lain → selesaikan fase saat ini dulu, baru proses interrupt
6. Kasih tau user via `user_requirement.md`: "Interrupt akan diproses setelah fase [current] selesai."

#### Step 7.4: Periodic Status Report
```
Output: Status report ke user (via OpenClaw)
```

**Yang dilakukan AI:**
1. Setiap 24 jam (atau saat diminta):
   - Generate status report
   - Baca error log (ada error baru?)
   - Cek performance (ada penurunan?)
   - Cek disk usage
   - Cek backup terakhir

2. Tulis ke `user_requirement.md`:
   ```
   ## Status Report — [YYYY-MM-DD]
   
   ### Health
   - App: 🟢 Online (uptime: [N] hari)
   - Database: 🟢 Connected
   - Disk: 🟢 [X]% used
   
   ### Aktivitas 24 Jam Terakhir
   - Error: [N] error (semua minor)
   - Performance: 🟢 Stabil
   - Backup: ✅ Berhasil jam 02:00
   
   ### Update Keamanan
   - Tidak ada update critical
   ```
3. Update `progress.md` — bagian improvement

#### Step 7.5: Error Recovery & Auto-Fix
```
Input: Error dari monitoring
Output: Error ter-handle
```

**Yang dilakukan AI:**
1. Saat error terdeteksi:
   a. Catat error di `progress.md`:
      ```
      ## Issue & Blocker
      | # | Issue | Severity | Status |
      |---|-------|----------|--------|
      | 1 | Error di UserController@update: Call to member function on null | HIGH | auto-fix |
      ```
   b. Analisa root cause
   c. Coba fix otomatis
   d. Jika berhasil → update status ke `fixed`
   e. Jika gagal (retry 3x) → kasih tau user:
      ```
      ## [ATTENTION] — Error Tidak Bisa Di-auto-fix
      
      Error: [deskripsi]
      Lokasi: [file:line]
      Root Cause: [analisa]
      Attempts: 3x gagal
      
      User, pilih salah satu:
      1. Skip — lanjutkan tanpa fix
      2. Rollback — kembalikan ke versi sebelumnya
      3. Manual fix — saya akan pandu
      ```

**Output checklist di progress.md:**
```
### ✅ Fase 07: IMPROVEMENT — Berjalan
- [✅] Monitoring loop aktif
- [✅] Error log check (setiap 1 jam)
- [✅] Performance check (setiap 6 jam)
- [✅] Security update check (setiap 24 jam)
- [✅] Backup harian
- [✅] Menangani requirement baru ([N] pending)
- [➡️] Status report berkala
```

---

## Approval Flow Detail

### Mekanisme Approval

```
┌──────────────────────────────────────────────────────────┐
│                    APPROVAL FLOW                          │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  AI selesai fase → update progress.md                    │
│       │                                                  │
│       ▼                                                  │
│  AI tulis ke user_requirement.md:                         │
│  "[APPROVAL NEEDED] — [Nama Fase]"                       │
│       │                                                  │
│       ▼                                                  │
│  AI set progress.md → [👀] Nunggu approval user          │
│       │                                                  │
│       ▼                                                  │
│  AI STOP — Tunggu input dari OpenClaw                    │
│       │                                                  │
│  ┌────┴────┐                                             │
│  │         │                                             │
│  ▼         ▼                                             │
│ User     User                                            │
│ Approve  Reject                                          │
│  │         │                                             │
│  ▼         ▼                                             │
│ OpenClaw  OpenClaw                                       │
│ baca      tulis feedback                                 │
│ approval  ke user_re-                                    │
│ → update  quirement.md                                   │
│ user_re-  → AI baca                                      │
│ quirement → revisi                                       │
│ .md       → generate                                     │
│ → AI      ulang                                          │
│ baca      → minta                                        │
│ → lanjut  approve lagi                                   │
│ fase next                                                 │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### Detail Peran

**1. AI (Claude Code) — Eksekutor**
- Menulis status ke `progress.md`
- Menulis approval request ke `user_requirement.md`
- **STOP** setelah menulis approval request — tidak lanjut otomatis
- Membaca `user_requirement.md` di iterasi berikutnya
- Jika ada approval → lanjut ke fase berikutnya
- Jika ada reject/feedback → iterasi

**2. OpenClaw — Orkestrator & Messenger**
- Membaca `progress.md` secara periodik
- Melihat ada fase yang nunggu approval (👀)
- Kirim pesan ke user via WhatsApp/Telegram:
  ```
  [Phase X] selesai! Hasil:
  - [ringkasan 2-3 poin]
  
  User, approve? (cukup balas ✅ atau "lanjut")
  ```
- Baca jawaban user
- Jika approve → tulis `## [APPROVED]` di `user_requirement.md`
- Jika reject/feedback → tulis feedback di `user_requirement.md`

**3. User — Decision Maker**
- Cukup balas pesan via chat
- ✅ / "lanjut" / "oke" → approve
- "revisi: [detail]" → reject dengan feedback
- "[perintah baru]" → interupsi

### Format Approval di user_requirement.md

**Format saat AI minta approval:**
```markdown
## [APPROVAL NEEDED] — [Nama Fase]

[Ringkasan hasil fase]

User, silakan approve atau minta perubahan.

[APPROVAL_SECTION_START]
Status: PENDING
[APPROVAL_SECTION_END]
```

**Format setelah user approve (ditulis OpenClaw):**
```markdown
## [APPROVAL NEEDED] — [Nama Fase]

[Ringkasan hasil fase]

User, silakan approve atau minta perubahan.

[APPROVAL_SECTION_START]
Status: APPROVED
Timestamp: YYYY-MM-DD HH:MM
[APPROVAL_SECTION_END]
```

**Format setelah user reject (ditulis OpenClaw):**
```markdown
## [APPROVAL NEEDED] — [Nama Fase]

[Ringkasan hasil fase]

User, silakan approve atau minta perubahan.

[APPROVAL_SECTION_START]
Status: REJECTED
Feedback: [detail feedback user]
Timestamp: YYYY-MM-DD HH:MM
[APPROVAL_SECTION_END]
```

---

## AI Auto-Fill Rules

### Aturan untuk AI saat mengisi keputusan arsitektur tanpa bertanya ke user

Rules ini berlaku saat **Phase 0 Step 0.3** — AI harus mengisi keputusan arsitektur secara otomatis. User bisa override kapan saja.

#### 1. Framework Default

| Aspek | Default | Alasan |
|-------|---------|--------|
| Backend Framework | **Laravel 11** | Sesuai stack Sainskerta. Fitur lengkap: auth, queue, scheduler, Eloquent ORM. |
| Frontend Framework | **React + Next.js 14** | Stack Sainskerta. Server components, App Router, optimal untuk SEO. |
| CSS Framework | **Tailwind CSS 3** | Utility-first, cepat dikembangkan, konsisten. |
| State Management | **Zustand** (React) | Minimalis, ringan, tanpa boilerplate. |
| Icon Library | **Lucide React** | Open source, konsisten, tree-shakeable. |
| HTTP Client | **Axios** | Interceptor, auto-transform, widely used. |
| Auth Package | **Laravel Sanctum** | Simple token-based auth, built-in di Laravel. |

#### 2. Database Default

| Aspek | Default | Alasan |
|-------|---------|--------|
| Database Engine | **MySQL 8** | Paling umum, kompatibel dengan shared hosting & VPS. |
| Fallback (jika user minta fitur advanced) | **PostgreSQL 16** | JSONB, full-text search, GIS. |
| Development Only | **SQLite** | Hanya untuk development lokal tanpa server DB. |

#### 3. Deployment Default

| Aspek | Default | Alasan |
|-------|---------|--------|
| Target | **VPS (Ubuntu 22.04 LTS)** | Kontrol penuh, harga terjangkau, familiar. |
| Web Server | **Nginx** | Performa tinggi, konfigurasi mudah, SSL via Certbot. |
| PHP Processor | **PHP 8.2 FPM** | Stable, performance bagus, kompatibel Laravel 11. |
| Node.js | **20 LTS** | Long-term support, stable. |
| Process Manager | **Supervisor** | Untuk queue worker Laravel. |
| SSL | **Let's Encrypt (Certbot)** | Gratis, auto-renewal. |
| CDN | **Cloudflare** (opsional) | Jika user punya domain. Free plan cukup. |

#### 4. Jika User Minta Lain (Override)

User bisa override kapan saja lewat chat. Contoh:
- User: "Saya mau pakai Vue.js" → AI override frontend ke Vue
- User: "Deploy ke Railway aja" → AI override deployment target
- User: "Saya pakai PostgreSQL" → AI override database engine

**Override dicatat di:**
- `architecture-decisions.md` — bagian "Override dari User"
- `user_requirement.md` — bagian Arsitektur

#### 5. Catatan untuk AI

Semua keputusan default di atas **harus dicatat** di `architecture-decisions.md` dengan format:
```markdown
## Keputusan Otomatis (Auto-Fill)

| Aspek | Keputusan | Alasan | Auto-Fill Rule |
|-------|-----------|--------|----------------|
| Backend | Laravel 11 | Stack default Sainskerta | Rule 1 |
| Database | MySQL 8 | Kompatibilitas & dukungan hosting | Rule 2 |
| Deployment | VPS Ubuntu | Kontrol penuh & familiar | Rule 3 |
```

#### 6. Kapan Auto-Fill Tidak Berlaku

Auto-fill **tidak berlaku** jika:
- User sudah menyebutkan preferensi di requirement awal
- Project punya kebutuhan spesifik (contoh: realtime → WebSocket server)
- User explicit minta teknologi tertentu
- Ada kontrak/klien yang menentukan stack

---

## Error Recovery

### Protokol Error untuk AI

#### Level 1: Minor Error (Auto-Retry)

**Kriteria:** Error umum yang bisa di-fix otomatis (syntax error, missing import, typo)

**Prosedur:**
1. Catat error di `progress.md`:
   ```
   ## Error Log
   | Time | Error | Action | Status |
   |------|-------|--------|--------|
   | HH:MM | [deskripsi] | Retry #1 | 🔄 |
   ```
2. Retry: coba ulang step yang gagal (maks 3x)
3. Jika berhasil:
   ```
   | HH:MM | [deskripsi] | Retry #2 ✅ | ✅ Fixed |
   ```
4. Lanjutkan eksekusi

#### Level 2: Medium Error (Auto-Fix + Notify)

**Kriteria:** Error yang butuh perubahan kode (broken migration, missing method, wrong config)

**Prosedur:**
1. Catat error di `progress.md`
2. Analisa root cause
3. Generate fix untuk error tersebut
4. Apply fix
5. **Retry** (maks 3x)
6. Jika berhasil → lanjutkan
7. Jika gagal 3x → kasih tau user:
   ```
   ## [ERROR] — [Nama Error]
   
   Severity: MEDIUM
   Step: [Nama step]
   Error: [Detail error]
   Attempt: 3x gagal
   
   Root Cause: [Analisa]
   Proposed Fix: [Saran fix]
   
   User, apa yang harus dilakukan?
   [A] Skip — lewati step ini
   [B] Retry — coba lagi
   [C] Manual fix — saya akan pandu
   [D] Rollback — kembalikan ke commit terakhir
   ```

#### Level 3: Critical Error (Stop + Notify)

**Kriteria:** Error yang menghentikan workflow (database connection fail, framework crash, server down)

**Prosedur:**
1. STOP semua eksekusi
2. Catat error di `progress.md`
3. Tulis pesan ke `user_requirement.md`:
   ```
   ## 🔴 CRITICAL ERROR
   
   Workflow terhenti karena error kritis.
   
   **Error:** [Detail error]
   **Lokasi:** [Step/fase]
   **Dampak:** [Apa yang terpengaruh]
   
   **Rekomendasi:**
   [A] Retry — [kemungkinan berhasil?]
   [B] Rollback — ke commit [hash]
   [C] Manual — user akan intervensi
   
   Mohon instruksi.
   ```
4. Update `progress.md` — set ke `❌ Error: Critical`
5. **Tunggu user.**

#### Keputusan User untuk Error

| Keputusan User | Tindakan AI |
|----------------|-------------|
| "Skip" | Tandai step sebagai skipped → lanjut ke step berikutnya |
| "Retry" | Reset state ke sebelum error → coba lagi |
| "Retry [N]x" | Retry sebanyak N kali |
| "Manual fix: [instruksi]" | Ikuti instruksi user → setelah fix, lanjut |
| "Rollback" | Git checkout ke commit terakhir yang stable |
| "Stop" | Set project status ke "stopped" → tidak ada eksekusi lagi |

**Rollback procedure:**
```bash
# 1. Lihat commit history
git log --oneline -10

# 2. Rollback ke commit tertentu
git reset --hard [commit-hash]

# 3. Force push (jika remote)
git push --force origin main

# 4. Catat di progress.md
```

---

## Referensi File

| File | Path | Fungsi |
|------|------|--------|
| user_requirement.md | `./user_requirement.md` | Input user: requirement, feedback, approval, interupsi |
| progress.md | `./progress.md` | Source of truth progress project — diupdate AI |
| architecture-decisions.md | `./architecture-decisions.md` | Catatan keputusan arsitektur |
| audit-report.md | `./audit-report.md` | Laporan audit (dibuat Phase 5) |
| deployment-log.md | `./deployment-log.md` | Log deployment (dibuat Phase 6) |
| RULES-OF-THE-GAME.md | `./RULES-OF-THE-GAME.md` | Aturan wajib Sainskerta |
| TEMPLATE-ARCHITECTURE.md | `./TEMPLATE-ARCHITECTURE.md` | Template tanya jawab arsitektur |
| CLI.md | `./CLI.md` | Panduan CLI untuk workflow |
| README.md | `./README.md` | Dokumentasi utama workflow |
| phases/*.md | `./phases/` | Detail setiap fase |
| standards/*.md | `./standards/` | Standar teknis & aturan detail |
| templates/*.md | `./templates/` | Template file (progress, user_requirement, loop) |
| templates/claude-workflow.sh | `./templates/claude-workflow.sh` | Script utama workflow |

### Cross-Reference

| FLOW.md Section | Referensi Eksternal |
|-----------------|---------------------|
| Phase 0 (arsitektur) | `TEMPLATE-ARCHITECTURE.md`, `RULES-OF-THE-GAME.md` |
| Phase 1 (database) | `standards/DATABASE-RULES.md`, `phases/00-PREREQUISITES.md` |
| Phase 2 (wireframe) | `standards/UI-UX-STANDARDS.md`, `phases/02-WIREFRAME-AUDIT.md` |
| Phase 3 (backend) | `phases/03-BACKEND.md`, `standards/SAINSKERTA-RULES.md` |
| Phase 4 (frontend) | `phases/04-FRONTEND.md`, `standards/UI-UX-STANDARDS.md` |
| Phase 5 (audit) | `phases/05-AUDIT.md`, `RULES-OF-THE-GAME.md` |
| Phase 6 (deploy) | `phases/06-DEPLOYMENT.md`, `CLI.md` |
| Phase 7 (improvement) | `phases/07-IMPROVEMENT.md`, `templates/loop.md` |
| Approval Flow | `templates/progress.md`, `templates/user_requirement.md` |
| AI Auto-Fill Rules | `phases/01-PLANNING.md`, `standards/AI-PROVIDERS.md` |
| Error Recovery | `CLI.md`, `templates/loop.md` |

---

## Aturan Penting untuk AI

1. **Baca `user_requirement.md` di setiap iterasi** — jangan pakai data lama
2. **Update `progress.md` setelah setiap step** — jangan di akhir fase aja
3. **Tulis approval request ke `user_requirement.md` DULU** — baru stop
4. **Jangan lanjut ke fase berikutnya tanpa approval** — kecuali fase yang tidak butuh approval (lihat aturan di RULES-OF-THE-GAME.md)
5. **Jangan hardcode data** — semua dari database/API
6. **Catat error dengan detail** — agar user bisa bantu debugging
7. **Gunakan format yang konsisten** — ✅, ❌, ⚠️, ➡️, 👀, ⏳
8. **Commit setelah setiap fase selesai** — agar mudah rollback
9. **Tulis dalam Bahasa Indonesia** — untuk komunikasi dengan user
10. **Patuhi RULES-OF-THE-GAME.md** — tidak ada toleransi pelanggaran

---

*Document Version: 1.0*
*Terakhir diupdate: 2026-06-19*
*Referensi: [SKILL.md](SKILL.md) — Panduan OpenClaw untuk workflow ini*
