/**
 * DATAROOM · ASSESSMENT — data penilaian 4 dimensi.
 *
 * Sumber kebenaran visual utk tab Assessment; padanan naratifnya di
 * docs/ASSESSMENT.md. Digrounding tur peramban otomatis (`npm run tur`) yang
 * hasilnya tampil di tab Bukti Fitur — tak ada skor utk fitur yang belum
 * disaksikan bekerja.
 *
 * STAGING, BUKAN PEMASANGAN PELANGGAN. Seluruh bukti berasal dari
 * nalar.sainskerta.net. Korpusnya kecil, jadi apa pun yang bergantung pada UKURAN
 * DATA — latensi, rencana kueri, perilaku pada korpus ratusan GB — TIDAK
 * terwakili di sini. Menyebutnya "produksi" (seperti versi sebelum 3 Agu)
 * membuat pembaca menyimpulkan lebih banyak daripada yang dibuktikan.
 *
 * CARA MEMBACA PERUBAHAN SKORNYA. Angka naik hanya bila celah yang dulu
 * tertulis benar-benar tertutup DAN terlihat bekerja. Angka juga bisa TIDAK
 * naik meski banyak dikerjakan: pekerjaan 1–3 Agu justru MENEMUKAN batas yang
 * sebelumnya tak diketahui (atap recall lapisan pertama, bug dropdown di build
 * terpasang). Batas yang baru diketahui bukan kemunduran — tapi ia juga bukan
 * kemajuan, dan menaikkan skor seolah-olah ia kemajuan adalah cara paling
 * halus membuat halaman ini berhenti bisa dipercaya.
 */

export interface AssessArea { name: string; score: number; gap: string }
export interface AssessDimension {
  id: string; label: string; score: number; desc: string; areas: AssessArea[];
}

export const ASSESSED_AT = '2026-08-03';
export const PREV = { at: '2026-07-30', score: 8.7 };
export const OVERALL = 8.8;

export const DIMENSIONS: AssessDimension[] = [
  {
    id: 'uiux', label: 'UI/UX Readiness', score: 8.5,
    desc: 'Seluruh permukaan dinilai dari tur peramban di staging — bukan dari kode. 30 fitur, ~120 langkah, tiap langkah terpotret.',
    areas: [
      { name: 'Chat + jawaban terstruktur', score: 9.0, gap: 'Riwayat sesi & penyaring metadata kini ada; stop-generation dan tombol salin belum' },
      { name: 'Widget embed', score: 8.5, gap: 'Logo unggahan & footnote sumber sudah ada; sesi masih hilang saat reload' },
      { name: 'Knowledge (KB N:M)', score: 9.0, gap: 'UI unggah berkas & pratinjau sumber sebelum sync kini ada; progres sync masih belum realtime' },
      { name: 'Landing publik', score: 8.5, gap: 'Panel demo publik terbangun tapi belum diarahkan ke chatbot mana pun — pengunjung belum bisa mencoba' },
      { name: 'Conversations', score: 8.0, gap: 'Belum ada pencarian, filter tanggal, export transkrip' },
      { name: 'Komponen & konsistensi', score: 8.5, gap: 'TURUN dari 9.0: dropdown listbox ternyata menutup-sendiri di build TERPASANG (2 Agu) — 27 titik pakai terdampak. Sudah diperbaiki + guard test, tapi audit komponen menyeluruh belum pernah dilakukan' },
      { name: 'Auth', score: 8.5, gap: 'Lupa-password, verifikasi email, dan 2FA (TOTP) sudah ada; sisa: pemulihan akun tanpa akses email' },
      { name: 'Dashboard', score: 7.0, gap: 'Setengah bawah kosong; belum ada grafik tren' },
      { name: 'Aksesibilitas', score: 7.0, gap: 'Belum diaudit menyeluruh; kontras beberapa teks ditandai Lighthouse' },
      { name: 'Responsif mobile', score: 6.5, gap: 'Tabel lebar belum diaudit di layar sempit' },
    ],
  },
  {
    id: 'agentic', label: 'Agentic Readiness', score: 8.6,
    desc: 'Kualitas pipeline AI dan kesiapannya diintegrasikan agen lain. Skornya TURUN 0,1 meski lima area naik — satu atap recall yang sebelumnya tak diketahui kini terukur.',
    areas: [
      { name: 'Jawaban terstruktur (blok)', score: 9.2, gap: 'Blok tabel (maks 5 kolom) & chart multi-seri (maks 4 seri) kini ada, dan blok satu-seri lama tetap terbaca — tak ada gap berarti' },
      { name: 'Fleksibilitas model', score: 9.0, gap: '14 model · 8 provider · LLM & embedding self-hosted — tak ada gap berarti' },
      { name: 'Guardrails 5 lapis', score: 9.0, gap: 'Korpus eval penyalahgunaan + `eval:policy` kini ada, dan justru MEMBUKTIKAN lapis moderasi terpisah belum perlu dibangun' },
      { name: 'Pipeline RAG', score: 9.0, gap: 'Hybrid RRF + dedup + MMR + reranker lintas-encoder (mati bawaan) + kuantisasi biner + penyaring metadata semuanya terpasang' },
      {
        name: 'Recall pada korpus besar', score: 6.5,
        gap: 'CELAH BARU, DIUKUR 2 Agu: recall lapisan pertama runtuh ke 21,7% di atas ±40 GB per chatbot, dan MEMBESARKAN AMBANG TIDAK MENOLONG (peringkat tumbuh linear). Penyaring metadata dibangun sebagai jalan keluarnya; partisi korpus belum',
      },
      { name: 'Memory agent', score: 7.5, gap: 'Graph force-directed hidup; masih hanya terpicu sync, belum belajar dari percakapan' },
      { name: 'API utk agen/integrasi', score: 9.5, gap: 'API key per tenant + webhook keluar + /api/v1 + MCP server sudah jalan — tak ada gap berarti' },
    ],
  },
  {
    id: 'feature', label: 'Feature Readiness', score: 9.0,
    desc: 'Kelengkapan tiap fitur dibanding janji produknya.',
    areas: [
      { name: 'Konektor sumber data', score: 9.0, gap: 'Drive, Drive publik, OneDrive, SharePoint, S3, URL, unggah, Notion, Slack — sembilan-sembilanya punya jalur nyata; tak ada lagi enum tanpa implementasi' },
      { name: 'KB mandiri + assignment N:M', score: 9.2, gap: 'Dropdown KB di halaman Knowledge & Chat sudah ada; sisa: pindah dokumen antar-KB' },
      { name: 'Sync Drive (Picker & full) + delta', score: 9.2, gap: 'Pratinjau + pilih folder sebelum unduh kini ada, dan pilihan folder yang tak cocok apa pun berhenti sebagai galat, bukan sebagai sync kosong yang senyap' },
      { name: 'Auth + gerbang verifikasi', score: 8.5, gap: '2FA (TOTP) & SSO per-tenant kini ada; sisa: pemulihan akun tanpa akses email' },
      { name: 'Dataroom', score: 9.0, gap: 'Tab Bukti Fitur kini menampilkan tur yang benar-benar dijalankan; harga Enterprise/On-prem belum diisi (keputusan bisnis)' },
      { name: 'Analitik per chatbot', score: 8.0, gap: 'Export CSV; rentang tanggal kustom' },
      { name: 'On-premise (docker + LLM lokal)', score: 8.7, gap: 'Panduan instalasi lengkap (README + docs/ONPREM.md, keduanya dijaga tes); MEKANISME LISENSI masih belum ada sama sekali' },
      { name: 'Team, RBAC & undangan', score: 8.5, gap: 'RBAC per-divisi kini ada (chatbot terikat divisi); sisa: peran kustom' },
      { name: 'Branding/white-label', score: 8.5, gap: 'Unggah logo per chatbot sudah ada; preset tema belum' },
      { name: 'Observability', score: 8.0, gap: 'Peringatan kini TERBIT (`alert.raised` → webhook keluar); belum ada saluran langsung email/Slack dan belum ada halaman riwayat peringatan' },
      { name: 'Billing & pembayaran', score: 8.5, gap: 'QRIS 3 gateway + halaman bayar TERBANGUN — menunggu kredensial merchant; invoice/kuitansi belum' },
    ],
  },
  {
    id: 'launch', label: 'Launching Readiness', score: 8.4,
    desc: 'Kesiapan meluncur & menskalakan — hal di sekitar produk.',
    areas: [
      { name: 'Infrastruktur & CI', score: 8.0, gap: 'Rate limit in-memory tak dibagi antar lambda (tercatat sadar)' },
      { name: 'Keandalan jalur CRUD', score: 8.5, gap: 'AREA BARU: enam kebuntuan kolam koneksi (Vercel `max: 1`) ditemukan & ditutup 1–2 Agu, dengan pemindai permanen yang menolak polanya kembali masuk. Sebelum ini, kelasnya tak pernah diperiksa sama sekali' },
      { name: 'Keamanan', score: 8.0, gap: 'Isolasi RLS diuji & insiden db:push dipagari permanen; pen-test eksternal belum' },
      { name: 'Legal & kepatuhan', score: 7.5, gap: 'Kontak masih gmail pribadi; template DPA belum' },
      { name: 'Backup & DR', score: 8.0, gap: 'RUNBOOK.md + `dr:verify` (nol selisih) + `dr:drill` satu perintah. LATIHAN PEMULIHANNYA SENDIRI BELUM PERNAH DIJALANKAN — butuh kunci Neon sungguhan' },
      { name: 'Onboarding pengguna', score: 8.5, gap: 'Verifikasi email + pilih paket + email persetujuan; tur produk belum ada' },
      { name: 'Dokumentasi pengguna', score: 8.0, gap: 'NAIK dari 6.0: halaman Panduan in-app (8 bagian) + README & ONPREM lengkap. Belum ada help center terpisah dan video' },
      { name: 'Bukti yang bisa diperiksa', score: 8.5, gap: 'AREA BARU: tur otomatis memotret 30 fitur tiap dijalankan, kegagalan ikut ditampilkan. Semuanya di STAGING — perilaku di bawah beban sungguhan belum terwakili' },
      { name: 'Monetisasi', score: 8.0, gap: 'QRIS Midtrans/Tripay/Xendit + gating plan TERBANGUN — tinggal kredensial merchant' },
      { name: 'Sistem email', score: 8.0, gap: 'TERBANGUN penuh (verifikasi, reset, notifikasi, SMTP dari superadmin) — tinggal kredensial SMTP' },
    ],
  },
];

export const PRIORITIES: Array<{ t: string; d: string }> = [
  { t: 'Isi kredensial SMTP & gateway pembayaran', d: 'Dua sistem terbesar sudah terbangun penuh dan hanya menunggu kredensial — pekerjaan menit, bukan hari' },
  { t: 'Arahkan demo publik ke sebuah chatbot', d: 'Panelnya sudah ada di konsol superadmin tapi belum menunjuk chatbot mana pun, jadi landing page belum bisa dicoba pengunjung' },
  { t: 'Jalankan latihan pemulihan sungguhan', d: '`npm run dr:drill` sudah jadi satu perintah; yang kurang hanya NEON_API_KEY. Pemulihan yang belum pernah dicoba bukan pemulihan' },
  { t: 'Ukur ulang di pemasangan berkorpus nyata', d: 'Seluruh angka di halaman ini dari staging berkorpus kecil. Yang paling perlu diukur ulang: latensi lapisan kedua dan titik runtuhnya recall lapisan pertama' },
  { t: 'Partisi korpus sebelum ada KB yang besar', d: 'Mengubah tabel besar jadi terpartisi jauh lebih mahal daripada memulainya kecil — pemicunya "akan besar", bukan "sudah besar"' },
  { t: 'Persist sesi widget + tombol stop/salin di Chat', d: 'Dua ganjalan yang paling terasa saat produk dipakai sehari-hari' },
];
