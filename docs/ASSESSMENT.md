# Assessment Nalar — 2026-08-03

Penilaian menyeluruh 4 dimensi, skala 1–10. Padanan naratif dari
`src/app/(app)/dataroom/assessment.ts`; angkanya sama, alasannya di sini.

**Digrounding pada tur peramban otomatis.** `npm run tur` menjalankan peramban
sungguhan (playwright-core + Edge) terhadap **rag.sainskerta.net**, masuk
sebagai superadmin demo, menekan tombolnya, dan memotret tiap langkah — 30
fitur, ~120 langkah. Hasilnya tampil apa adanya di tab **Bukti Fitur**,
termasuk yang gagal. Tak ada skor untuk fitur yang belum terlihat bekerja.

> ⚠️ **Ini lingkungan STAGING Vercel, bukan pemasangan pelanggan.** Versi
> assessment sebelum 3 Agu menyebutnya "produksi sungguhan", dan itu keliru.
> Korpusnya kecil, jadi apa pun yang bergantung pada **ukuran data** — latensi,
> rencana kueri, perilaku pada korpus ratusan GB — **tidak terwakili di sini**.
> Yang dibuktikan: fiturnya ada dan bekerja. Yang tidak: perilakunya di bawah
> beban sungguhan.

> **Ringkasan: UI/UX 8,5 · Agentic 8,6 · Feature 9,0 · Launching 8,4 —
> keseluruhan ±8,8/10** (2026-07-30: 8,7 · 28 Jul: 7,7 · 23 Jul: 5,3).

## Cara membaca perubahan skornya

Angka naik hanya bila celah yang dulu tertulis benar-benar tertutup **dan**
terlihat bekerja. Angka juga bisa **tidak** naik meski banyak dikerjakan.
Pekerjaan 1–3 Agu justru **menemukan dua batas yang sebelumnya tak diketahui**:

- atap recall lapisan pertama pada korpus besar (terukur, bukan ditebak);
- bug dropdown yang hanya muncul di build **terpasang**, bukan di dev.

Batas yang baru diketahui bukan kemunduran — tapi ia juga bukan kemajuan.
Karena itu **Agentic turun 0,1** walau lima areanya naik: satu area baru
(`Recall pada korpus besar`, 6,5) masuk membawa kenyataan yang sebelumnya tak
punya tempat di tabel mana pun. Menaikkan skor seolah-olah penemuan itu
kemajuan adalah cara paling halus membuat dokumen ini berhenti bisa dipercaya.

---

## A. UI/UX Readiness — **8,5/10**

| Area | Skor | Kurangnya |
|---|:---:|---|
| Chat + jawaban terstruktur | 9,0 | Riwayat sesi & penyaring metadata kini ada; stop-generation dan tombol salin belum |
| Widget embed | 8,5 | Logo unggahan & footnote sumber ada; sesi masih hilang saat reload |
| Knowledge (KB N:M) | 9,0 | UI unggah berkas & pratinjau sumber sebelum sync kini ada; progres sync masih belum realtime |
| Landing publik | 8,5 | Panel demo publik terbangun tapi **belum diarahkan ke chatbot mana pun** |
| Conversations | 8,0 | Belum ada pencarian, filter tanggal, export transkrip |
| Komponen & konsistensi | 8,5 | **Turun dari 9,0** — dropdown listbox ternyata menutup-sendiri di build terpasang (2 Agu), 27 titik pakai terdampak. Sudah diperbaiki + guard test; audit komponen menyeluruh belum |
| Auth | 8,5 | Lupa-password, verifikasi email, 2FA (TOTP) ada; sisa: pemulihan akun tanpa akses email |
| Dashboard | 7,0 | Setengah bawah kosong; belum ada grafik tren |
| Aksesibilitas | 7,0 | Belum diaudit menyeluruh; kontras beberapa teks ditandai Lighthouse |
| Responsif mobile | 6,5 | Tabel lebar belum diaudit di layar sempit |

## B. Agentic Readiness — **8,6/10**

| Area | Skor | Kurangnya |
|---|:---:|---|
| Jawaban terstruktur (blok) | 9,2 | Blok tabel (maks 5 kolom) & chart multi-seri (maks 4 seri) kini ada, dan blok satu-seri lama tetap terbaca |
| Fleksibilitas model | 9,0 | 14 model · 8 provider · LLM & embedding self-hosted |
| Guardrails 5 lapis | 9,0 | Korpus eval penyalahgunaan + `eval:policy` kini ada — dan justru **membuktikan lapis moderasi terpisah belum perlu dibangun** |
| Pipeline RAG | 9,0 | Hybrid RRF + dedup + MMR + reranker lintas-encoder (mati bawaan) + kuantisasi biner + penyaring metadata terpasang |
| **Recall pada korpus besar** | **6,5** | **Celah baru, diukur 2 Agu.** Recall lapisan pertama runtuh ke **21,7%** di atas ±40 GB per chatbot, dan **membesarkan ambang tidak menolong** — peringkat kandidat tumbuh linear bersama korpus. Penyaring metadata dibangun sebagai jalan keluarnya; partisi korpus belum |
| Memory agent | 7,5 | Graph force-directed hidup; masih hanya terpicu sync, belum belajar dari percakapan |
| API utk agen/integrasi | 9,5 | API key per tenant + webhook keluar + `/api/v1` + **MCP server** semuanya jalan |

Catatan ukuran: satu chatbot = satu knowledge base. Pemasangan 700 GB milik
banyak divisi, jadi yang menentukan bukan total organisasi melainkan **±100–150
GB per chatbot** — dan titik runtuhnya (recall 21,7%) ada di bawah angka itu.

## C. Feature Readiness — **9,0/10**

| Fitur | Skor | Kurangnya |
|---|:---:|---|
| Konektor sumber data | 9,0 | Drive, Drive publik, OneDrive, SharePoint, S3, URL, unggah, Notion, Slack — sembilan-sembilanya punya jalur nyata; **tak ada lagi enum tanpa implementasi** |
| KB mandiri + assignment N:M | 9,2 | Sisa: pindah dokumen antar-KB |
| Sync Drive (Picker & full) + delta | 9,2 | Pratinjau + pilih folder sebelum unduh kini ada, dan pilihan folder yang tak cocok apa pun berhenti sebagai **galat**, bukan sync kosong yang senyap |
| Auth + gerbang verifikasi | 8,5 | 2FA (TOTP) & SSO per-tenant kini ada; sisa: pemulihan akun tanpa akses email |
| Dataroom | 9,0 | Tab Bukti Fitur kini menampilkan tur yang benar-benar dijalankan; harga Enterprise/On-prem belum diisi (keputusan bisnis) |
| Analitik per chatbot | 8,0 | Export CSV; rentang tanggal kustom |
| On-premise (docker + LLM lokal) | 8,7 | Panduan instalasi lengkap (README + `docs/ONPREM.md`, keduanya dijaga tes); **mekanisme lisensi masih belum ada sama sekali** |
| Team, RBAC & undangan | 8,5 | RBAC per-divisi kini ada (chatbot terikat divisi); sisa: peran kustom |
| Branding/white-label | 8,5 | Unggah logo per chatbot ada; preset tema belum |
| Observability | 8,0 | Peringatan kini **terbit** (`alert.raised` → webhook keluar); belum ada saluran langsung email/Slack dan belum ada halaman riwayat peringatan |
| Billing & pembayaran | 8,5 | QRIS 3 gateway + halaman bayar **terbangun** — menunggu kredensial merchant; invoice/kuitansi belum |

## D. Launching Readiness — **8,4/10**

| Area | Skor | Kurangnya |
|---|:---:|---|
| Infrastruktur & CI | 8,0 | Rate limit in-memory tak dibagi antar lambda (tercatat sadar) |
| Keandalan jalur CRUD | 8,5 | **Area baru.** Enam kebuntuan kolam koneksi (Vercel `max: 1`) ditemukan & ditutup 1–2 Agu, dengan pemindai permanen yang menolak polanya kembali masuk. Sebelum ini kelasnya tak pernah diperiksa sama sekali |
| Keamanan | 8,0 | Isolasi RLS diuji & insiden `db:push` dipagari permanen; pen-test eksternal belum |
| Legal & kepatuhan | 7,5 | Kontak masih gmail pribadi; template DPA belum |
| Backup & DR | 8,0 | `RUNBOOK.md` + `dr:verify` (nol selisih) + `dr:drill` satu perintah. **Latihan pemulihannya sendiri belum pernah dijalankan** — butuh kunci Neon sungguhan |
| Onboarding pengguna | 8,5 | Verifikasi email + pilih paket + email persetujuan; tur produk belum ada |
| Dokumentasi pengguna | 8,0 | **Naik dari 6,0** — halaman Panduan in-app (8 bagian) + README & ONPREM lengkap. Help center terpisah & video belum |
| Bukti yang bisa diperiksa | 8,5 | **Area baru.** Tur otomatis memotret 30 fitur tiap dijalankan, kegagalan ikut ditampilkan. Semuanya di **staging** |
| Monetisasi | 8,0 | QRIS Midtrans/Tripay/Xendit + gating plan terbangun — tinggal kredensial merchant |
| Sistem email | 8,0 | Terbangun penuh (verifikasi, reset, notifikasi, SMTP dari superadmin) — tinggal kredensial SMTP |

---

## Prioritas yang disarankan (dampak ÷ usaha)

1. **Isi kredensial SMTP & gateway pembayaran** — dua sistem terbesar sudah
   terbangun penuh dan hanya menunggu kredensial. Pekerjaan menit, bukan hari.
2. **Arahkan demo publik ke sebuah chatbot** — panelnya sudah ada di konsol
   superadmin tapi belum menunjuk chatbot mana pun, jadi landing page belum
   bisa dicoba pengunjung.
3. **Jalankan latihan pemulihan sungguhan** — `npm run dr:drill` sudah jadi
   satu perintah; yang kurang hanya `NEON_API_KEY`. Pemulihan yang belum pernah
   dicoba bukan pemulihan.
4. **Ukur ulang di pemasangan berkorpus nyata** — seluruh angka di dokumen ini
   dari staging berkorpus kecil. Yang paling perlu diukur ulang: latensi
   lapisan kedua dan titik runtuhnya recall lapisan pertama.
5. **Partisi korpus sebelum ada KB yang besar** — mengubah tabel besar jadi
   terpartisi jauh lebih mahal daripada memulainya kecil; pemicunya "akan
   besar", bukan "sudah besar".
6. **Persist sesi widget + tombol stop/salin di Chat** — dua ganjalan yang
   paling terasa saat produk dipakai sehari-hari.

*Metodologi: tiap skor dirujuk ke perilaku yang DISAKSIKAN di staging (tur
peramban) atau ke kode bertes; tak ada skor untuk fitur yang belum terlihat
bekerja. Assessment 2026-07-30 (8,7) digantikan dokumen ini.*
