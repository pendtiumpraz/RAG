# UI-UX-STANDARDS.md — Standar UI/UX Sainskerta

> **Standar desain antarmuka Sainskerta. Digunakan untuk semua project. Konsistensi adalah prioritas.**

---

## 🎨 Color Palette Sainskerta

### Primary Colors

| Role | Color | Hex | Penggunaan |
|------|-------|-----|------------|
| Primary | Blue | `#3B82F6` | Tombol utama, link, active state |
| Primary Dark | Blue-700 | `#1D4ED8` | Hover tombol |
| Primary Light | Blue-50 | `#EFF6FF` | Background ringan |
| Secondary | Slate | `#64748B` | Teks sekunder, icon |
| Accent | Emerald | `#10B981` | Sukses, restore, approval |
| Danger | Red | `#EF4444` | Delete, error, warning |
| Warning | Yellow | `#F59E0B` | Peringatan |
| Info | Indigo | `#6366F1` | Informasi |

### Neutral Colors

| Role | Hex | Penggunaan |
|------|-----|------------|
| Background | `#F8FAFC` | Background halaman |
| Card | `#FFFFFF` | Card, modal, form |
| Border | `#E2E8F0` | Border, divider |
| Text Primary | `#0F172A` | Judul, konten utama |
| Text Secondary | `#64748B` | Label, deskripsi |
| Disabled | `#94A3B8` | Tombol/input disabled |
| Sidebar | `#1E293B` | Background sidebar |

### Sidebar Icon Colors (1 Color Solid per Menu)

| Menu | Hex |
|------|-----|
| Dashboard | `#3B82F6` |
| Produk | `#10B981` |
| Kategori | `#F59E0B` |
| Transaksi | `#14B8A6` |
| Laporan | `#8B5CF6` |
| Pengguna | `#EF4444` |
| Pengaturan | `#6B7280` |

---

## 🔤 Typography

### Font Stack
```
font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
```

### Font Sizes

| Element | Size | Weight | Line Height |
|---------|------|--------|-------------|
| H1 | 24px | 700 | 32px |
| H2 | 20px | 600 | 28px |
| H3 | 18px | 600 | 24px |
| Body | 14px | 400 | 20px |
| Small | 12px | 400 | 16px |
| Label | 13px | 500 | 18px |
| Button | 14px | 500 | 20px |

---

## 🧩 Component Library Rekomendasi

| Framework | Recommended Library |
|-----------|-------------------|
| React | [shadcn/ui](https://ui.shadcn.com/) + Tailwind |
| Vue | [shadcn-vue](https://www.shadcn-vue.com/) + Tailwind |
| Vue (alt) | [PrimeVue](https://primevue.org/) |
| Svelte | [shadcn-svelte](https://www.shadcn-svelte.com/) |
| Laravel | [Filament](https://filamentphp.com/) (admin panel) |

### Kenapa shadcn/ui?
- Copy-paste components (bukan dependency berat)
- Fully customizable dengan Tailwind
- Accessible (Radix UI under the hood)
- Dark mode support
- Modern design

---

## 📐 Wireframe → Mockup Flow

### Step 1: Low Fidelity Wireframe (.html)
```
Wireframe-only, grayscale, placeholder boxes
Fokus: layout & flow
Tidak ada: warna, gambar, typography detail
```

### Step 2: Audit dengan User
```
Kirim wireframe ke user → feedback → iterasi
User approve → lanjut ke mockup
```

### Step 3: High Fidelity Mockup (.html)
```
Full color (palette Sainskerta)
Icon SVG inline
Typography proper
Animasi & interaksi
Data placeholder (tapi dari format API beneran)
```

### Step 4: Audit Mockup
```
Kirim mockup ke user → feedback → iterasi
User approve → lanjut coding
```

---

## ✅ Audit Checklist UI/UX

### Sebelum Coding (Wireframe & Mockup)
- [ ] Layout sesuai dengan requirement
- [ ] Alur navigasi jelas
- [ ] Setiap halaman punya purpose
- [ ] Right modal pattern untuk create/edit
- [ ] Sidebar dengan icon 1 color solid
- [ ] Konsisten: spacing, alignment, hierarchy

### Setelah Coding (Frontend)
- [ ] Semua halaman sesuai mockup
- [ ] Warna konsisten dengan palette
- [ ] Typography konsisten
- [ ] Hover, focus, active states ada
- [ ] Loading state ada untuk setiap fetch
- [ ] Error state ada untuk setiap failure
- [ ] Empty state untuk data kosong
- [ ] Mobile responsive
- [ ] Animasi smooth (300ms untuk modal)
- [ ] Form validation error ditampilkan

---

## 📱 Responsive Breakpoints

| Device | Width | Notes |
|--------|-------|-------|
| Mobile | < 768px | Sidebar collapse, modal full-width |
| Tablet | 768px - 1024px | Sidebar mini, modal 400px |
| Desktop | > 1024px | Full layout |

---

## 🔗 Referensi

- [RULES-OF-THE-GAME.md](../RULES-OF-THE-GAME.md) — Aturan UI/UX wajib
- [standards/SAINSKERTA-RULES.md](SAINSKERTA-RULES.md) — Detail right modal & sidebar icon
- [phases/02-WIREFRAME-AUDIT.md](../phases/02-WIREFRAME-AUDIT.md) — Proses wireframe & audit
- [phases/04-FRONTEND.md](../phases/04-FRONTEND.md) — Implementasi frontend
