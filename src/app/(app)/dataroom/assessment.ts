/**
 * DATAROOM · ASSESSMENT — data penilaian 4 dimensi (2026-07-28).
 *
 * Sumber kebenaran visual utk tab Assessment; padanan naratifnya di
 * docs/ASSESSMENT.md. Digrounding screenshot dari lingkungan STAGING
 * (rag.sainskerta.net) via agent-browser — tak ada skor utk fitur yang belum
 * disaksikan bekerja.
 *
 * STAGING, BUKAN PEMASANGAN PELANGGAN. Korpusnya kecil, jadi apa pun yang
 * bergantung pada ukuran data — latensi, rencana kueri, perilaku pada korpus
 * ratusan GB — TIDAK terwakili di sini. Menyebutnya "produksi" (seperti versi
 * sebelumnya) membuat pembaca dataroom menyimpulkan lebih banyak daripada
 * yang benar-benar dibuktikan.
 */

export interface AssessArea { name: string; score: number; gap: string }
export interface AssessDimension {
  id: string; label: string; score: number; desc: string; areas: AssessArea[];
}

export const ASSESSED_AT = '2026-07-30';
export const PREV = { at: '2026-07-29', score: 8.4 };
export const OVERALL = 8.7;

export const DIMENSIONS: AssessDimension[] = [
  {
    id: 'uiux', label: 'UI/UX Readiness', score: 8.5,
    desc: 'Seluruh permukaan dinilai dari screenshot lingkungan staging — bukan dari kode.',
    areas: [
      { name: 'Chat + jawaban terstruktur', score: 9.0, gap: 'Belum ada stop-generation, tombol copy, riwayat sesi di halaman Chat' },
      { name: 'Widget embed', score: 8.5, gap: 'Logo unggahan & footnote sumber sudah ada; sesi masih hilang saat reload' },
      { name: 'Knowledge (KB N:M)', score: 8.5, gap: 'Progres sync tak realtime; belum ada UI unggah berkas' },
      { name: 'Landing publik', score: 8.5, gap: 'Belum ada demo interaktif/video produk' },
      { name: 'Conversations', score: 8.0, gap: 'Belum ada pencarian, filter tanggal, export transkrip' },
      { name: 'Komponen & konsistensi', score: 9.0, gap: 'Dropdown digambar sendiri (listbox WAI-ARIA) — popup akhirnya ikut design system di 27 titik pakai' },
      { name: 'Auth', score: 8.5, gap: 'Lupa-password & verifikasi email kini ada; 2FA belum' },
      { name: 'Dashboard', score: 7.0, gap: 'Setengah bawah kosong; belum ada grafik tren' },
      { name: 'Aksesibilitas', score: 7.0, gap: 'Belum diaudit menyeluruh; kontras beberapa teks ditandai Lighthouse' },
      { name: 'Responsif mobile', score: 6.5, gap: 'Tabel lebar belum diaudit di layar sempit' },
    ],
  },
  {
    id: 'agentic', label: 'Agentic Readiness', score: 8.7,
    desc: 'Kualitas pipeline AI dan kesiapannya diintegrasikan agen lain.',
    areas: [
      { name: 'Jawaban terstruktur (blok)', score: 9.0, gap: 'Chart baru bar/line satu seri; blok tabel belum ada' },
      { name: 'Fleksibilitas model', score: 9.0, gap: '14 model · 8 provider · self-hosted — tak ada gap berarti' },
      { name: 'Guardrails 5 lapis', score: 8.5, gap: 'Belum ada korpus eval injeksi otomatis & lapis moderasi' },
      { name: 'Pipeline RAG', score: 9.0, gap: 'Hybrid search (leksikal + vektor, RRF) & penyingkiran potongan kembar sudah jalan; cross-encoder neural belum' },
      { name: 'Memory agent', score: 7.5, gap: 'Graph kini force-directed hidup; masih hanya terpicu sync, belum belajar dari percakapan' },
      { name: 'API utk agen/integrasi', score: 9.0, gap: 'API key per tenant + webhook keluar + /api/v1 (me, chatbots, KB, documents, search) sudah jalan; MCP server belum' },
    ],
  },
  {
    id: 'feature', label: 'Feature Readiness', score: 8.9,
    desc: 'Kelengkapan tiap fitur dibanding janji produknya.',
    areas: [
      { name: 'KB mandiri + assignment N:M', score: 9.0, gap: 'Folder Drive publik tanpa OAuth & SharePoint situs sudah jalan; konektor upload & url masih enum tanpa implementasi' },
      { name: 'Auth + gerbang verifikasi', score: 8.5, gap: 'Lupa-password; 2FA' },
      { name: 'Sync Drive (Picker & full) + delta', score: 9.0, gap: 'Jalur folder publik menembus kebuntuan CASA; izin akun bisa ditambah tanpa putus-sambung' },
      { name: 'Dataroom', score: 8.5, gap: 'Harga Enterprise/On-prem belum diisi (keputusan bisnis)' },
      { name: 'Analitik per chatbot', score: 8.0, gap: 'Export CSV; rentang tanggal kustom' },
      { name: 'On-premise (docker + LLM lokal)', score: 8.0, gap: 'Panduan instalasi pelanggan & lisensi belum dibakukan' },
      { name: 'Team, RBAC & undangan', score: 8.5, gap: 'Ubah peran, keluarkan anggota, undangan via email; RBAC masih 2 tingkat (belum per-divisi)' },
      { name: 'Branding/white-label', score: 8.5, gap: 'Unggah logo per chatbot sudah ada; preset tema belum' },
      { name: 'Observability', score: 7.5, gap: 'Papan baca saja — alerting belum ada' },
      { name: 'Billing & pembayaran', score: 8.5, gap: 'QRIS 3 gateway + halaman bayar sendiri TERBANGUN — menunggu kredensial merchant; invoice/kuitansi belum' },
    ],
  },
  {
    id: 'launch', label: 'Launching Readiness', score: 8.0,
    desc: 'Kesiapan meluncur & menskalakan — hal di sekitar produk.',
    areas: [
      { name: 'Infrastruktur & CI', score: 8.0, gap: 'Rate limit in-memory tak dibagi antar lambda (tercatat sadar)' },
      { name: 'Keamanan', score: 8.0, gap: 'Pen-test eksternal belum; insiden db:push sudah dipagari permanen' },
      { name: 'Legal & kepatuhan', score: 7.5, gap: 'Kontak masih gmail pribadi; template DPA belum' },
      { name: 'Backup & DR', score: 7.0, gap: 'PITR bawaan Neon; runbook pemulihan belum ditulis' },
      { name: 'Onboarding pengguna', score: 8.5, gap: 'Verifikasi email + layar pilih paket + email kabar disetujui; tur produk belum ada' },
      { name: 'Dokumentasi pengguna', score: 6.0, gap: 'Help center/user guide belum ada' },
      { name: 'Monetisasi', score: 8.0, gap: 'QRIS Midtrans/Tripay/Xendit + gating plan TERBANGUN — tinggal diisi kredensial merchant' },
      { name: 'Sistem email', score: 8.0, gap: 'TERBANGUN penuh (verifikasi, reset, notifikasi, SMTP dari superadmin) — tinggal diisi kredensial Gmail App Password' },
    ],
  },
];

export const PRIORITIES: Array<{ t: string; d: string }> = [
  { t: 'Isi kredensial SMTP & gateway pembayaran', d: 'Dua sistem terbesar sudah terbangun penuh dan hanya menunggu kredensial — ini pekerjaan menit, bukan hari (lihat tab Update & Backlog)' },
  { t: 'API key per tenant + webhook', d: 'Lubang integrasi terakhir: akses programatik masih memakai cookie sesi' },
  { t: 'UI unggah berkas ke KB', d: 'Jenis sumber upload sudah ada di skema, tinggal jalurnya' },
  { t: 'Hybrid search + reranker', d: 'Peningkatan akurasi terbesar yang tersisa' },
  { t: 'Persist sesi widget + tombol stop/salin di Chat', d: 'Dua ganjalan yang paling terasa saat produk dipakai sehari-hari' },
  { t: 'Alerting di Observability', d: 'Kegagalan sync & lonjakan galat belum memberi tahu siapa pun' },
];
