# Fase 05: Audit

> **Fase audit pra-deploy — TIDAK BOLEH deploy sebelum audit selesai. Ini adalah gerbang terakhir sebelum production.**

---

## 🎯 Tujuan

1. Security check (XSS, SQL injection, CSRF)
2. Performance test
3. Code review
4. UI/UX consistency check
5. Error handling check
6. Mobile responsiveness
7. Database optimization

---

## 📋 Checklist Audit

### □ 1. Security Check

**XSS (Cross-Site Scripting)**
- [ ] Semua user input sudah di-escape di frontend
- [ ] Backend menggunakan prepared statements/ORM (bukan raw query)
- [ ] Output di-react sudah pakai `{}` (React auto-escape)
- [ ] Tidak ada `dangerouslySetInnerHTML` tanpa sanitasi

**SQL Injection**
- [ ] Tidak ada raw SQL queries
- [ ] Semua query menggunakan ORM/Query Builder
- [ ] Parameter binding untuk semua query

**CSRF**
- [ ] CSRF token ada di semua form
- [ ] CSRF middleware aktif untuk semua POST/PUT/DELETE
- [ ] Cookie HTTP-only untuk session

**Authentication**
- [ ] Password di-hash (bcrypt/argon2)
- [ ] Rate limiting di login endpoint
- [ ] Token expiry yang reasonable
- [ ] Logout menghapus token

### □ 2. Performance Test

- [ ] Response time API < 500ms (untuk list data)
- [ ] Pagination untuk data > 50 rows
- [ ] Database query tidak N+1
- [ ] Asset (JS, CSS, image) di-minify
- [ ] Caching untuk data yang jarang berubah
- [ ] Lazy loading untuk komponen berat

### □ 3. Code Review

**Backend:**
- [ ] Repository pattern konsisten di semua module
- [ ] Service layer ada business logic (controller hanya routing)
- [ ] Tidak ada logic duplikat
- [ ] Naming convention konsisten
- [ ] Error handling ada di semua endpoint
- [ ] Validation rules lengkap

**Frontend:**
- [ ] Component reusable (tidak copy-paste)
- [ ] State management konsisten
- [ ] Tidak ada commented code
- [ ] Import yang tidak terpakai sudah dihapus
- [ ] API service layer terpusat

### □ 4. UI/UX Consistency

- [ ] Sidebar sama di semua halaman (icon 1 color)
- [ ] Right modal konsisten (400px, slide-in)
- [ ] Warna sesuai palette Sainskerta
- [ ] Typography konsisten
- [ ] Spacing konsisten
- [ ] Button style konsisten
- [ ] Form field style konsisten

### □ 5. Error Handling

- [ ] 404 page (not found)
- [ ] 500 page (server error)
- [ ] Form validation error messages
- [ ] API error messages (toast/notification)
- [ ] Network error handling
- [ ] Timeout handling

### □ 6. Mobile Responsiveness

Test di viewport:
- [ ] Desktop (1920x1080)
- [ ] Laptop (1366x768)
- [ ] Tablet (768x1024)
- [ ] Mobile (375x667)

Check:
- [ ] Sidebar collapse/hamburger di mobile
- [ ] Right modal full-width di mobile (< 768px)
- [ ] Table horizontal scroll di mobile
- [ ] Font size readable di mobile
- [ ] Touch targets minimal 44px

### □ 7. Database Optimization

- [ ] Index untuk kolom yang sering di-query (search, filter)
- [ ] Index untuk foreign key columns (meskipun tanpa FK constraint)
- [ ] Query tidak N+1 (gunakan eager loading)
- [ ] Pagination dengan cursor/index (bukan offset untuk data besar)
- [ ] Tidak ada query di loop

---

## 📋 Output Audit

Setelah audit selesai, buat laporan:

```markdown
## Laporan Audit — [Nama Project]

**Tanggal:** 2026-06-19  
**Auditor:** Sainskerta Loop Workflow

### Summary
- ✅ Security: [pass/warning/fail]
- ✅ Performance: [pass/warning/fail]
- ✅ Code Quality: [pass/warning/fail]
- ✅ UI/UX: [pass/warning/fail]
- ✅ Mobile: [pass/warning/fail]
- ✅ Database: [pass/warning/fail]

### Issues Found
1. [Issue 1] — [Severity: high/medium/low] — [Status: fixed/open]
2. [Issue 2] — [Severity: high/medium/low] — [Status: fixed/open]

### Rekomendasi
- [Rekomendasi 1]
- [Rekomendasi 2]

### Kesimpulan
- ✅ Siap deploy
- ❌ Perlu perbaikan
```

---

## ✅ Output Fase 05

Setelah fase ini selesai:
- [x] Semua security check pass
- [x] Performance test pass
- [x] Code review selesai
- [x] UI/UX konsisten dengan standar
- [x] Error handling cover semua edge case
- [x] Mobile responsive
- [x] Database optimized
- [x] Laporan audit dibuat
- [x] User sudah review laporan audit

---

## ▶️ Lanjut ke Fase 06

Setelah audit lulus dan user approves laporan, update progress dan lanjut ke [06-DEPLOYMENT.md](06-DEPLOYMENT.md).

---

## 🔗 Referensi

- [RULES-OF-THE-GAME.md](../RULES-OF-THE-GAME.md) — Aturan audit wajib
- [standards/UI-UX-STANDARDS.md](../standards/UI-UX-STANDARDS.md) — Standar UI/UX
- [standards/DATABASE-RULES.md](../standards/DATABASE-RULES.md) — Aturan database
