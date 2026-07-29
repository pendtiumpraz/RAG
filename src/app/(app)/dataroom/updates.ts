/**
 * DATAROOM · UPDATE — catatan perkembangan.
 *
 * Berisi CATATAN PERUBAHAN saja. Sisa pekerjaan pindah ke papan kanban
 * (`modules/core/backlog.service.ts`) karena statusnya harus tersimpan di
 * DB — daftar statis tak bisa membedakan "belum tersentuh" dari "sedang
 * dikerjakan" dari "selesai".
 */

export interface ShipItem {
  title: string;
  detail: string;
  /** rujukan keputusan arsitektur bila ada */
  decision?: string;
}

export const SHIPPED_AT = '2026-07-30';

/* ── yang sudah jadi ─────────────────────────────────────────────── */
export const SHIPPED: Array<{ group: string; items: ShipItem[] }> = [
  {
    group: 'Akses programatik & akurasi (P0)',
    items: [
      { title: 'API key per tenant + webhook keluar',
        detail: 'Lubang integrasi terakhir tertutup dua arah. /api/v1/* dengan Bearer nk_live_ (me, chatbots, knowledge-bases, documents, search); webhook keluar ber-HMAC-SHA256 lewat job runner. /v1/search mengembalikan potongan + skor TANPA LLM, jadi agen pelanggan menyusun jawaban dengan model sendiri dan kuota pesan tak terpotong. Kunci disimpan sebagai sha256 saja, tampil sekali lalu hilang.' },
      { title: 'Hybrid search: kaki leksikal + RRF + penyingkiran kembar',
        detail: 'Vektor lemah pada token literal, full-text Postgres kuat persis di situ; digabung dengan Reciprocal Rank Fusion (peringkat, bukan skor yang tak sebanding). Ambang duplikat DIUKUR dari korpus nyata: berkas yang ter-ingest dua kali beririsan 0,699 sementara potongan lain di bawah 0,30 — ambang 0,9 yang semula dipakai meloloskan duplikat sungguhan. Skor yang dipublikasikan tetap kosinus 0..1 supaya arti lamanya utuh.' },
      { title: 'Workspace operator platform benar-benar tanpa batas',
        detail: 'Fitur sudah terbuka untuk superadmin, tapi KUOTANYA masih free (1.000 pesan, 1 chatbot, 2 anggota) karena snapshot kuota tak tahu peran siapa pun. Ditandai lewat kolom tenants.is_platform; satu titik sempit itu menentukan kuota, batas chatbot, kursi anggota, dan laju permintaan sekaligus.' },
      { title: 'Sumber pengetahuan: folder Drive publik & SharePoint sungguhan',
        detail: 'URL folder yang dibagikan publik ditarik rekursif dengan API key TANPA OAuth — satu-satunya jalur yang bebas verifikasi CASA. SharePoint tak lagi sekadar alias OneDrive pribadi: situs, document library, dan tautan berbagi kini terjangkau. Izin akun bisa ditambah inkremental tanpa memutus koneksi.' },
      { title: 'Dropdown digambar sendiri + papan kanban backlog',
        detail: 'Popup select bawaan digambar sistem operasi dan tak tersentuh CSS — sumber ketimpangan ukuran yang lama dikeluhkan. Diganti komponen listbox WAI-ARIA di 27 titik pakai. Backlog jadi papan kanban tersimpan di DB dengan prioritas P0..P3, nomor antrean hidup, dan modal detail.' },
    ],
  },
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
