# Assessment Nalar — 2026-07-28

Penilaian menyeluruh 4 dimensi, skala 1–10. Digrounding pada **produksi
sungguhan**: seluruh halaman dijelajahi & di-screenshot via `agent-browser`
(login superadmin demo di rag.sainskerta.net); chat dan widget diuji dengan
pertanyaan nyata terhadap KB berisi dokumen NIB. Screenshot: `docs/assessment/`.

> **Ringkasan: UI/UX 8,0 · Agentic 7,7 · Feature 8,0 · Launching 6,9 —
> keseluruhan ±7,7/10** (assessment 2026-07-23: ±5,3 — naik +2,4 dalam 5
> hari). Produk & teknologinya layak dipakai pelanggan awal; yang menahan
> peluncuran skala adalah hal di SEKITAR produk: email, pembayaran, onboarding.

---

## A. UI/UX Readiness — **8,0/10**

| Area | Skor | Bukti | Kurangnya |
|---|:---:|---|---|
| Landing publik | 8,5 | `01-landing.png` — terdesain, bilingual, lolos syarat OAuth | Belum ada demo interaktif/video produk |
| Auth | 7,5 | `02-auth.png` — tab masuk/daftar, tombol Google | **Belum ada lupa-password** — akun terkunci = hubungi admin |
| Chat + jawaban terstruktur | 9,0 | `04-chat-jawaban.png` — kartu fakta, daftar bersitasi, panel Citations, badge sesi | Belum ada stop-generation, tombol copy, daftar riwayat sesi di halaman Chat |
| Widget embed | 8,5 | `widget-jawaban.png` — logo mark, blok, footnote sumber, typing dots | `conversationId` di memori halaman saja — reload = sesi baru (belum localStorage) |
| Knowledge (KB N:M) | 8,5 | `knowledge.png` — tabel KB, badge chatbot pemakai, delta "+1", Assign | Progres sync tak realtime (harus refresh); belum ada UI unggah berkas |
| Conversations | 8,0 | `conversations.png` — bubble kiri-kanan, sitasi berjudul | Belum ada pencarian/filter tanggal & export transkrip |
| Dashboard | 7,0 | `dashboard.png` — angka pemakaian nyata, quickstart | Setengah bawah kosong; belum ada grafik tren |
| Dataroom | 8,5 | `dataroom-cover.png` `dataroom-biaya.png` — slide navy + wordmark, tabel biaya | Slide masih tabel-sentris, belum ada diagram/chart |
| Komponen & konsistensi | 8,0 | design system token, drawer seragam; dropdown baru dibenahi (chevron custom, hover) | — |
| Responsif mobile | 6,5 | hamburger sidebar ada | Tabel lebar belum diaudit di layar sempit |
| Aksesibilitas | 7,0 | focus ring, aria-modal, reduced-motion | Belum diaudit menyeluruh; Lighthouse menandai kontras beberapa teks |

## B. Agentic Readiness — **7,7/10**

| Area | Skor | Bukti | Kurangnya |
|---|:---:|---|---|
| Pipeline RAG | 8,0 | retrieval union KB ter-assign, delta sync, sitasi dipaksa guardrail | Belum ada reranker & hybrid search (BM25+vector); chunking fixed 800 char, belum semantic |
| Jawaban terstruktur | 9,0 | blok text/list/cards/chart + fallback prosa + sanitasi per-string | Chart baru bar/line satu seri; blok tabel belum ada |
| Guardrails | 8,5 | 5 lapis di jalur tiap giliran + penetral blok palsu, semuanya bertes | Belum ada korpus eval injeksi otomatis & lapis moderasi konten |
| Memory agent | 7,0 | distill/link/graph/self-evolve + write-back `_nalar-memory/` ke Drive | Hanya terpicu sync; belum belajar dari percakapan; kualitas notes tak dievaluasi |
| Fleksibilitas model | 9,0 | 14 model · 8 provider · LLM & embedding self-hosted (OpenAI-compatible) | — |
| API utk agen/integrasi | 6,5 | OpenAPI 3.1 lengkap di `/api/openapi`, SSE terdokumentasi | **Belum ada API key server-to-server per tenant** (akses programatik = cookie sesi); belum ada webhook & MCP server |

## C. Feature Readiness — **8,0/10**

| Fitur | Skor | Kurangnya |
|---|:---:|---|
| Auth + gerbang verifikasi superadmin | 8,5 | Lupa-password; 2FA |
| Team & undangan | 8,0 | Link undangan dibagikan manual — belum terkirim via email |
| KB mandiri + assignment N:M | 9,0 | Konektor `upload` & `url` ada di enum tapi belum ada UI/implementasi |
| Sync Drive (Picker & full) + delta | 8,5 | Full-scan SaaS menunggu verifikasi CASA (Picker sudah bebas verifikasi) |
| Analitik per chatbot | 8,0 | Export CSV; rentang tanggal kustom |
| Billing | 6,0 | **Manual sepenuhnya** — tanpa gateway, invoice, kuitansi |
| Observability | 7,5 | Papan baca saja — alerting/notifikasi belum ada |
| On-premise (docker + LLM lokal) | 8,0 | Panduan instalasi pelanggan & mekanisme lisensi belum dibakukan |
| Branding/white-label | 8,0 | Logo hanya via URL — belum bisa unggah dari UI |
| Dataroom | 8,5 | Harga Enterprise/On-prem belum diisi (keputusan bisnis) |

## D. Launching Readiness — **6,9/10**

| Area | Skor | Kurangnya |
|---|:---:|---|
| Infrastruktur & CI | 8,0 | CI verify+integration+smoke hijau; catatan sadar: rate limit in-memory tak dibagi antar lambda |
| Keamanan | 8,0 | RLS terverifikasi ulang pasca-insiden `db:push` (sudah dipagari permanen); pen-test eksternal belum |
| Legal & kepatuhan | 7,5 | Privacy/Terms live + ringkasan Inggris; kontak masih gmail pribadi; template DPA belum |
| **Sistem email** | **4,0** | **Tidak ada sama sekali** — approval, undangan, reset password, notifikasi semuanya tanpa email. Blocker onboarding paling nyata |
| Monetisasi | 5,5 | Tanpa payment gateway — aktivasi plan manual |
| Onboarding pengguna | 6,5 | Approval manual tanpa notifikasi = pendaftar menggantung tanpa kabar |
| Dokumentasi pengguna | 6,0 | Panduan OAuth ada; help center/user guide belum |
| Backup & DR | 7,0 | PITR bawaan Neon; runbook pemulihan belum ditulis |

---

## Prioritas yang disarankan (dampak ÷ usaha)

1. **Sistem email** (Resend/SES): notifikasi approval, undangan, reset
   password — membuka simpul onboarding & auth sekaligus (≈ Launching +1,0).
2. **Payment gateway** (Midtrans/Xendit utk pasar ID): upgrade plan mandiri.
3. **API key per tenant + webhook**: membuka integrasi programatik/agen.
4. **UI unggah berkas** ke KB (enum `upload` sudah ada, tinggal jalurnya).
5. **Persist sesi widget** (localStorage) + riwayat sesi di halaman Chat.
6. Reranker/hybrid search bila kualitas retrieval mulai jadi keluhan.

*Metodologi: tiap skor dirujuk ke perilaku yang DISAKSIKAN di produksi
(screenshot) atau kode bertes; tak ada skor untuk fitur yang belum terlihat
bekerja. Assessment sebelumnya (2026-07-23, rata-rata 5,3) digantikan
dokumen ini.*
