# MODULAR-MONOLITH.md — Implementasi Modular Monolith Sainskerta

> **Panduan implementasi arsitektur Modular Monolith versi Sainskerta. Satu codebase, module terpisah, komunikasi event-driven.**

---

## 🧱 Konsep Dasar

Modular Monolith adalah arsitektur dimana:
- **Satu codebase** (monolith) — deploy satu aplikasi
- **Module terpisah** — secara logical/folder, bukan service terpisah
- **Komunikasi event-driven** — antar module via events/listeners
- **Shared kernel** — utility, base classes, middleware yang dipakai bersama

```
┌──────────────────────────────────────────────────┐
│                  SATU APLIKASI                    │
├──────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │  Core    │  │  Product │  │  Sales   │       │
│  │ Module   │  │  Module  │  │  Module  │       │
│  │          │  │          │  │          │       │
│  │ Auth     │  │ Produk   │  │ Orders   │       │
│  │ Users    │  │ Category │  │ Payments │       │
│  │ Roles    │  │ Inventory│  │ Shipping │       │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘       │
│       │              │              │             │
│       └──────────────┴──────────────┘             │
│                        │                          │
│               ┌────────┴────────┐                 │
│               │   Event Bus    │                  │
│               │  (Dispatcher)  │                  │
│               └────────────────┘                 │
└──────────────────────────────────────────────────┘
```

---

## 📁 Module Structure

Setiap module mengikuti struktur standar:

```
Modules/{ModuleName}/
├── module.json              ← Metadata module
├── Controllers/             ← HTTP controllers
├── Models/                  ← Eloquent/ORM models
├── Repositories/            ← Data access layer
├── Services/                ← Business logic
├── Events/                  ← Events yang di-*dispatch*
├── Listeners/               ← Listeners untuk events
├── Requests/                ← Form request validation
├── Resources/               ← API resource transformer
├── Routes/                  ← Route definitions
└── Providers/               ← Service provider
```

### Contoh module.json

```json
{
    "name": "Product",
    "version": "1.0.0",
    "description": "Module manajemen produk",
    "dependencies": ["Core"],
    "providers": [
        "Modules\\Product\\Providers\\ProductServiceProvider"
    ]
}
```

---

## 🔄 Service Pattern

Service layer adalah tempat semua **business logic**. Controller hanya routing.

### Aturan Service
1. Service hanya berkomunikasi dengan Repository dan Service lain (via DI)
2. Service tidak boleh tahu tentang HTTP (request, response)
3. Service return data/throw exception
4. Service bisa panggil service dari module lain

```php
// Modules/Product/Services/ProductService.php
class ProductService
{
    public function __construct(
        private ProductRepository $productRepo,
        private CategoryRepository $categoryRepo,
        private EventDispatcher $events
    ) {}
    
    public function list(array $filters): LengthAwarePaginator
    {
        return $this->productRepo->getAll($filters);
    }
    
    public function create(array $data): Product
    {
        // Business logic: validasi referensi
        if (!$this->categoryRepo->exists($data['category_id'])) {
            throw new ValidationException('Kategori tidak ditemukan');
        }
        
        // Business logic: auto-generate SKU
        $data['sku'] = $this->generateSku($data['category_id']);
        
        $product = $this->productRepo->create($data);
        
        // Dispatch event untuk module lain
        $this->events->dispatch(new ProductCreated($product));
        
        return $product;
    }
    
    public function delete(int $id): void
    {
        $product = $this->productRepo->findById($id);
        
        // Business logic: cek apakah produk bisa dihapus
        if ($this->hasActiveOrders($product->id)) {
            throw new ValidationException('Tidak bisa menghapus produk yang memiliki pesanan aktif');
        }
        
        $this->productRepo->softDelete($id);
        $this->events->dispatch(new ProductDeleted($product->id));
    }
    
    private function generateSku(int $categoryId): string
    {
        return 'SKU-' . $categoryId . '-' . strtoupper(uniqid());
    }
}
```

---

## 📦 Repository Pattern

Repository adalah satu-satunya layer yang berinteraksi dengan database.

### Aturan Repository
1. Semua query database harus lewat Repository
2. Repository hanya return data (Model/Collection)
3. Repository tidak tahu tentang business logic

```php
// Modules/Product/Repositories/ProductRepository.php
class ProductRepository
{
    public function getAll(array $filters): LengthAwarePaginator
    {
        $query = Product::query()
            ->with('category')
            ->whereNull('deleted_at');  // Hanya data aktif
        
        if (!empty($filters['search'])) {
            $query->where(function($q) use ($filters) {
                $q->where('name', 'like', "%{$filters['search']}%")
                  ->orWhere('sku', 'like', "%{$filters['search']}%");
            });
        }
        
        if (!empty($filters['category_id'])) {
            $query->where('category_id', $filters['category_id']);
        }
        
        if (!empty($filters['sort'])) {
            $query->orderBy($filters['sort'], $filters['order'] ?? 'asc');
        }
        
        return $query->paginate($filters['per_page'] ?? 15);
    }
    
    public function getTrashed(): LengthAwarePaginator
    {
        return Product::onlyTrashed()->with('category')->paginate(15);
    }
    
    public function findById(int $id): Product
    {
        return Product::withTrashed()->with('category')->findOrFail($id);
    }
    
    public function create(array $data): Product
    {
        return Product::create($data);
    }
    
    public function update(int $id, array $data): Product
    {
        $product = $this->findById($id);
        $product->update($data);
        return $product->fresh();
    }
    
    public function softDelete(int $id): void
    {
        $product = $this->findById($id);
        $product->delete();
    }
    
    public function restore(int $id): Product
    {
        $product = Product::onlyTrashed()->findOrFail($id);
        $product->restore();
        return $product;
    }
    
    public function countByCategory(int $categoryId): int
    {
        return Product::where('category_id', $categoryId)
            ->whereNull('deleted_at')
            ->count();
    }
}
```

---

## 📡 Event-Driven Antar Module

Module berkomunikasi via **Events & Listeners**.

### Contoh Events

```php
// Modules/Product/Events/ProductCreated.php
class ProductCreated
{
    public function __construct(
        public Product $product
    ) {}
}

// Modules/Product/Events/ProductDeleted.php
class ProductDeleted
{
    public function __construct(
        public int $productId
    ) {}
}
```

### Contoh Listeners (di module lain)

```php
// Modules/Sales/Listeners/UpdateProductStock.php
class UpdateProductStock
{
    public function handle(ProductUpdated $event): void
    {
        // Update stock di module Sales
        $this->stockService->syncStock($event->product->id, $event->product->stock);
    }
}

// Modules/Log/Listeners/LogProductActivity.php
class LogProductActivity
{
    public function handle(ProductCreated|ProductUpdated|ProductDeleted $event): void
    {
        Log::channel('activity')->info('Product activity', [
            'action' => class_basename($event),
            'product_id' => $event->product->id ?? $event->productId,
            'user_id' => auth()->id(),
            'timestamp' => now()
        ]);
    }
}
```

### Event Map

```
ProductCreated → [AuditLog, IndexSearch, UpdateStock]
ProductUpdated → [AuditLog, IndexSearch, UpdateStock]
ProductDeleted → [AuditLog, RemoveFromIndex]
OrderCreated   → [AuditLog, UpdateInventory, SendEmail]
UserRegistered → [AuditLog, SendWelcomeEmail, AssignDefaultRole]
```

---

## 🧪 Testing Strategy

### Unit Test — Service Layer
```php
class ProductServiceTest extends TestCase
{
    public function test_create_product_with_valid_data()
    {
        $service = app(ProductService::class);
        $product = $service->create([
            'name' => 'Test Product',
            'price' => 10000,
            'category_id' => 1
        ]);
        
        $this->assertInstanceOf(Product::class, $product);
        $this->assertEquals('Test Product', $product->name);
    }
    
    public function test_create_product_with_invalid_category()
    {
        $this->expectException(ValidationException::class);
        
        $service = app(ProductService::class);
        $service->create([
            'name' => 'Test',
            'category_id' => 9999 // Tidak ada
        ]);
    }
}
```

### Integration Test — API Endpoints
```php
class ProductApiTest extends TestCase
{
    public function test_can_list_products()
    {
        Product::factory(3)->create();
        
        $response = $this->getJson('/api/products');
        
        $response->assertStatus(200)
                 ->assertJsonCount(3, 'data.data');
    }
    
    public function test_can_soft_delete_product()
    {
        $product = Product::factory()->create();
        
        $response = $this->deleteJson("/api/products/{$product->id}");
        
        $response->assertStatus(200);
        $this->assertSoftDeleted($product);
    }
    
    public function test_can_restore_deleted_product()
    {
        $product = Product::factory()->create();
        $product->delete();
        
        $response = $this->patchJson("/api/products/{$product->id}/restore");
        
        $response->assertStatus(200);
        $this->assertDatabaseHas('products', [
            'id' => $product->id,
            'deleted_at' => null
        ]);
    }
}
```

---

## 📊 Keuntungan Modular Monolith

| Aspek | Modular Monolith | Microservices |
|-------|-----------------|---------------|
| **Setup** | 1 hour | Days |
| **Deploy** | 1 command | Pipeline kompleks |
| **Debug** | Easy | Distributed tracing |
| **Testing** | Simple | Contract tests |
| **Team size** | 1-5 | 10+ |
| **Performance** | No network call | Network latency |
| **Learning curve** | Low | High |

---

## 🔗 Referensi

- [RULES-OF-THE-GAME.md](../RULES-OF-THE-GAME.md) — Aturan modular monolith
- [standards/SAINSKERTA-RULES.md](SAINSKERTA-RULES.md) — Detail aturan no foreign keys
- [standards/DATABASE-RULES.md](DATABASE-RULES.md) — Aturan database
- [phases/03-BACKEND.md](../phases/03-BACKEND.md) — Implementasi backend
