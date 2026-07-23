# Fase 07: Improvement

> **Fase maintenance & improvement — project di production. Loop terus berjalan. Monitoring, perbaikan, fitur baru, siklus berulang.**

---

## 🎯 Tujuan

1. Monitoring error logs & performance
2. Performance tuning berkala
3. Feature requests dari `user_requirement.md`
4. Security updates (dependency & server)
5. Backup routine
6. Loop continues dengan check interval

---

## 📋 Filosofi

**Tidak ada project yang "selesai".** Yang ada adalah:

```
Deploy → Monitor → Improve → Deploy again
```

Siklus improvement berjalan terus dengan interval tertentu (default: setiap 7 hari), dengan check di antara.

---

## 📋 Langkah-Langkah

### Langkah 1: Monitoring Error Logs

- [ ] Cek error logs setiap hari
- [ ] Review Sentry/dashboard monitoring setiap minggu
- [ ] Prioritaskan error yang mempengaruhi user experience

**Checking:**
```bash
# Laravel log
tail -f storage/logs/laravel.log

# Nginx error log
tail -f /var/log/nginx/error.log

# Server resource
htop
df -h
free -m
```

### Langkah 2: Performance Tuning

**Berkala (setiap bulan):**
- [ ] Review slow queries (MySQL slow query log)
- [ ] Check page load time (Lighthouse)
- [ ] Database optimization (index, query plan)
- [ ] Asset optimization (image compression, code splitting)
- [ ] Cache strategy evaluation

### Langkah 3: Feature Requests

Proses penambahan fitur baru:

```
1. User request fitur → tulis di user_requirement.md
2. AI analisa requirement
3. Planning (arsitektur, UI, API)
4. Wireframe → Audit → (kembali ke fase 02)
5. Backend → Frontend → Audit
6. Deploy improvement
```

**Loop untuk fitur baru:**

```
[07-IMPROVEMENT] 
    → Ada request fitur baru?
    → Ya → Kembali ke [01-PLANNING] → [02-WIREFRAME-AUDIT] → [03-BACKEND] → [04-FRONTEND] → [05-AUDIT] → [06-DEPLOYMENT]
    → Tidak → Lanjut monitoring
```

### Langkah 4: Security Updates

**Wajib dilakukan:**
- [ ] Update dependency (npm/composer/pip) setiap bulan
- [ ] Check security advisories untuk framework
- [ ] Update server OS packages
- [ ] Review file permissions
- [ ] Rotate API keys setiap 90 hari
- [ ] SSL certificate renewal (jika pakai Let's Encrypt — setiap 60-90 hari)

**Command update:**
```bash
# Laravel
composer update
php artisan migrate

# Node.js
npm update
npm audit fix

# Server
sudo apt update && sudo apt upgrade -y
```

### Langkah 5: Backup Routine

**Backup schedule:**
- Database: setiap hari (cron)
- File uploads: setiap minggu
- Full server: setiap bulan

**Test restore:** Setiap 3 bulan, test restore dari backup untuk memastikan backup berfungsi.

### Langkah 6: Loop Continues

**Check interval default: every 7 days.**

Setiap interval:
1. Cek error logs (7 hari terakhir)
2. Cek user_requirement.md untuk feature requests
3. Cek dependency updates
4. Cek server health (disk, RAM, CPU)
5. Jika ada yang perlu ditindaklanjuti → buat task
6. Update progress.md

---

## 📋 Improvement Checklist (Berkala)

### Harian
- [ ] Cek error logs (kalau ada notification)
- [ ] Cek uptime monitor

### Mingguan
- [ ] Review error logs (7 hari)
- [ ] Cek storage/disk usage
- [ ] Review user_requirement.md untuk feedback/request

### Bulanan
- [ ] Update dependencies
- [ ] Performance review (Lighthouse)
- [ ] Database optimization
- [ ] Rotasi log

### Triwulan
- [ ] Security audit
- [ ] Test restore backup
- [ ] Review architecture (masih sesuai?)
- [ ] Update AI provider jika ada model baru yang lebih baik/lebih murah

---

## 🔄 Improvement Loop Diagram

```
┌─────────────────────────────────────────────┐
│          07-IMPROVEMENT                      │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐  │
│  │ Monitor  │ → │  Check   │ → │  Update  │  │
│  │ & Logs   │   │ Requests │   │ & Fix    │  │
│  └──────────┘   └──────────┘   └──────────┘  │
│       │              │              │          │
│       ▼              ▼              ▼          │
│  ┌──────────────────────────────────────┐     │
│  │  Ada fitur baru / issue kritis?     │     │
│  │  → Ya: Kembali ke Planning Phase    │     │
│  │  → Tidak: Lanjut monitoring         │     │
│  └──────────────────────────────────────┘     │
└─────────────────────────────────────────────┘
```

---

## ✅ Output Fase 07

Fase ini **tidak pernah selesai** dalam artian final. Output yang diharapkan:
- [x] Monitoring berjalan
- [x] Backup routine berfungsi
- [x] Security updates terjadwal
- [x] Feature requests tertrack di `user_requirement.md`
- [x] Project terus improved dalam loop

---

## 🔗 Referensi

- [phases/06-DEPLOYMENT.md](06-DEPLOYMENT.md) — Status deployment terakhir
- [templates/user_requirement.md](../templates/user_requirement.md) — Tempat request fitur baru
- [templates/progress.md](../templates/progress.md) — Tracking progress improvement
- [standards/AI-PROVIDERS.md](../standards/AI-PROVIDERS.md) — Update jika ganti AI provider
