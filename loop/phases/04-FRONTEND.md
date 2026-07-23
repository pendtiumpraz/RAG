# Fase 04: Frontend Development

> **Fase pembangunan frontend — semua halaman dibuat berdasarkan mockup yang sudah di-approve. Data dari API backend (TIDAK ADA hardcoded dummy data!).**

---

## 🎯 Tujuan

1. Setup frontend project
2. Sidebar layout dengan 1 color icon
3. CRUD pages (list + right modal) untuk setiap fitur
4. Soft delete & restore UI
5. Integrasi dengan backend API (data real!)
6. Form validation
7. Loading & error states

---

## 📋 Aturan Frontend

- **WAJIB**: Sidebar dengan icon SVG inline 1 color solid
- **WAJIB**: CRUD in one page (list + right drawer modal)
- **WAJIB**: Modal di kanan (400px, slide-in animation)
- **WAJIB**: Data dari API — TIDAK BOLEH hardcoded
- **WAJIB**: Loading state saat fetch data
- **WAJIB**: Error handling untuk setiap request
- **WAJIB**: Soft delete & restore UI
- **WAJIB**: Mobile responsive
- **LARANGAN**: Dummy/hardcoded data untuk development

---

## 📋 Langkah-Langkah

### Langkah 1: Setup Frontend Project

```bash
# React + Vite
cd frontend
npm create vite@latest . -- --template react
npm install axios react-router-dom

# Vue + Vite
npm create vite@latest . -- --template vue
npm install axios vue-router pinia

# Setup Tailwind CSS (rekomendasi)
npm install -D tailwindcss @tailwindcss/vite
```

### Langkah 2: Sidebar Layout dengan 1 Color Icon

**Setiap menu sidebar punya icon SVG inline dengan 1 warna solid.**

```jsx
// Contoh React — Sidebar component
const menuItems = [
  {
    label: 'Dashboard',
    icon: `<svg width="20" height="20" viewBox="0 0 20 20" fill="#3B82F6">
      <path d="M3 3h6v8H3V3zm8 0h6v4h-6V3zm0 6h6v8h-6V9zM3 13h6v4H3v-4z"/>
    </svg>`,
    path: '/'
  },
  {
    label: 'Produk',
    icon: `<svg width="20" height="20" viewBox="0 0 20 20" fill="#10B981">
      <path d="M3 3h14v14H3V3zm2 2v10h10V5H5z"/>
    </svg>`,
    path: '/products'
  },
  {
    label: 'Kategori',
    icon: `<svg width="20" height="20" viewBox="0 0 20 20" fill="#F59E0B">
      <path d="M10 2l8 4v8l-8 4-8-4V6l8-4z"/>
    </svg>`,
    path: '/categories'
  }
];
```

**CSS untuk sidebar:**

```css
.sidebar {
  width: 240px;
  min-height: 100vh;
  background: #1e293b;
  padding: 16px 0;
}

.sidebar-menu-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 20px;
  color: #94a3b8;
  transition: all 0.2s;
}

.sidebar-menu-item:hover {
  background: rgba(255,255,255,0.05);
  color: #ffffff;
  opacity: 0.8;
}

.sidebar-menu-item.active {
  background: rgba(255,255,255,0.1);
  color: #ffffff;
}
```

### Langkah 3: CRUD Pages (List + Right Modal)

**Setiap halaman CRUD terdiri dari:**
1. Header (judul + tombol Tambah)
2. Search bar & filter
3. Table data (dari API, dengan loading state)
4. Right drawer modal (create/edit form)
5. Delete confirmation
6. Trashed items view + restore

**Struktur Component:**

```
pages/
├── Dashboard.jsx
├── products/
│   ├── ProductList.jsx       # List + search + table
│   ├── ProductModal.jsx      # Right drawer modal
│   └── ProductTrashed.jsx    # Deleted items
└── categories/
    ├── CategoryList.jsx
    ├── CategoryModal.jsx
    └── CategoryTrashed.jsx
```

**Contoh Right Modal Component:**

```jsx
// RightDrawerModal.jsx
function RightDrawerModal({ isOpen, onClose, title, children }) {
  if (!isOpen) return null;
  
  return (
    <>
      {/* Backdrop */}
      <div 
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.5)',
          zIndex: 1000
        }}
      />
      
      {/* Drawer */}
      <div style={{
        position: 'fixed', top: 0, right: 0,
        width: '400px', height: '100vh',
        background: 'white', zIndex: 1001,
        padding: '24px', overflowY: 'auto',
        boxShadow: '-4px 0 12px rgba(0,0,0,0.1)',
        animation: 'slideIn 0.3s ease'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
          <h2>{title}</h2>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 24, cursor: 'pointer' }}>
            &times;
          </button>
        </div>
        
        {/* Content */}
        {children}
      </div>
      
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </>
  );
}
```

### Langkah 4: Soft Delete & Restore UI

UI untuk soft delete dan restore:

```jsx
// Di ProductList.jsx — Tombol aksi
function ActionButtons({ product, onEdit, onDelete }) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <button onClick={() => onEdit(product)} className="btn-icon">✏️</button>
      <button onClick={() => onDelete(product)} className="btn-icon">🗑️</button>
    </div>
  );
}

// Tabs: Active / Trashed
function ProductTabs({ activeTab, onTabChange }) {
  return (
    <div style={{ display: 'flex', gap: 0, marginBottom: 16 }}>
      <button 
        onClick={() => onTabChange('active')}
        className={`tab ${activeTab === 'active' ? 'active' : ''}`}
      >
        Aktif
      </button>
      <button 
        onClick={() => onTabChange('trashed')}
        className={`tab ${activeTab === 'trashed' ? 'active' : ''}`}
      >
        Sampah
      </button>
    </div>
  );
}

// Tombol Restore di trashed items
<button onClick={() => handleRestore(item.id)} className="btn-success">
  Pulihkan
</button>
```

### Langkah 5: Integrasi Backend API

**Gunakan service layer untuk API calls — jangan panggil axios langsung di component.**

```javascript
// services/productService.js
import api from './api';

export const productService = {
  getAll(params) {
    return api.get('/products', { params });
  },
  getById(id) {
    return api.get(`/products/${id}`);
  },
  create(data) {
    return api.post('/products', data);
  },
  update(id, data) {
    return api.put(`/products/${id}`, data);
  },
  delete(id) {
    return api.delete(`/products/${id}`);
  },
  getTrashed() {
    return api.get('/products/trashed');
  },
  restore(id) {
    return api.patch(`/products/${id}/restore`);
  }
};
```

### Langkah 6: Form Validation

Validasi di frontend (client-side) + backend validation.

```jsx
function ProductForm({ initialData, onSubmit }) {
  const [form, setForm] = useState({
    name: '', price: '', stock: '', category_id: ''
  });
  const [errors, setErrors] = useState({});
  
  const validate = () => {
    const errs = {};
    if (!form.name.trim()) errs.name = 'Nama produk wajib diisi';
    if (!form.price || form.price <= 0) errs.price = 'Harga harus lebih dari 0';
    if (!form.stock || form.stock < 0) errs.stock = 'Stok tidak valid';
    if (!form.category_id) errs.category_id = 'Pilih kategori';
    return errs;
  };
  
  const handleSubmit = (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    onSubmit(form);
  };
  
  return (
    <form onSubmit={handleSubmit}>
      <div className="form-group">
        <label>Nama Produk</label>
        <input
          value={form.name}
          onChange={e => setForm({...form, name: e.target.value})}
          className={errors.name ? 'error' : ''}
        />
        {errors.name && <span className="error-text">{errors.name}</span>}
      </div>
      {/* ... fields lainnya */}
    </form>
  );
}
```

### Langkah 7: Loading & Error States

Setiap halaman harus handle:
- **Loading**: spinner/skeleton saat fetch data
- **Error**: pesan error jika API gagal
- **Empty state**: pesan jika data kosong
- **Success**: toast/notifikasi setelah operasi berhasil

```jsx
function ProductList() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  useEffect(() => {
    fetchProducts();
  }, []);
  
  const fetchProducts = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await productService.getAll();
      setProducts(res.data);
    } catch (err) {
      setError('Gagal memuat data produk. Silakan coba lagi.');
    } finally {
      setLoading(false);
    }
  };
  
  if (loading) return <Spinner />;
  if (error) return <ErrorMessage message={error} onRetry={fetchProducts} />;
  
  return (
    <div>
      {/* Table */}
      {products.length === 0 ? (
        <EmptyState message="Belum ada produk. Klik Tambah untuk menambahkan." />
      ) : (
        <table>...</table>
      )}
    </div>
  );
}
```

---

## ✅ Output Fase 04

Setelah fase ini selesai:
- [x] Sidebar dengan icon 1 color solid untuk semua menu
- [x] Halaman CRUD untuk setiap fitur (list + right modal)
- [x] Soft delete & restore UI berfungsi
- [x] Semua data dari API backend (no hardcoded!)
- [x] Form validation (client + server)
- [x] Loading state di semua halaman
- [x] Error handling untuk setiap request
- [x] Empty state untuk data kosong
- [x] Mobile responsive
- [x] Sesuai dengan mockup yang sudah di-approve

---

## ▶️ Lanjut ke Fase 05

Setelah frontend selesai, update progress dan lanjut ke [05-AUDIT.md](05-AUDIT.md).

---

## 🔗 Referensi

- [standards/UI-UX-STANDARDS.md](../standards/UI-UX-STANDARDS.md) — Standar UI/UX
- [RULES-OF-THE-GAME.md](../RULES-OF-THE-GAME.md) — Aturan sidebar icon, CRUD one page
- [phases/02-WIREFRAME-AUDIT.md](02-WIREFRAME-AUDIT.md) — Mockup yang sudah di-approve
