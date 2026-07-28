/**
 * DATAROOM · UPDATE & BACKLOG — catatan perkembangan dan sisa pekerjaan.
 *
 * Dipisah tegas jadi dua: yang HANYA BISA DIKERJAKAN MANUSIA (butuh
 * kredensial, keputusan bisnis, atau pihak ketiga) dan yang BISA
 * DIKERJAKAN AGEN. Pemisahan ini yang membuat daftar sisa pekerjaan
 * berguna — bukan sekadar panjang.
 */

export interface ShipItem {
  title: string;
  detail: string;
  /** rujukan keputusan arsitektur bila ada */
  decision?: string;
}

export interface TodoItem {
  title: string;
  why: string;
  /** perkiraan bobot: S (jam), M (setengah hari), L (berhari-hari) */
  size: 'S' | 'M' | 'L';
  /** urutan dampak: 1 tertinggi */
  rank: number;
  blocked?: string;
}

export const SHIPPED_AT = '2026-07-29';

/* ── yang sudah jadi ─────────────────────────────────────────────── */
export const SHIPPED: Array<{ group: string; items: ShipItem[] }> = [
  {
    group: 'Arsitektur & data',
    items: [
      { decision: 'D11', title: 'Knowledge base jadi entitas mandiri (1 KB ↔ N chatbot)',
        detail: 'Sumber & dokumen menempel ke KB, bukan chatbot. Satu folder Drive di-ingest sekali, dipakai berapa pun chatbot lewat assignment. Migrasi membackfill data lama tanpa kehilangan apa pun.' },
      { title: 'Konteks divisi per chatbot',
        detail: 'Tiap chatbot punya persona/kepemilikan divisi yang disuntikkan ke system prompt-nya sendiri.' },
      { title: 'Isolasi KB antar-tenant dibuktikan tes',
        detail: 'Smoke test terhadap DB nyata: KB tenant A tak terlihat & tak bisa di-assign dari tenant B. Jaminan jadi tes yang berjalan, bukan klaim.' },
    ],
  },
  {
    group: 'Monetisasi & akun',
    items: [
      { decision: 'D12', title: 'Pembayaran QRIS 3 gateway, konfigurasi di database',
        detail: 'Midtrans / Tripay / Xendit — kredensial terenkripsi di DB (tanpa ENV), hanya satu aktif. Halaman bayar milik sendiri: QR digambar di situs kita, pelanggan tak pernah dialihkan ke gateway. Webhook ter-verifikasi signature; aktivasi plan idempotent & memperpanjang sisa langganan.' },
      { decision: 'D12', title: 'Mode deploy dipilih dari database',
        detail: 'SaaS = bayar & kuota aktif. On-premise = pembayaran mati, semua kuota tanpa batas. Diubah superadmin dari UI, bukan env.' },
      { decision: 'D13', title: 'Sistem email: SMTP dari superadmin',
        detail: 'Verifikasi email pendaftar, kabar akun disetujui, undangan tim, dan reset password. App password terenkripsi di DB + tombol kirim uji. Tanpa SMTP semuanya berjalan seperti sebelumnya (on-prem aman).' },
      { decision: 'D14', title: 'Free fungsional, fitur premium tergembok',
        detail: 'Free tetap bisa chat + KB + 1 chatbot. Analitik/Memory/Branding/Team/Usage tampil bergembok dengan halaman yang menjelaskan manfaatnya — bukan penolakan kosong. Onboarding pilih paket muncul sekali, bisa dilewati.' },
      { title: 'RBAC tenant + kelola anggota',
        detail: 'Ubah peran admin⇄member, keluarkan anggota, pengaman admin terakhir. 16 endpoint mutasi kini menolak role member.' },
    ],
  },
  {
    group: 'Pengalaman menjawab',
    items: [
      { title: 'Jawaban terstruktur (blok), bukan tembok teks',
        detail: 'Model membalas JSON blok: paragraf pendek, daftar, kartu fakta, chart. Dirender komponen demi komponen dengan sitasi sebagai chip. Model bandel tetap tertangani fallback.' },
      { title: 'Nol Markdown, dijamin di server',
        detail: 'Penyaring dua tingkat (streaming + full-pass) sehingga frontend memegang penuh styling.' },
      { title: 'Akurasi dokumen berversi',
        detail: '"Isi RAB 2020" tak lagi tercampur 2021/2022: judul ikut di-embed, boost leksikal saat query menunjuk tahun/kode, plus aturan prompt yang melarang mencampur angka lintas versi.' },
      { title: 'Sesi chat menyambung + footnote sumber',
        detail: 'Satu sesi = satu riwayat (dulu tiap pesan jadi percakapan baru). Widget menampilkan dokumen rujukan dengan judul & skor.' },
      { title: 'Knowledge graph hidup ala Obsidian',
        detail: 'Force-directed sungguhan: yang ter-link menempel, yang tidak menjauh, menyeret satu node menyeret tetangganya, dan seluruh graph mengambang pelan — tak pernah membeku.' },
    ],
  },
  {
    group: 'Operasi & pemantauan',
    items: [
      { title: 'Dashboard Usage per-chatbot & per-tenant',
        detail: 'Kuota vs pemakaian, tren harian, rincian per chatbot + estimasi biaya LLM. Superadmin melihat seluruh tenant.' },
      { title: 'Conversations lintas-tenant untuk superadmin',
        detail: 'Pilih tenant → chatbot divisi → sesi → transkrip. Tenant biasa tetap terkunci RLS-nya.' },
      { title: 'Dataroom: dua pitch deck + assessment + halaman ini',
        detail: 'Slide fullscreen, ekspor PDF & PPTX dari satu sumber data.' },
      { title: 'Branding per chatbot + unggah logo',
        detail: 'Logo disimpan di DB (identik SaaS & on-prem), dilayani ber-cache ke widget; SVG ditolak demi keamanan.' },
    ],
  },
  {
    group: 'Insiden & perbaikan yang menyelamatkan',
    items: [
      { title: 'RLS produksi sempat MATI — tertangkap smoke test',
        detail: '`drizzle-kit push` ternyata ikut mengelola RLS: isolasi tenant dinonaktifkan lalu policy terhapus. Dipulihkan lewat migrasi, dicegah permanen (.enableRLS() di 16 tabel + aturan keras: produksi hanya lewat migrations).' },
      { title: 'Chunker berputar tanpa henti',
        detail: 'Semua teks di atas 800 karakter membuat proses ingest memakan 4GB memori lalu mati diam-diam — itulah sebab dokumen NIB tak pernah masuk. Satu baris `break` + tes regresi.' },
      { title: 'Job latar mati di serverless',
        detail: 'Vercel membekukan lambda begitu respons terkirim, sync selalu macet. Diperbaiki dengan menahan lambda sampai antrean tuntas.' },
      { title: 'Angka pemakaian semua tenant diam-diam NOL',
        detail: 'Billing mengklaim "melewati RLS secara sadar" tanpa mekanisme apa pun. Diperbaiki + policy platform admin.' },
      { title: '76 tenant sampah tersapu',
        detail: 'Sisa smoke test memenuhi daftar superadmin. Dibersihkan, dan smoke kini merapikan tenant ujinya sendiri.' },
    ],
  },
];

/* ── hanya bisa dikerjakan manusia ───────────────────────────────── */
export const HUMAN_TOUCH: TodoItem[] = [
  { rank: 1, size: 'S', title: 'Isi kredensial SMTP (Gmail + App Password)',
    why: 'Membuka verifikasi email, reset password, undangan tim, dan kabar akun disetujui. Kodenya sudah menunggu — tinggal Settings → panel Email → kirim uji.',
    blocked: 'Butuh akun email & App Password milikmu' },
  { rank: 2, size: 'S', title: 'Isi kredensial gateway pembayaran + daftarkan callback',
    why: 'Menyalakan pembelian plan. Isi salah satu (sandbox dulu) di Billing → Aktifkan → salin URL callback ke dashboard provider.',
    blocked: 'Butuh akun merchant Midtrans/Tripay/Xendit' },
  { rank: 3, size: 'M', title: 'Verifikasi OAuth Google — ajukan ulang',
    why: 'Beranda sudah memenuhi semua syarat (judul, tujuan, ringkasan Inggris, privasi). Yang tersisa: minta pengindeksan di Search Console lalu submit ulang, dan balas tiket Trust & Safety.',
    blocked: 'Hanya pemilik project Google Cloud yang bisa' },
  { rank: 4, size: 'S', title: 'Tetapkan harga Enterprise & lisensi on-premise',
    why: 'Slide bisnis dan halaman paket sudah siap menampilkannya; angkanya keputusanmu.',
    blocked: 'Keputusan bisnis' },
  { rank: 5, size: 'S', title: 'Siapkan kotak surat kontak resmi',
    why: 'Kebijakan privasi menyebutnya sebagai kanal permintaan penghapusan data; sekarang masih memakai Gmail pribadi.',
    blocked: 'Butuh akses DNS/mail domain' },
  { rank: 6, size: 'L', title: 'Pen-test eksternal & template DPA',
    why: 'Diminta pelanggan enterprise sebelum tanda tangan. Fondasinya sudah kuat (RLS, enkripsi, audit), tinggal pembuktian pihak ketiga.',
    blocked: 'Butuh vendor & penasihat hukum' },
  { rank: 7, size: 'M', title: 'Keputusan: Picker selamanya atau kejar CASA?',
    why: 'Mode Picker sudah jalan tanpa verifikasi berat. Full-scan Drive di SaaS menuntut audit CASA tahunan berbayar — layak hanya bila pelanggan menuntutnya.',
    blocked: 'Keputusan produk + biaya' },
];

/* ── bisa dikerjakan agen ────────────────────────────────────────── */
export const AGENT_BACKLOG: TodoItem[] = [
  { rank: 1, size: 'M', title: 'API key per tenant + webhook keluar',
    why: 'Satu-satunya lubang besar yang tersisa untuk integrasi: akses programatik masih memakai cookie sesi. Membuka pemakaian oleh agen/sistem lain milik pelanggan.' },
  { rank: 2, size: 'S', title: 'UI unggah berkas langsung ke KB',
    why: 'Jenis sumber `upload` sudah ada di skema tapi belum ada jalurnya — pelanggan tanpa Google Drive kini terpaksa lewat API.' },
  { rank: 3, size: 'S', title: 'Sesi widget bertahan saat halaman dimuat ulang',
    why: 'Percakapan pengunjung terputus jadi sesi baru setiap refresh; cukup disimpan di localStorage.' },
  { rank: 4, size: 'S', title: 'Tombol hentikan jawaban & salin di halaman Chat',
    why: 'Dua hal yang paling terasa hilang saat memakai chat sehari-hari.' },
  { rank: 5, size: 'M', title: 'Pencarian, filter tanggal, dan ekspor di Conversations',
    why: 'Riwayat sudah lengkap tapi belum bisa ditelusuri — makin banyak percakapan makin terasa.' },
  { rank: 6, size: 'M', title: 'Hybrid search + reranker',
    why: 'Menggabungkan pencarian kata kunci dengan vektor, lalu menyusun ulang hasilnya. Peningkatan akurasi terbesar yang tersisa setelah perbaikan dokumen berversi.' },
  { rank: 7, size: 'S', title: 'Grafik tren di Dashboard',
    why: 'Separuh bawah dashboard masih kosong; datanya sudah ada di metering.' },
  { rank: 8, size: 'M', title: 'Alerting di Observability',
    why: 'Saat ini hanya papan baca — kegagalan sync atau lonjakan galat tak memberi tahu siapa pun.' },
  { rank: 9, size: 'M', title: 'Audit aksesibilitas & responsif mobile',
    why: 'Lighthouse menandai kontras beberapa teks; tabel lebar belum diuji di layar sempit.' },
  { rank: 10, size: 'M', title: 'Help center / panduan pengguna',
    why: 'Panduan OAuth sudah ada, tapi pengguna baru belum punya dokumentasi memakai produknya.' },
  { rank: 11, size: 'S', title: 'Ekspor CSV analitik & rentang tanggal kustom',
    why: 'Permintaan wajar begitu analitik dipakai untuk rapat.' },
  { rank: 12, size: 'M', title: 'Blok tabel & chart multi-seri di jawaban',
    why: 'Jawaban terstruktur baru mendukung chart satu seri; data perbandingan sering butuh tabel.' },
];
