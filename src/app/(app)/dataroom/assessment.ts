/**
 * DATAROOM · ASSESSMENT — data penilaian 4 dimensi (2026-07-28).
 *
 * Sumber kebenaran visual utk tab Assessment; padanan naratifnya di
 * docs/ASSESSMENT.md. Digrounding screenshot produksi via agent-browser
 * (docs/assessment/) — tak ada skor utk fitur yang belum disaksikan bekerja.
 */

export interface AssessArea { name: string; score: number; gap: string }
export interface AssessDimension {
  id: string; label: string; score: number; desc: string; areas: AssessArea[];
}

export const ASSESSED_AT = '2026-07-28';
export const PREV = { at: '2026-07-23', score: 5.3 };
export const OVERALL = 7.7;

export const DIMENSIONS: AssessDimension[] = [
  {
    id: 'uiux', label: 'UI/UX Readiness', score: 8.0,
    desc: 'Seluruh permukaan dinilai dari screenshot produksi — bukan dari kode.',
    areas: [
      { name: 'Chat + jawaban terstruktur', score: 9.0, gap: 'Belum ada stop-generation, tombol copy, riwayat sesi di halaman Chat' },
      { name: 'Widget embed', score: 8.5, gap: 'Sesi hilang saat reload halaman (belum localStorage)' },
      { name: 'Knowledge (KB N:M)', score: 8.5, gap: 'Progres sync tak realtime; belum ada UI unggah berkas' },
      { name: 'Landing publik', score: 8.5, gap: 'Belum ada demo interaktif/video produk' },
      { name: 'Conversations', score: 8.0, gap: 'Belum ada pencarian, filter tanggal, export transkrip' },
      { name: 'Komponen & konsistensi', score: 8.0, gap: 'Dropdown baru dipoles; sisanya konsisten token' },
      { name: 'Auth', score: 7.5, gap: 'BELUM ADA lupa-password' },
      { name: 'Dashboard', score: 7.0, gap: 'Setengah bawah kosong; belum ada grafik tren' },
      { name: 'Aksesibilitas', score: 7.0, gap: 'Belum diaudit menyeluruh; kontras beberapa teks ditandai Lighthouse' },
      { name: 'Responsif mobile', score: 6.5, gap: 'Tabel lebar belum diaudit di layar sempit' },
    ],
  },
  {
    id: 'agentic', label: 'Agentic Readiness', score: 7.7,
    desc: 'Kualitas pipeline AI dan kesiapannya diintegrasikan agen lain.',
    areas: [
      { name: 'Jawaban terstruktur (blok)', score: 9.0, gap: 'Chart baru bar/line satu seri; blok tabel belum ada' },
      { name: 'Fleksibilitas model', score: 9.0, gap: '14 model · 8 provider · self-hosted — tak ada gap berarti' },
      { name: 'Guardrails 5 lapis', score: 8.5, gap: 'Belum ada korpus eval injeksi otomatis & lapis moderasi' },
      { name: 'Pipeline RAG', score: 8.0, gap: 'Belum ada reranker & hybrid search; chunking fixed 800 char' },
      { name: 'Memory agent', score: 7.0, gap: 'Hanya terpicu sync; belum belajar dari percakapan' },
      { name: 'API utk agen/integrasi', score: 6.5, gap: 'BELUM ADA API key per tenant, webhook, MCP server' },
    ],
  },
  {
    id: 'feature', label: 'Feature Readiness', score: 8.0,
    desc: 'Kelengkapan tiap fitur dibanding janji produknya.',
    areas: [
      { name: 'KB mandiri + assignment N:M', score: 9.0, gap: 'Konektor upload & url masih enum tanpa implementasi' },
      { name: 'Auth + gerbang verifikasi', score: 8.5, gap: 'Lupa-password; 2FA' },
      { name: 'Sync Drive (Picker & full) + delta', score: 8.5, gap: 'Full-scan SaaS menunggu verifikasi CASA' },
      { name: 'Dataroom', score: 8.5, gap: 'Harga Enterprise/On-prem belum diisi (keputusan bisnis)' },
      { name: 'Analitik per chatbot', score: 8.0, gap: 'Export CSV; rentang tanggal kustom' },
      { name: 'On-premise (docker + LLM lokal)', score: 8.0, gap: 'Panduan instalasi pelanggan & lisensi belum dibakukan' },
      { name: 'Team & undangan', score: 8.0, gap: 'Link undangan manual — belum via email' },
      { name: 'Branding/white-label', score: 8.0, gap: 'Logo hanya via URL, belum unggah dari UI' },
      { name: 'Observability', score: 7.5, gap: 'Papan baca saja — alerting belum ada' },
      { name: 'Billing', score: 6.0, gap: 'MANUAL sepenuhnya — tanpa gateway, invoice, kuitansi' },
    ],
  },
  {
    id: 'launch', label: 'Launching Readiness', score: 6.9,
    desc: 'Kesiapan meluncur & menskalakan — hal di sekitar produk.',
    areas: [
      { name: 'Infrastruktur & CI', score: 8.0, gap: 'Rate limit in-memory tak dibagi antar lambda (tercatat sadar)' },
      { name: 'Keamanan', score: 8.0, gap: 'Pen-test eksternal belum; insiden db:push sudah dipagari permanen' },
      { name: 'Legal & kepatuhan', score: 7.5, gap: 'Kontak masih gmail pribadi; template DPA belum' },
      { name: 'Backup & DR', score: 7.0, gap: 'PITR bawaan Neon; runbook pemulihan belum ditulis' },
      { name: 'Onboarding pengguna', score: 6.5, gap: 'Approval manual tanpa notifikasi — pendaftar menggantung' },
      { name: 'Dokumentasi pengguna', score: 6.0, gap: 'Help center/user guide belum ada' },
      { name: 'Monetisasi', score: 5.5, gap: 'Tanpa payment gateway — aktivasi plan manual' },
      { name: 'Sistem email', score: 4.0, gap: 'TIDAK ADA SAMA SEKALI — approval, undangan, reset password semua bisu' },
    ],
  },
];

export const PRIORITIES: Array<{ t: string; d: string }> = [
  { t: 'Sistem email (Resend/SES)', d: 'Notifikasi approval, undangan, reset password — membuka simpul onboarding & auth sekaligus (≈ Launching +1,0)' },
  { t: 'Payment gateway (Midtrans/Xendit)', d: 'Upgrade plan mandiri utk pasar Indonesia' },
  { t: 'API key per tenant + webhook', d: 'Membuka integrasi programatik & agen eksternal' },
  { t: 'UI unggah berkas ke KB', d: 'Enum `upload` sudah ada — tinggal jalurnya' },
  { t: 'Persist sesi widget + riwayat sesi Chat', d: 'localStorage utk widget; daftar sesi di halaman Chat' },
  { t: 'Reranker / hybrid search', d: 'Bila kualitas retrieval mulai jadi keluhan' },
];
