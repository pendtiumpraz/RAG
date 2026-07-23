# Fase 03: Backend Development

> **Fase pembangunan backend — semua API endpoint dibuat. Frontend BELUM disentuh. Semua data dari database (tidak ada hardcoded).**

---

## 🎯 Tujuan

1. Migration database
2. Models & relationships (tanpa foreign key constraints)
3. Repository pattern untuk akses data
4. Service layer untuk business logic
5. Controllers dengan CRUD in one page pattern
6. Auth & middleware
7. API documentation

---

## 📋 Aturan Backend

- **WAJIB**: Modular Monolith structure
- **WAJIB**: No foreign key constraints di database
- **WAJIB**: Soft delete (`deleted_at` column)
- **WAJIB**: Timestamps (`created_at`, `updated_at`)
- **WAJIB**: Snake_case untuk database
- **WAJIB**: Repository + Service pattern
- **WAJIB**: API endpoints sesuai spesifikasi
- **LARANGAN**: Hardcoded data di response
- **LARANGAN**: Logic di controller (pindahkan ke service)

---

## 📋 Langkah-Langkah

### Langkah 1: Migration Database

Buat migration untuk setiap entity.

**Contoh migration MySQL:**

```sql
-- migration_create_users_table.sql
CREATE TABLE users (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role ENUM('admin', 'staff') DEFAULT 'staff',
    deleted_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

**⚠️ Catatan:** Tidak ada `FOREIGN KEY` — referensi ke tabel lain hanya sebagai kolom `bigint` biasa.

### Langkah 2: Models & Relations (Tanpa FK)

Model dengan relasi tanpa foreign key constraint.

**Contoh Laravel:**

```php
// Modules/Product/Models/Product.php
class Product extends Model
{
    use SoftDeletes;
    
    protected $fillable = ['name', 'price', 'stock', 'category_id'];
    
    // Relasi TANPA foreign key — handle di aplikasi
    public function category()
    {
        return $this->belongsTo(Category::class, 'category_id');
    }
}
```

**Contoh Node.js (Sequelize):**

```javascript
// modules/product/models/Product.js
const Product = sequelize.define('Product', {
    name: DataTypes.STRING,
    price: DataTypes.DECIMAL(10,2),
    stock: DataTypes.INTEGER,
    category_id: DataTypes.BIGINT.UNSIGNED, // NO foreign key constraint
    deleted_at: DataTypes.DATE
}, {
    paranoid: true, // soft delete
    underscored: true
});
```

### Langkah 3: Repository Pattern

Repository sebagai satu-satunya akses ke database.

```php
// Modules/Product/Repositories/ProductRepository.php
class ProductRepository
{
    public function getAll(array $filters = [])
    {
        $query = Product::query();
        
        if (!empty($filters['search'])) {
            $query->where('name', 'like', "%{$filters['search']}%");
        }
        
        return $query->paginate($filters['per_page'] ?? 10);
    }
    
    public function getTrashed()
    {
        return Product::onlyTrashed()->paginate(10);
    }
    
    public function findById($id)
    {
        return Product::withTrashed()->findOrFail($id);
    }
    
    public function create(array $data)
    {
        return Product::create($data);
    }
    
    public function update($id, array $data)
    {
        $product = $this->findById($id);
        $product->update($data);
        return $product;
    }
    
    public function softDelete($id)
    {
        $product = $this->findById($id);
        $product->delete(); // soft delete
        return $product;
    }
    
    public function restore($id)
    {
        $product = Product::onlyTrashed()->findOrFail($id);
        $product->restore();
        return $product;
    }
}
```

### Langkah 4: Service Layer

Service untuk business logic.

```php
// Modules/Product/Services/ProductService.php
class ProductService
{
    public function __construct(
        private ProductRepository $repository,
        private CategoryRepository $categoryRepository
    ) {}
    
    public function list(array $filters)
    {
        return $this->repository->getAll($filters);
    }
    
    public function create(array $data)
    {
        // Validasi referensi category ada
        if (!$this->categoryRepository->findById($data['category_id'])) {
            throw new \Exception('Category not found');
        }
        
        return $this->repository->create($data);
    }
    
    public function delete($id)
    {
        $product = $this->repository->softDelete($id);
        
        // Cascade: soft delete related data di app level
        event(new ProductDeleted($product->id));
        
        return $product;
    }
}
```

### Langkah 5: Controllers

Controller dengan pattern CRUD in one page.

```
Endpoint Pattern:
GET    /api/{resource}          → List (with pagination, search, filter)
POST   /api/{resource}          → Create
GET    /api/{resource}/{id}     → Show detail
PUT    /api/{resource}/{id}     → Update
DELETE /api/{resource}/{id}     → Soft delete
GET    /api/{resource}/trashed  → Get deleted items
PATCH  /api/{resource}/{id}/restore → Restore
```

**Contoh Controller (Laravel):**

```php
// Modules/Product/Controllers/ProductController.php
class ProductController extends Controller
{
    public function __construct(private ProductService $service) {}
    
    public function index(Request $request)
    {
        return response()->json([
            'data' => $this->service->list($request->all())
        ]);
    }
    
    public function store(StoreProductRequest $request)
    {
        $product = $this->service->create($request->validated());
        return response()->json(['data' => $product], 201);
    }
    
    public function show($id)
    {
        return response()->json([
            'data' => $this->service->findById($id)
        ]);
    }
    
    public function update(UpdateProductRequest $request, $id)
    {
        $product = $this->service->update($id, $request->validated());
        return response()->json(['data' => $product]);
    }
    
    public function destroy($id)
    {
        $this->service->delete($id);
        return response()->json(['message' => 'Deleted'], 200);
    }
    
    public function trashed()
    {
        return response()->json([
            'data' => $this->service->trashed()
        ]);
    }
    
    public function restore($id)
    {
        $product = $this->service->restore($id);
        return response()->json(['data' => $product]);
    }
}
```

### Langkah 6: Auth & Middleware

```php
// Auth routes
POST /api/auth/login
POST /api/auth/register
POST /api/auth/logout
GET  /api/auth/me
POST /api/auth/refresh

// Middleware untuk semua protected routes
Route::middleware('auth:sanctum')->group(function () {
    Route::apiResource('products', ProductController::class);
    Route::get('products/trashed', [ProductController::class, 'trashed']);
    Route::patch('products/{id}/restore', [ProductController::class, 'restore']);
});
```

### Langkah 7: API Documentation

Dokumentasi API yang jelas untuk frontend developer.

```markdown
## API Endpoints

### Products
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/products | List all (paginated) |
| POST | /api/products | Create new |
| GET | /api/products/{id} | Get detail |
| PUT | /api/products/{id} | Update |
| DELETE | /api/products/{id} | Soft delete |
| GET | /api/products/trashed | List deleted |
| PATCH | /api/products/{id}/restore | Restore |

### Response Format
```json
{
  "data": { ... },
  "message": "optional"
}
```
```

---

## ✅ Output Fase 03

Setelah fase ini selesai:
- [x] Semua migration sudah dibuat dan dijalankan
- [x] Semua model sudah dibuat
- [x] Repository pattern untuk setiap module
- [x] Service layer untuk business logic
- [x] Controller dengan CRUD endpoints lengkap
- [x] Auth & middleware
- [x] API documentation
- [x] Semua endpoint bisa di-test via Postman/curl
- [x] Tidak ada data hardcoded di response

---

## ▶️ Lanjut ke Fase 04

Setelah backend selesai dan API bisa diakses, update progress dan lanjut ke [04-FRONTEND.md](04-FRONTEND.md).

---

## 🔗 Referensi

- [standards/MODULAR-MONOLITH.md](../standards/MODULAR-MONOLITH.md) — Pattern modular
- [standards/DATABASE-RULES.md](../standards/DATABASE-RULES.md) — Aturan database
- [RULES-OF-THE-GAME.md](../RULES-OF-THE-GAME.md) — Aturan soft delete & no FK
