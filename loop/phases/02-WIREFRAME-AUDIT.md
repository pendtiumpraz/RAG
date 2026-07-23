# Fase 02: Wireframe & Audit

> **Fase desain visual — membuat wireframe, audit dengan user, iterasi, upgrade ke mockup, audit lagi, baru coding.**

---

## 🎯 Tujuan

1. Membuat wireframe (low fidelity) untuk semua halaman
2. Menampilkan wireframe ke user untuk feedback
3. Iterasi sampai approve
4. Upgrade wireframe ke mockup (high fidelity)
5. Audit mockup dengan user
6. Baru lanjut coding setelah approve final

---

## 📋 Langkah-Langkah

### Langkah 1: Buat Wireframe .html (Low Fidelity)

Buat wireframe untuk **setiap halaman** dalam format HTML. **Gunakan HTML murni + Tailwind CDN atau CSS minimal.**

**Karakteristik wireframe:**
- Tidak ada gambar/icon detail
- Layout kotak-kotak (placeholder)
- Warna greyscale (abu-abu)
- Fokus: tata letak, alur navigasi, posisi komponen
- Responsive: desktop & mobile

**Halaman yang wajib ada wireframe:**
1. Login page
2. Dashboard (home)
3. Tiap fitur CRUD (list + right modal form)
4. Profile/settings (jika ada)
5. Halaman khusus sesuai requirement

**Contoh wireframe list page:**

```html
<!-- Wireframe: Daftar Produk -->
<div style="display:flex; min-height:100vh;">
  <!-- Sidebar -->
  <div style="width:240px; background:#eee; padding:16px;">
    <div style="height:40px; background:#ddd; margin-bottom:16px;">Logo</div>
    <div style="height:32px; background:#ccc; margin-bottom:8px;">Menu 1</div>
    <div style="height:32px; background:#ccc; margin-bottom:8px;">Menu 2</div>
    <div style="height:32px; background:#999; color:white; margin-bottom:8px;">Menu 3</div>
  </div>
  <!-- Main content -->
  <div style="flex:1; padding:24px;">
    <h2>Daftar Produk</h2>
    <!-- Search & Add -->
    <div style="display:flex; justify-content:space-between; margin:16px 0;">
      <div style="width:300px; height:36px; background:#eee; border-radius:8px;"></div>
      <div style="width:120px; height:36px; background:#007bff; border-radius:8px;"></div>
    </div>
    <!-- Table -->
    <table style="width:100%; border-collapse:collapse;">
      <tr style="background:#f5f5f5;">
        <th style="padding:12px; text-align:left;">Nama</th>
        <th style="padding:12px; text-align:left;">Harga</th>
        <th style="padding:12px; text-align:left;">Stok</th>
        <th style="padding:12px; text-align:left;">Aksi</th>
      </tr>
      <tr><td colspan="4" style="padding:40px; text-align:center; color:#999;">[Data akan muncul dari database]</td></tr>
    </table>
  </div>
</div>
```

**Contoh wireframe right-side modal:**

```html
<!-- Right Modal (Create/Edit) -->
<div id="modal" style="display:none;">
  <div style="position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:1000;"></div>
  <div style="position:fixed; top:0; right:0; width:400px; height:100vh; background:white; z-index:1001; padding:24px; box-shadow:-4px 0 12px rgba(0,0,0,0.1); animation:slideIn 0.3s;">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:24px;">
      <h3>Tambah Produk</h3>
      <button style="border:none; background:none; font-size:24px;">×</button>
    </div>
    <div style="margin-bottom:16px;">
      <label>Nama Produk</label>
      <div style="height:40px; background:#f5f5f5; border-radius:8px;"></div>
    </div>
    <div style="margin-bottom:16px;">
      <label>Harga</label>
      <div style="height:40px; background:#f5f5f5; border-radius:8px;"></div>
    </div>
    <div style="margin-bottom:16px;">
      <label>Stok</label>
      <div style="height:40px; background:#f5f5f5; border-radius:8px;"></div>
    </div>
  </div>
</div>
```

### Langkah 2: Loop Audit Wireframe

Tampilkan wireframe ke user via `user_requirement.md`:

```
## Wireframe Audit

Halo! Berikut wireframe untuk project kamu:

1. **Login Page** — [link ke wireframe/login.html]
2. **Dashboard** — [link ke wireframe/dashboard.html]
3. **Daftar Produk** — [link ke wireframe/products-list.html]
4. **Modal Form Produk** — [link ke wireframe/products-form.html]

Mohon review dan feedbacknya:
- ✅ Approve? Kalau ada yang diubah?
- ❌ Ada yang kurang pas?
- 💡 Ada saran tambahan?
```

### Langkah 3: Iterasi Wireframe

- Jika user minta perubahan, update wireframe
- Tampilkan lagi ke user
- Ulangi sampai user approve SEMUA wireframe

**User harus menulis `APPROVED` di `user_requirement.md`.**

### Langkah 4: Upgrade ke Mockup (High Fidelity)

Setelah wireframe approve, upgrade ke mockup **dengan styling proper**:

- Warna sesuai palet Sainskerta (lihat [UI-UX-STANDARDS.md](../standards/UI-UX-STANDARDS.md))
- Icon SVG inline (1 color solid)
- Typography proper
- Shadow, border-radius, spacing realistis
- Animasi slide-in right modal

**Mockup harus bisa di-interact (klik, hover).**

### Langkah 5: Audit Mockup

Tampilkan mockup ke user:

```
## Mockup Audit

Wireframe sudah di-upgrade ke high fidelity mockup:
1. **Login Page** — [link]
2. **Dashboard** — [link]
3. **Daftar Produk + Modal** — [link]

Cek: apakah warna, layout, dan interaksi sudah sesuai?
```

### Langkah 6: Approve Final

User WAJIB approve mockup sebelum coding dimulai.

**Jika user minta perubahan:** iterasi lagi.

**Jika user approve:** tulis `MOCKUP APPROVED` di `user_requirement.md`.

---

## ✅ Output Fase 02

Setelah fase ini selesai:
- [x] Wireframe semua halaman sudah dibuat
- [x] User sudah review wireframe
- [x] Iterasi wireframe sesuai feedback user
- [x] Wireframe sudah di-approve user
- [x] Mockup high fidelity sudah dibuat
- [x] Mockup sudah di-approve user
- [x] Semua file mockup ada di `templates/mockup/`

---

## ▶️ Lanjut ke Fase 03

Setelah mockup approve, update progress dan lanjut ke [03-BACKEND.md](03-BACKEND.md).

---

## 🔗 Referensi

- [standards/UI-UX-STANDARDS.md](../standards/UI-UX-STANDARDS.md) — Standar UI/UX & color palette
- [RULES-OF-THE-GAME.md](../RULES-OF-THE-GAME.md) — Aturan right-side drawer modal
- [templates/user_requirement.md](../templates/user_requirement.md) — Tempat feedback user
