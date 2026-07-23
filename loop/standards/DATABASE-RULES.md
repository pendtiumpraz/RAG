# DATABASE-RULES.md — Aturan Database Sainskerta

> **Panduan implementasi database untuk semua project Sainskerta. Aturan ini WAJIB diikuti.**

---

## 📜 Aturan Utama

### 1. No Foreign Key Constraints — WAJIB

Database TIDAK BOLEH memiliki foreign key constraint. Relasi dijaga di level aplikasi.

```sql
-- ❌ SALAH — Ada foreign key constraint
CREATE TABLE products (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    category_id BIGINT UNSIGNED,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
);

-- ✅ BENAR — Hanya kolom, tanpa constraint
CREATE TABLE products (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    category_id BIGINT UNSIGNED NULL,
    INDEX idx_category_id (category_id)  -- Tetap tambah index!
);
```

### 2. Soft Delete Wajib

Setiap tabel WAJIB memiliki kolom `deleted_at`.

```sql
deleted_at TIMESTAMP NULL DEFAULT NULL,
INDEX idx_deleted_at (deleted_at)
```

**Aturan:**
- `deleted_at = NULL` → data aktif
- `deleted_at = TIMESTAMP` → data terhapus (soft)
- **Jangan hapus data permanen** kecuali benar-benar diperlukan (force delete)

### 3. Timestamps Wajib

Setiap tabel WAJIB memiliki:

```sql
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
```

### 4. Migration Wajib

Gunakan migration system framework. **Jangan edit schema langsung di database.**

Setiap perubahan schema harus via migration file yang version controlled.

### 5. Seeder Wajib untuk Development

Seeder diperlukan untuk mengisi data development. Tapi ingat: **frontend tidak boleh menggunakan hardcoded data.**

Seeder harus:
- Produce data realistis
- Bisa di-reset (refresh)
- Tidak bergantung pada foreign key constraint

### 6. Naming Convention: snake_case

| Element | Convention | Contoh |
|---------|-----------|--------|
| Table name | snake_case, plural | `users`, `product_categories` |
| Column name | snake_case | `first_name`, `deleted_at`, `category_id` |
| Index name | idx_{column} | `idx_category_id`, `idx_deleted_at` |
| Primary key | `id` | Selalu `id` BIGINT UNSIGNED |

---

## 🏗️ Template Migration

### MySQL

```sql
CREATE TABLE users (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    email_verified_at TIMESTAMP NULL,
    password VARCHAR(255) NOT NULL,
    remember_token VARCHAR(100) NULL,
    role ENUM('admin', 'staff', 'user') DEFAULT 'user',
    deleted_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_deleted_at (deleted_at),
    INDEX idx_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE products (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    sku VARCHAR(100) NOT NULL UNIQUE,
    price DECIMAL(15, 2) NOT NULL DEFAULT 0,
    stock INT NOT NULL DEFAULT 0,
    description TEXT NULL,
    category_id BIGINT UNSIGNED NULL,  -- No FK!
    created_by BIGINT UNSIGNED NULL,    -- No FK!
    deleted_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_category_id (category_id),
    INDEX idx_created_by (created_by),
    INDEX idx_deleted_at (deleted_at),
    INDEX idx_price (price)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### PostgreSQL

```sql
CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    email_verified_at TIMESTAMPTZ,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'user',
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_deleted_at ON users(deleted_at);
CREATE INDEX idx_users_role ON users(role);
```

---

## 📊 Index Strategy

Selalu tambah index untuk kolom yang:

1. **Sering di-filter** — `WHERE`, `search`
2. **Sering di-join** — kolom referensi (`category_id`, `user_id`)
3. **Sering di-sort** — `ORDER BY`
4. **Soft delete** — `deleted_at`

```sql
-- Index wajib
INDEX idx_deleted_at (deleted_at)

-- Index untuk foreign key (tanpa constraint)
INDEX idx_{referenced_table}_id ({referenced_table}_id)

-- Index untuk search/filter
INDEX idx_{column} ({column})

-- Composite index untuk query umum
INDEX idx_{col1}_{col2} ({col1}, {col2})
```

---

## 💾 Backup Strategy

### Daily Backup

```bash
#!/bin/bash
# Database backup script
DB_NAME="project_production"
DB_USER="user"
BACKUP_DIR="/backups"

DATE=$(date +%Y-%m-%d-%H%M)
mysqldump -u $DB_USER -p$DB_PASS \
    --single-transaction \
    --routines \
    --triggers \
    $DB_NAME | gzip > $BACKUP_DIR/$DB_NAME-$DATE.sql.gz

# Hapus backup lebih dari 30 hari
find $BACKUP_DIR -name "*.sql.gz" -mtime +30 -delete

# Cron: 0 3 * * * /path/to/backup.sh
```

### Restore Test
Setiap 3 bulan: test restore untuk memastikan backup berfungsi.

---

## 🔐 Security

1. **Jangan simpan password di kode** — pakai `.env` file
2. **Gunakan parameter binding / ORM** — hindari SQL injection
3. **Rotasi database credentials** — setiap 90 hari
4. **Limit database user** — hanya grant privileges yang diperlukan
5. **Database hanya accessible dari app server** — jangan expose ke public

---

## ✅ Checklist Database

- [ ] Semua tabel punya `deleted_at` dan index
- [ ] Semua tabel punya `created_at`, `updated_at`
- [ ] Tidak ada foreign key constraints
- [ ] Index untuk kolom yang di-join/filter/search
- [ ] Naming snake_case
- [ ] Migration file untuk setiap perubahan
- [ ] Seeder untuk development
- [ ] Backup berjalan setiap hari

---

## 🔗 Referensi

- [RULES-OF-THE-GAME.md](../RULES-OF-THE-GAME.md) — Aturan database
- [standards/SAINSKERTA-RULES.md](SAINSKERTA-RULES.md) — Detail no foreign keys
- [phases/03-BACKEND.md](../phases/03-BACKEND.md) — Implementasi backend & migration
