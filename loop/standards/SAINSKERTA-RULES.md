# SAINSKERTA-RULES.md — Aturan Detail Sainskerta

> **Dokumen ini berisi penjelasan detail setiap aturan Sainskerta. Gunakan sebagai referensi implementasi untuk setiap project.**

---

## 1. Modular Monolith

### Kenapa Bukan Microservices?

**Masalah dengan Microservices untuk tim kecil:**
- **Kompleksitas infrastruktur** — butuh message broker, service mesh, container orchestration
- **Network latency** — setiap inter-service call butuh HTTP/network
- **Debugging sulit** — tracing request yang melompat antar service
- **Deploy coordination** — butuh CI/CD yang sophisticated
- **Data consistency** — butuh saga pattern / distributed transactions
- **Overhead mental** — developer harus paham bounded context, domain events, dll

### Modular Monolith Sainskerta

Satu codebase, multiple modules. Module dipisah secara logical, bukan fisik.

```
project/
├── app/
│   └── Modules/
│       ├── Core/                    ← Module dasar (auth, user, role)
│       │   ├── Controllers/
│       │   ├── Models/
│       │   ├── Repositories/
│       │   ├── Services/
│       │   ├── Events/
│       │   ├── Listeners/
│       │   └── Routes/
│       ├── Product/                 ← Module produk
│       │   ├── Controllers/
│       │   ├── Models/
│       │   ├── Repositories/
│       │   ├── Services/
│       │   └── Routes/
│       ├── Transaction/             ← Module transaksi
│       │   ├── Controllers/
│       │   ├── Models/
│       │   ├── Repositories/
│       │   ├── Services/
│       │   ├── Events/
│       │   └── Routes/
│       └── Report/                  ← Module laporan
│           ├── Controllers/
│           ├── Services/
│           └── Routes/
├── database/
│   └── migrations/
├── routes/
└── config/
```

### Aturan Module
1. Module **tidak boleh import controller module lain** — hanya boleh Service atau Events
2. Komunikasi antar module via **Events & Listeners**
3. Setiap module punya `module.json` untuk dependency declaration
4. Module bisa di-disable tanpa merusak module lain (jika tidak ada dependency)

---

## 2. No Foreign Keys

### Aturan
Di database, **TIDAK BOLEH** ada foreign key constraint.

### Contoh Laravel Migration (SALAH ❌)
```php
// ❌ SALAH — Ada foreign key
$table->foreignId('category_id')
      ->constrained('categories')
      ->onDelete('cascade');
```

### Contoh yang BENAR ✅
```php
// ✅ BENAR — Hanya kolom biasa
$table->bigInteger('category_id')->unsigned()->nullable();
// Tambah index untuk performance
$table->index('category_id');
```

### Kenapa?
1. **Soft delete lebih mudah** — tanpa cascade constraint, kita bisa soft delete parent tanpa otomatis menghapus child
2. **Seeder/testing lebih mudah** — tidak perlu urutan insert yang kaku
3. **Migration lebih aman** — tidak ada error constraint saat rollback
4. **Performance** — tidak ada overhead constraint checking di DB

### Maintain Referential Integrity di Aplikasi

**Service Layer yang handle:**

```php
// Modules/Product/Services/ProductService.php
class ProductService
{
    public function create(array $data): Product
    {
        // Validasi: category_id harus merujuk ke category yang valid
        $category = $this->categoryRepo->findById($data['category_id']);
        if (!$category) {
            throw new ValidationException('Category tidak ditemukan');
        }
        
        return $this->productRepo->create($data);
    }
    
    public function deleteProduct(int $id): void
    {
        // Validasi: tidak bisa delete category jika masih ada produk terkait
        if ($this->productRepo->countByCategory($id) > 0) {
            throw new ValidationException('Tidak bisa menghapus kategori yang masih memiliki produk');
        }
        
        $this->productRepo->delete($id);
    }
}
```

---

## 3. Soft Delete & Restore

### Aturan
Setiap tabel WAJIB punya kolom `deleted_at` (TIMESTAMP, nullable).

### Migration
```php
// ✅ WAJIB
$table->timestamp('deleted_at')->nullable();
$table->index('deleted_at');
```

### API Endpoints
```php
// Di routes/api.php
Route::get('/products/trashed', [ProductController::class, 'trashed']);
Route::patch('/products/{id}/restore', [ProductController::class, 'restore']);
```

### Soft Delete Behavior
- `GET /api/products` — hanya return data dengan `deleted_at IS NULL`
- `GET /api/products/trashed` — hanya return data dengan `deleted_at IS NOT NULL`
- `DELETE /api/products/{id}` — set `deleted_at = NOW()`, bukan hapus permanen
- `PATCH /api/products/{id}/restore` — set `deleted_at = NULL`

### Cascade Delete di App Level
```php
// Saat menghapus category, hapus juga produk di dalamnya
class CategoryService
{
    public function delete(int $id): void
    {
        $category = $this->repo->findById($id);
        
        // Cascade: soft delete semua produk di kategori ini
        $this->productService->deleteByCategory($category->id);
        
        // Soft delete category
        $this->repo->softDelete($id);
    }
}
```

### Hapus Permanen
Kalau benar-benar perlu hapus permanen:
```php
// Endpoint khusus dengan permission admin
$product->forceDelete(); // Hanya jika benar-benar diperlukan
```

---

## 4. CRUD One Page

### Pattern
**Satu halaman untuk: List + Create + Edit + Delete + Restore.**

### Struktur Halaman
```
┌─────────────────────────────────────────────────────┐
│  Header: [Judul Halaman]          [Tombol Tambah]   │
│                                                     │
│  [Search Bar]                                       │
│                                                     │
│  ┌───────────────────────┬─────────────────────────┐│
│  │ Tab: Aktif | Sampah   │                         ││
│  ├───────────────────────┤                         ││
│  │ # │ Nama │ Harga │     │  ┌─────────────────┐   ││
│  ├───┼──────┼───────┤     │  │ RIGHT DRAWER    │   ││
│  │ 1 │ A    │ 1000  │     │  │ MODAL           │   ││
│  │ 2 │ B    │ 2000  │     │  │                 │   ││
│  │ 3 │ C    │ 3000  │     │  │ [Form Create/   │   ││
│  └───┴──────┴───────┘     │  │  Edit]          │   ││
│                            │  │                 │   ││
│  [Pagination]              │  │ [Simpan] [Batal]│   ││
│                            │  └─────────────────┘   ││
└─────────────────────────────────────────────────────┘
```

### Flow
1. **List** — Default view, paginated table
2. **Create** — Klik "Tambah" → right modal muncul → isi form → submit
3. **Edit** — Klik row/icon edit → right modal yang sama (data terisi) → update → submit
4. **Delete** — Klik icon delete → konfirmasi → soft delete
5. **Restore** — Tab "Sampah" → klik restore

---

## 5. Right-Side Modal (Drawer)

### Spesifikasi

```css
/* Container modal */
.right-modal {
    position: fixed;
    top: 0;
    right: 0;
    width: 400px;           /* Lebar tetap 400px */
    height: 100vh;          /* Full height */
    background: #ffffff;
    z-index: 1000;
    overflow-y: auto;       /* Scroll jika konten panjang */
    box-shadow: -4px 0 12px rgba(0, 0, 0, 0.1);
}

/* Animasi slide-in */
@keyframes slideInRight {
    from { transform: translateX(100%); }
    to { transform: translateX(0); }
}

.right-modal.open {
    animation: slideInRight 0.3s ease;
}

/* Backdrop */
.modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 999;
}

/* Close button */
.modal-close {
    position: absolute;
    top: 16px;
    right: 16px;
    width: 32px;
    height: 32px;
    border: none;
    background: none;
    font-size: 24px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
}

.modal-close:hover {
    background: rgba(0, 0, 0, 0.05);
}

/* Versi mobile (< 768px) */
@media (max-width: 767px) {
    .right-modal {
        width: 100%;        /* Full width di mobile */
    }
}
```

---

## 6. Sidebar 1 Color Icon

### Aturan
Setiap menu di sidebar punya **1 icon SVG dengan 1 warna solid**.

### Contoh

```html
<!-- Menu Dashboard — Icon: Home, Color: #3B82F6 (Blue) -->
<li class="menu-item">
  <svg width="20" height="20" viewBox="0 0 20 20" fill="#3B82F6">
    <path d="M10 2L2 9h2v8h5v-5h2v5h5V9h2L10 2z"/>
  </svg>
  <span>Dashboard</span>
</li>

<!-- Menu Produk — Icon: Package, Color: #10B981 (Green) -->
<li class="menu-item">
  <svg width="20" height="20" viewBox="0 0 20 20" fill="#10B981">
    <path d="M3 3h14v14H3V3zm2 2v10h10V5H5z"/>
  </svg>
  <span>Produk</span>
</li>

<!-- Menu Kategori — Icon: Folder, Color: #F59E0B (Yellow) -->
<li class="menu-item">
  <svg width="20" height="20" viewBox="0 0 20 20" fill="#F59E0B">
    <path d="M2 4h6l2 2h8v10H2V4z"/>
  </svg>
  <span>Kategori</span>
</li>

<!-- Menu Laporan — Icon: Chart, Color: #8B5CF6 (Purple) -->
<li class="menu-item">
  <svg width="20" height="20" viewBox="0 0 20 20" fill="#8B5CF6">
    <path d="M2 16h16v2H2v-2zM4 6h2v8H4V6zm4-3h2v11H8V3zm4 5h2v6h-2V8zm4-4h2v10h-2V4z"/>
  </svg>
  <span>Laporan</span>
</li>

<!-- Menu Pengguna — Icon: Users, Color: #EF4444 (Red) -->
<li class="menu-item">
  <svg width="20" height="20" viewBox="0 0 20 20" fill="#EF4444">
    <path d="M10 11c-2.2 0-6 1.1-6 3v2h12v-2c0-1.9-3.8-3-6-3zm0-2a3 3 0 100-6 3 3 0 000 6z"/>
  </svg>
  <span>Pengguna</span>
</li>

<!-- Menu Pengaturan — Icon: Gear, Color: #6B7280 (Gray) -->
<li class="menu-item">
  <svg width="20" height="20" viewBox="0 0 20 20" fill="#6B7280">
    <path d="M10 13a3 3 0 100-6 3 3 0 000 6z"/>
    <path d="M9.7 2l.3 1.2a6.5 6.5 0 012.3 1l1-.6 1.4 1.4-.6 1a6.5 6.5 0 011 2.3L16 8.3v2l-1.2.3a6.5 6.5 0 01-1 2.3l.6 1-1.4 1.4-1-.6a6.5 6.5 0 01-2.3 1L9.7 18h-2l-.3-1.2a6.5 6.5 0 01-2.3-1l-1 .6-1.4-1.4.6-1a6.5 6.5 0 01-1-2.3L2 10.3v-2l1.2-.3a6.5 6.5 0 011-2.3l-.6-1 1.4-1.4 1 .6a6.5 6.5 0 012.3-1L7.7 2h2z"/>
  </svg>
  <span>Pengaturan</span>
</li>
```

### Warna Palette untuk Sidebar Icons

| Menu | Warna | Hex |
|------|-------|-----|
| Dashboard | Blue | `#3B82F6` |
| Produk | Green | `#10B981` |
| Kategori | Yellow | `#F59E0B` |
| Laporan | Purple | `#8B5CF6` |
| Pengguna | Red | `#EF4444` |
| Transaksi | Teal | `#14B8A6` |
| Pengaturan | Gray | `#6B7280` |
| Notifikasi | Orange | `#F97316` |

### CSS Sidebar
```css
.sidebar-menu-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 16px;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.15s;
    color: #64748b;
    font-size: 14px;
}

.sidebar-menu-item:hover {
    background: rgba(255, 255, 255, 0.08);
    color: #f1f5f9;
    opacity: 0.85;
}

.sidebar-menu-item.active {
    background: rgba(255, 255, 255, 0.12);
    color: #ffffff;
}

/* Icon wrapper */
.sidebar-menu-item svg {
    flex-shrink: 0;
}
```
