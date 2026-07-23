# RULES-OF-THE-GAME

> **Aturan Sainskerta yang WAJIB dipatuhi di setiap project. Tidak ada toleransi. Tidak ada pengecualian.**

---

## 🔴 Aturan Mutlak (Absolute Rules)

### 1. Modular Monolith — WAJIB
Tidak ada microservices. Semua project adalah **Modular Monolith**: satu codebase, module terpisah, komunikasi event-driven.

```
Kenapa? Karena:
- TIM KECIL — tidak ada tim besar yang butuh deploy independen
- KOMPLEKSITAS — microservices butuh infra yang rumit (message broker, container orchestration)
- MAINTENANCE — satu codebase lebih mudah di-maintain tim kecil
- PERFORMANCE — tidak perlu network call antar service
```

Detail: [standards/MODULAR-MONOLITH.md](standards/MODULAR-MONOLITH.md)

### 2. No Foreign Keys di Database — WAJIB
Di level database, **TIDAK BOLEH ada foreign key constraint**. Referential integrity dijaga di level aplikasi.

```
Kenapa? Karena:
- FLEKSIBILITAS — soft delete lebih mudah tanpa cascade constraint
- MIGRATION — tidak ada error constraint saat migrate
- PERFORMANCE — tidak perlu index overhead dari FK
- TESTING — lebih mudah seed data tanpa urutan dependency
```

Detail: [standards/DATABASE-RULES.md](standards/DATABASE-RULES.md)

### 3. Soft Delete & Restore — WAJIB
Setiap tabel harus punya kolom `deleted_at` (TIMESTAMP nullable). Data tidak pernah dihapus permanen.

**Wajib ada:**
- Endpoint `GET /api/{resource}/trashed` — lihat data terhapus
- Endpoint `PATCH /api/{resource}/{id}/restore` — restore data
- Cascade delete di handle aplikasi (bukan database)

### 4. CRUD in One Page — WAJIB
Tidak ada halaman terpisah untuk create, edit, list. Semua dalam satu halaman.

**Pattern:**
- List (table) → default view
- Create → tombol "Tambah" → modal form
- Edit → klik row/list → modal form yang sama
- Delete → konfirmasi soft delete
- Restore → tombol di table trashed items

### 5. Modal di Kanan (Right-Side Drawer) — WAJIB
Semua form create/edit menggunakan **right-side drawer modal**, bukan popup tengah.

**Spesifikasi:**
- Lebar: 400px (atau 90% di mobile < 768px)
- Animasi: slide-in dari kanan (300ms ease)
- Backdrop: semi-transparan hitam (rgba(0,0,0,0.5))
- Close: tombol X di pojok kanan atas + klik backdrop
- Scroll: overflow-y auto jika konten panjang

### 6. Sidebar Dashboard — 1 Color Icon — WAJIB
Sidebar menggunakan **1 warna solid per icon**. Setiap menu punya icon monochrome dengan warna solid yang berbeda.

**Aturan:**
- SVG inline (bukan icon font)
- Satu warna solid per menu (hex code)
- Tidak ada gradient
- Web-safe colors
- Hover: opacity 0.8
- Active/selected: warna lebih terang (lighten 20%)

### 7. Say No to Hardcoded Dummy Data — WAJIB
Frontend **TIDAK BOLEH** menggunakan dummy/hardcoded data untuk development. Semua data harus dari database via backend API.

**Konsekuensi:**
- Backend harus punya seeder/endpoint untuk data development
- Frontend harus loading state jika data belum tersedia
- Kalau belum ada API endpoint, frontend nunggu — tidak pakai mock data

### 8. Database Access — WAJIB DARI USER
User WAJIB memberikan akses database (host, user, password, db_name) SEBELUM project dibuat.

**Tanpa DB access? Project tidak bisa dimulai.**

### 9. Backend Dulu, Baru Frontend
Urutan development: **Backend → API Documentation → Frontend**.

Backend harus selesai dengan API yang berfungsi sebelum frontend dimulai. Frontend integrasi dengan API beneran, bukan mock.

### 10. Semua Keputusan Arsitektur dari User
User menentukan di fase planning:
- Framework backend & frontend
- Target deployment (VPS/shared hosting/cloud)
- Database engine
- Integrasi AI (provider)
- Domain & SSL

Template tanya jawab: [TEMPLATE-ARCHITECTURE.md](TEMPLATE-ARCHITECTURE.md)

### 11. Audit Wajib Sebelum Deploy
TIDAK BOLEH deploy sebelum fase audit selesai. Audit mencakup:
- Security check (XSS, SQL injection, CSRF)
- Performance test
- Code review
- UI/UX consistency
- Mobile responsiveness
- Database optimization

---

## 🟡 Aturan Anjuran (Recommendations)

### 12. Database Migration Wajib
Gunakan migration system. Jangan edit schema manual di database.

### 13. Seeder untuk Development — Tapi Jangan di Frontend
Seeder untuk populate database development itu BOLEH. Tapi frontend tetap nunggu data dari API.

### 14. Snake_case untuk Database
Semua nama tabel, kolom menggunakan `snake_case`. Bukan `camelCase` atau `PascalCase`.

### 15. Git Wajib
Setiap project harus version controlled dengan Git. Commit minimal per fase selesai.

### 16. Progress Tracking
File `progress.md` WAJIB diupdate setiap kali ada perubahan status. Ini satu-satunya source of truth progress project.

---

## 📋 Checklist Sebelum Project Dimulai

- [ ] User sudah siapkan database credentials
- [ ] User sudah tentukan framework & target deploy
- [ ] User sudah siapkan requirement dasar (user_requirement.md)
- [ ] Folder project sudah di-setup
- [ ] Loop workflow sudah siap

## 📋 Checklist Sebelum Deploy

- [ ] Audit keamanan sudah dilakukan
- [ ] Semua form sudah ada validasi
- [ ] Error handling sudah cover semua edge case
- [ ] UI sudah responsive (mobile tested)
- [ ] Soft delete & restore berfungsi
- [ ] Database optimization sudah cek (query, index)
- [ ] Environment variables ter-setup
- [ ] SSL sudah aktif
- [ ] User sudah approve deployment
