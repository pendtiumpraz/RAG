# Goal vs Loop — Decision Tree

> OpenClaw WAJIB menganalisis setiap perintah sebelum menjalankan Claude Code.
> Pilih mode yang tepat: `-p` (one-shot), `/goal` (continuous), atau `/loop` (periodic).

## Decision Tree

```
┌─────────────────────────────┐
│     PERINTAH DARI USER      │
└─────────────┬───────────────┘
              ▼
    ┌──────────────────┐
    │   ANALISA TUGAS  │
    │  - Apa jenisnya? │
    │  - Timeline?     │
    │  - Berulang?     │
    └────────┬─────────┘
             │
     ┌───────┴────────┐
     ▼                ▼
┌──────────┐  ┌────────────────┐
│ ONE-SHOT │  │   CONTINUOUS   │
│          │  │                │
│ - prompt │  │ - pipeline     │
│ - research│  │ - multi-step   │
│ - edit   │  │ - bug fixing   │
│ - single │  │ - content writing
│   task   │  │ - migration    │
└────┬─────┘  └───────┬────────┘
     │                │
     ▼                ├──────────────────┐
┌──────────┐         ▼                  ▼
│  claude  │   ┌──────────┐     ┌──────────────┐
│   -p     │   │  /goal   │     │   /loop      │
│          │   │          │     │              │
│ Output   │   │ Kontinu  │     │ Periodic     │
│ ke file  │   │ sampe    │     │ tiap X menit │
│ .md      │   │ goal met │     │ + evaluasi   │
└──────────┘   └──────────┘     └──────────────┘
```

## Aturan

| Kondisi | Mode | Account |
|---|---|---|
| Research / analisa | `-p` | privasimu |
| Planning fase (nulis doc) | `-p` | privasimu |
| Nulis kode fitur | `-p` atau sub-agent | privasimu |
| Pipeline development (step 1→n) | **/goal** | privasimu |
| Bug fixing multi-round | **/goal** | privasimu |
| Nulis buku/konten 200+ halaman | **/goal** dedicated instance | privasimu |
| Monitoring / periodic check | **/loop** Xm | privasimu |
| Maintenance loop pasca-deploy | **/loop** 10m | privasimu |
| Kalo quota privasimu entek | -p | claude (akun 1) |

## Flow Eksekusi

1. OpenClaw terima perintah
2. Analisa jenis tugas (one-shot / continuous / periodic)
3. Pilih mode + account
4. Panggil Claude Code dengan param:
   ```
   claude-privasimu --allowed-tools "Read(*)" "Write(*)" "Edit(*)" "Bash(*)" "WebFetch(*)" WebSearch -p "<prompt>"
   ```
5. Kalo mode interaktif:
   - `/goal <deskripsi goal>` — buat continuous
   - `/loop <interval>` — buat periodic
6. Report hasil
