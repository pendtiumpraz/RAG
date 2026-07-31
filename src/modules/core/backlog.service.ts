/**
 * BACKLOG (D15) — papan kanban pekerjaan produk di Dataroom.
 *
 * Daftar SEED di bawah adalah turunan langsung dari tiap celah di
 * `dataroom/assessment.ts`: setiap area yang belum 10 melahirkan satu kartu
 * atau lebih. Jadi papan ini bukan daftar keinginan — ia jawaban atas
 * "apa saja yang tersisa supaya semua dimensi jadi 10".
 *
 * `track` memisah tegas siapa yang bisa mengerjakan:
 *   human — tersandera kredensial, keputusan bisnis, atau pihak ketiga
 *   agent — bisa dikerjakan Claude tanpa menunggu siapa pun
 *
 * Status kartu tersimpan di DB, jadi papan ini INGAT posisinya. Seed
 * disisipkan idempotent per `key`: menambah kartu baru di kode akan muncul
 * sendiri di papan tanpa mengganggu status kartu yang sudah dipindah, dan
 * kartu yang dihapus manual tidak dibangkitkan kembali.
 */
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { db, backlogItems } from './db';
import { audit } from './guardrails';

/** Cukup identitas untuk audit — pemeriksaan peran sudah di `superadminRoute`. */
export type Actor = { id: string; tenantId: string };

export type Track = 'human' | 'agent';
export type Status = 'todo' | 'doing' | 'done';
export type Dimension = 'uiux' | 'agentic' | 'feature' | 'launch';
export type Size = 'S' | 'M' | 'L';
/** P0 kerjakan dulu · P1 penting · P2 normal · P3 nanti. */
export type Priority = 'P0' | 'P1' | 'P2' | 'P3';

export interface SeedItem {
  key: string;
  track: Track;
  dimension: Dimension;
  title: string;
  why: string;
  size: Size;
  priority: Priority;
  blocked?: string;
}

export const DIMENSION_LABEL: Record<Dimension, string> = {
  uiux: 'UI/UX',
  agentic: 'Agentic',
  feature: 'Feature',
  launch: 'Launching',
};

export const STATUS_LABEL: Record<Status, string> = {
  todo: 'Belum tersentuh',
  doing: 'Sedang dikerjakan',
  done: 'Selesai',
};

/* ══════════════════════════════════════════════════════════════════════
   SEED — jalan menuju 10/10
   Urutan di dalam tiap track = urutan dampak (kartu teratas paling penting).
   ══════════════════════════════════════════════════════════════════════ */

const HUMAN: SeedItem[] = [
  { key: 'h-smtp', track: 'human', dimension: 'launch', size: 'S', priority: 'P0',
    title: 'Isi kredensial SMTP (Gmail + App Password)',
    why: 'Menyalakan verifikasi email pendaftar, reset password, undangan tim, dan kabar akun disetujui. Seluruh kodenya sudah menunggu: Settings → panel Email → isi → kirim uji.',
    blocked: 'Akun email & App Password milikmu' },
  { key: 'h-gateway', track: 'human', dimension: 'launch', size: 'S', priority: 'P0',
    title: 'Isi kredensial gateway + daftarkan URL callback',
    why: 'Menyalakan pembelian plan. Cukup salah satu dari Midtrans/Tripay/Xendit (mulai dari sandbox), lalu salin URL callback ke dashboard provider.',
    blocked: 'Akun merchant gateway' },
  { key: 'h-drive-apikey', track: 'human', dimension: 'feature', size: 'S', priority: 'P0',
    title: 'Isi Drive API key — membuka sumber folder Drive publik',
    why: 'Menyalakan satu-satunya jalur yang menarik SELURUH isi folder rekursif tanpa verifikasi Google: tempel URL folder yang dibagikan, semua berkasnya masuk. Cloud Console → aktifkan Drive API → Create API key → batasi ke Drive API → tempel di Models & Keys.',
    blocked: 'Akses Google Cloud Console' },
  { key: 'h-ms-credentials', track: 'human', dimension: 'feature', size: 'S', priority: 'P1',
    title: 'Isi kredensial Microsoft — membuka OneDrive & SharePoint',
    why: 'Kode SharePoint sudah menjangkau document library situs dan tautan berbagi, tapi baris Microsoft di Models & Keys masih kosong sehingga tombol Connect tak menuju ke mana-mana. Butuh App registration di Azure + client secret + izin Files.Read.All & Sites.Read.All.',
    blocked: 'Akses Azure Portal organisasi' },
  { key: 'h-google-oauth', track: 'human', dimension: 'launch', size: 'M', priority: 'P1',
    title: 'Ajukan ulang verifikasi OAuth Google',
    why: 'Beranda sudah memenuhi semua syarat (nama aplikasi, penjelasan tujuan, ringkasan Inggris, kebijakan privasi). Sisa langkahnya: minta pengindeksan di Search Console, lalu submit ulang dan balas tiket Trust & Safety.',
    blocked: 'Hanya pemilik project Google Cloud' },
  { key: 'h-pricing', track: 'human', dimension: 'feature', size: 'S', priority: 'P2',
    title: 'Tetapkan harga Enterprise & lisensi on-premise',
    why: 'Slide bisnis dan halaman paket sudah siap menampilkannya; angkanya keputusanmu.',
    blocked: 'Keputusan bisnis' },
  { key: 'h-mailbox', track: 'human', dimension: 'launch', size: 'S', priority: 'P1',
    title: 'Siapkan kotak surat kontak resmi di domain',
    why: 'Kebijakan privasi menyebutnya sebagai kanal permintaan penghapusan data, dan Google membacanya saat verifikasi. Sekarang masih memakai Gmail pribadi.',
    blocked: 'Akses DNS/mail domain' },
  { key: 'h-pentest', track: 'human', dimension: 'launch', size: 'L', priority: 'P3',
    title: 'Pen-test eksternal',
    why: 'Diminta pelanggan enterprise sebelum tanda tangan. Fondasinya sudah kuat (RLS terbukti tes, enkripsi kredensial, audit log) — yang kurang tinggal pembuktian pihak ketiga.',
    blocked: 'Vendor keamanan' },
  { key: 'h-dpa', track: 'human', dimension: 'launch', size: 'M', priority: 'P3',
    title: 'Template DPA & dokumen SLA',
    why: 'Dua lampiran yang selalu diminta di pengadaan enterprise. Kebijakan privasi & ketentuan layanan sudah ada; ini lapisan kontraknya.',
    blocked: 'Penasihat hukum' },
  { key: 'h-casa', track: 'human', dimension: 'feature', size: 'M', priority: 'P2',
    title: 'Keputusan: Picker selamanya, atau kejar CASA?',
    why: 'Mode Picker sudah jalan tanpa verifikasi berat. Full-scan Drive di SaaS menuntut audit CASA tahunan berbayar — layak hanya bila pelanggan benar-benar menuntutnya.',
    blocked: 'Keputusan produk + biaya audit' },
  { key: 'h-uptime', track: 'human', dimension: 'launch', size: 'S', priority: 'P2',
    title: 'Daftarkan monitoring uptime eksternal',
    why: 'Pemantauan dari dalam tak bisa memberi tahu saat seluruh situs mati. Endpoint kesehatan akan kusediakan; yang dibutuhkan tinggal layanan yang mengetuknya dari luar.',
    blocked: 'Akun layanan monitoring' },
  { key: 'h-redis', track: 'human', dimension: 'launch', size: 'S', priority: 'P2',
    title: 'Sediakan Redis/Upstash untuk rate limit terdistribusi',
    why: 'Rate limit sekarang tersimpan di memori tiap lambda, jadi batasnya berlipat sebanyak instance yang hidup. Kodenya bisa kutulis begitu ada URL-nya.',
    blocked: 'Akun Upstash/Redis' },
  { key: 'h-demo-video', track: 'human', dimension: 'uiux', size: 'M', priority: 'P3',
    title: 'Rekam video demo produk untuk landing',
    why: 'Pengunjung landing belum bisa melihat produknya bekerja sebelum mendaftar — penghalang konversi terbesar yang tersisa.',
    blocked: 'Perlu suara & wajah manusia' },
  { key: 'h-support', track: 'human', dimension: 'launch', size: 'S', priority: 'P2',
    title: 'Tetapkan kanal & jam dukungan pelanggan',
    why: 'Halaman paket menjanjikan tingkat dukungan berbeda per plan; janji itu perlu punya kanal nyata di belakangnya.',
    blocked: 'Keputusan operasional' },
];

const AGENT: SeedItem[] = [
  /* ── agentic: lubang terbesar yang tersisa ───────────────────────── */
  { key: 'a-apikey', track: 'agent', dimension: 'agentic', size: 'M', priority: 'P0',
    title: 'API key per tenant + webhook keluar',
    why: 'Satu-satunya lubang besar yang tersisa untuk integrasi: akses programatik masih memakai cookie sesi. Membuka pemakaian Nalar oleh sistem/agen milik pelanggan.' },
  { key: 'a-hybrid', track: 'agent', dimension: 'agentic', size: 'M', priority: 'P0',
    title: 'Hybrid search — vektor + leksikal + memory, digabung peringkat',
    why: 'Menggabungkan pencarian kata kunci dengan vektor lalu menyusun ulang hasilnya. Peningkatan akurasi terbesar yang tersisa setelah perbaikan dokumen berversi.' },
  { key: 'a-kb-upload', track: 'agent', dimension: 'feature', size: 'M', priority: 'P0',
    title: 'Unggah berkas langsung ke KB + konektor URL',
    why: 'Jenis sumber `upload` dan `url` sudah ada di skema tapi belum punya jalur. Pelanggan tanpa Google Drive saat ini tak punya cara memasukkan dokumen.' },
  { key: 'a-widget-persist', track: 'agent', dimension: 'uiux', size: 'S', priority: 'P1',
    title: 'Sesi widget bertahan saat halaman dimuat ulang',
    why: 'Percakapan pengunjung terputus jadi sesi baru setiap refresh; cukup menyimpan id sesi di localStorage.' },
  { key: 'a-chat-controls', track: 'agent', dimension: 'uiux', size: 'S', priority: 'P1',
    title: 'Tombol hentikan jawaban & salin di halaman Chat',
    why: 'Dua hal yang paling terasa hilang saat memakai chat sehari-hari — jawaban panjang tak bisa dipotong, hasilnya tak bisa diambil.' },
  { key: 'a-tiered-retrieval', track: 'agent', dimension: 'agentic', size: 'L', priority: 'P0',
    title: 'Retrieval bertingkat — indeks di level dokumen, potongan dibaca sesuai kebutuhan',
    why: 'Saat ini SETIAP potongan masuk satu indeks HNSW datar, jadi RAM tumbuh mengikuti besar korpus: 47 juta potongan menuntut 282 GB. Kalau indeks residennya hanya di level DOKUMEN (±200 rb vektor untuk korpus 1 TB) dan potongan dokumen terpilih dibaca dari disk sesuai kebutuhan, RAM turun jadi 1–3 GB — 235× lebih kecil, dan tak lagi tumbuh mengikuti korpus. Ini yang menentukan apakah korpus 1 TB muat di server biasa atau menuntut mesin 256 GB. Tukar-tambahnya harus disebut jujur: dokumen yang terlewat di tingkat pertama tak akan pernah dibaca di tingkat kedua, jadi tingkat pertama butuh beberapa vektor per dokumen (per bagian), bukan satu, plus kaki leksikal di level dokumen. Butuh a-doc-summary lebih dulu sebagai bahan vektor tingkat pertama.' },
  { key: 'a-vector-dims', track: 'agent', dimension: 'feature', size: 'L', priority: 'P0',
    title: 'Kolom vektor berdimensi asli — hapus zero-padding',
    why: 'padVector() memaksa SEMUA embedding ke 1.536 dimensi; MiniLM sebenarnya 384, jadi tiga perempat setiap vektor adalah NOL yang tetap dibayar penuh di disk dan RAM. Terukur: 6.148 byte/potongan seharusnya 1.540. Untuk korpus 1 TB ini selisih 901 GB vs 334 GB disk dan 282 GB vs 78 GB RAM — penentu antara muat di server biasa atau tidak. WAJIB sebelum ingest besar pertama: mengubah dimensi kolom setelah jutaan potongan masuk berarti menghitung ulang seluruh embedding dari nol. Butuh kolom vektor per-dimensi atau tabel per-model, karena satu kolom pgvector hanya bisa satu dimensi.' },
  { key: 'a-storage-quota', track: 'agent', dimension: 'launch', size: 'M', priority: 'P0',
    title: 'Kuota penyimpanan & knowledge base per plan',
    why: 'DITEMUKAN SAAT MENYUSUN SLIDE BATAS LANGGANAN: PLAN_LIMITS membatasi pesan/bulan, jumlah chatbot, jumlah anggota, dan laju — tapi TIDAK membatasi jumlah knowledge base, jumlah dokumen, maupun besar penyimpanan. Artinya satu tenant Free hari ini bisa menyambungkan folder Drive berisi puluhan gigabyte dan meng-ingest semuanya tanpa tertahan apa pun. Biayanya nyata dan langsung: ruang disk Neon, RAM indeks vektor, dan panggilan embedding — semuanya ditanggung platform, bukan penyewa. Untuk on-premise ketiadaan batas ini MEMANG benar (batasnya server pelanggan), jadi kuotanya harus mengikuti pola yang sudah ada: tak berlaku pada plan onprem. Penegakan paling tepat di knowledgeService.ingest() — satu tempat yang dilewati sync, unggahan, URL, dan API sekaligus. WAJIB sebelum pelanggan berbayar pertama masuk.' },
  { key: 'a-answer-policy', track: 'agent', dimension: 'agentic', size: 'M', priority: 'P0',
    title: 'Kebijakan jawaban per chatbot — bahasa, nada, kepatuhan sumber, temperature',
    why: 'SEBELUM INI TAK SATU PUN PENYEDIA LLM DIKIRIMI TEMPERATURE, jadi semuanya berjalan pada default masing-masing — dan default OpenAI maupun Anthropic adalah 1,0. Untuk mesin yang tugasnya mengutip dokumen, itu meminta model kreatif tepat pada saat ia harus patuh: 1,0 adalah nilai yang dirancang untuk menulis cerita, bukan untuk menyebut nomor pasal. Kartu ini memasang empat tuas per chatbot: bahasa jawaban (ikut penanya / selalu Indonesia / selalu Inggris, dinilai per pesan), nada, tingkat kepatuhan pada dokumen (ketat = tak ketemu berarti bilang tak ketemu), dan temperature yang dijepit maksimum 1,0 di server plus CHECK constraint di database. Aturan bebas milik pemilik chatbot disisipkan sebagai preferensi GAYA saja sehingga tak bisa dipakai membatalkan aturan kepatuhan dari kotak teks biasa.' },
  { key: 'a-tier1-multivector', track: 'agent', dimension: 'agentic', size: 'M', priority: 'P1',
    title: 'Beberapa vektor per dokumen di lapisan pertama (bukan satu centroid)',
    why: 'Lapisan pertama yang sudah jalan memakai SATU rerata vektor per dokumen. Untuk dokumen tebal itu kelemahan yang harus disebut jujur: rerata sebuah kontrak 300 halaman mewakili tema umumnya, bukan satu pasal spesifik di dalamnya — dan dokumen yang terlewat di lapisan pertama TAK AKAN PERNAH dibaca di lapisan kedua. Sekarang risiko itu ditahan dua hal: kandidat diambil 40 dokumen (jauh lebih banyak dari yang dipakai) dan kaki leksikal tak ikut disaring sama sekali. Perbaikan sebenarnya: satu vektor per BAGIAN dokumen (mis. tiap 50 potongan), sehingga dokumen tebal punya beberapa wakil. Biayanya kecil — 5–10× baris lapisan pertama masih jauh di bawah jumlah potongan.' },
  { key: 'a-tier1-recall-eval', track: 'agent', dimension: 'agentic', size: 'M', priority: 'P1',
    title: 'Ukur recall mode bertingkat pada korpus besar sungguhan',
    why: 'Mode bertingkat sudah TERBUKTI BENAR (hasilnya identik dengan mode datar, diuji per isi pada DB nyata), tapi itu diuji pada 34 potongan — angka yang tak membuktikan apa pun tentang recall di 47 juta. Yang belum diketahui: berapa persen dokumen yang benar terlewat di lapisan pertama ketika korpusnya ratusan ribu dokumen. Butuh korpus sintetis besar + himpunan pertanyaan berjawab-diketahui, lalu bandingkan hasil bertingkat vs datar. Sampai angka ini ada, klaim "1–3 GB RAM" boleh disebut sebagai hasil rancangan, bukan sebagai hasil ukur.' },
  { key: 'a-reranker', track: 'agent', dimension: 'agentic', size: 'M', priority: 'P2',
    title: 'Reranker lintas-encoder di atas hasil gabungan',
    why: 'DIPISAH DARI a-hybrid supaya papan ini jujur: hybrid search-nya sudah terpasang penuh (tiga kaki + penggabungan peringkat + pembuangan kembar + penataan keragaman), tapi RERANKER-nya belum. Yang ada sekarang menilai kemiripan tanpa pernah membaca pertanyaan dan potongan BERSAMAAN; model lintas-encoder membacanya berpasangan dan karena itu jauh lebih tepat menilai mana yang benar-benar menjawab. Dipasang di ujung, atas 20-30 kandidat saja, sehingga biayanya kecil. Yang perlu diukur sebelum memutuskan: apakah selisih ketepatannya terasa pada dokumen perkantoran, atau tenggelam oleh penggabungan peringkat yang sudah bekerja baik. Butuh a-eval lebih dulu — tanpa himpunan pertanyaan berjawab-diketahui, perbaikannya tak bisa dibuktikan.' },
  { key: 'a-plan-quota-eval', track: 'agent', dimension: 'launch', size: 'S', priority: 'P1',
    title: 'Amati pemakaian nyata, lalu setel ulang kuota paket',
    why: 'Kuota kini bisa disetel superadmin tanpa deploy, dan defaultnya sengaja ketat: Free 10 potongan & 10 pesan/bulan — ruang COBA, bukan paket pemakaian. Yang belum diketahui adalah apakah seketat itu justru mengusir orang sebelum mereka sempat melihat produknya bekerja. Yang perlu diukur setelah pengguna pertama masuk: berapa persen akun Free menabrak kuota di hari pertama, berapa yang menabraknya lalu naik paket, dan berapa yang menabraknya lalu hilang. Angka ketiga itulah yang menentukan apakah kuotanya perlu dilonggarkan — dan sekarang melonggarkannya cukup satu kolom di panel Billing.' },
  { key: 'a-quota-ui-hint', track: 'agent', dimension: 'uiux', size: 'S', priority: 'P1',
    title: 'Tampilkan sisa kuota SEBELUM tertabrak',
    why: 'Endpoint /api/usage/storage sudah ada tapi belum dipakai UI mana pun. Akibatnya batas baru terasa saat unggahan ditolak — dan penolakan yang datang setelah orang menunggu proses selesai terbaca sebagai produk yang rusak, bukan sebagai batas paket. Yang dibutuhkan: bilah sisa kuota di halaman Knowledge Base dan Dokumen, plus peringatan saat melewati 80 persen. Dengan kuota Free yang sengaja ketat, ini bukan hiasan — ia pembeda antara pesan yang berbunyi paketmu penuh dan pesan yang terbaca aplikasinya rusak.' },
  { key: 'a-slide-anim-webp', track: 'agent', dimension: 'uiux', size: 'S', priority: 'P3',
    title: 'WebP beranimasi untuk slide HLA',
    why: 'Ekspor SVG + WebP sudah jalan, tapi WebP-nya STATIS pada keadaan akhir — canvas.toBlob hanya menghasilkan satu bingkai. SVG hasil ekspor masih beranimasi bila dibuka di peramban, jadi kebutuhannya sudah tertutup untuk sebagian besar pemakaian. WebP beranimasi baru berarti untuk ditempel ke WhatsApp atau PowerPoint, dan itu menuntut encoder di sisi peramban sekitar 100 KB — pertukaran yang belum sepadan untuk satu tombol.' },
  { key: 'a-quantization-rerank', track: 'agent', dimension: 'feature', size: 'M', priority: 'P3',
    title: 'Kuantisasi biner + rerank eksak (lanjutan halfvec)',
    why: 'halfvec sudah terpasang dan memberi 7,9x tanpa kehilangan ketepatan sedikit pun (50/50 posisi peringkat identik, terukur pada data nyata). Sisa penghematan berikutnya ada di kuantisasi BINER — 32x lebih kecil di lapisan penyaring — tapi ia TIDAK aman berdiri sendiri: presisi 1 bit menggeser potongan mana yang terambil, dan potongan yang meleset berubah jadi karangan begitu chatbot tak berada di mode kepatuhan ketat. Syaratnya mutlak: indeks biner hanya boleh jadi lapisan PENYARING, dengan rerank jarak eksak sesudahnya. Prioritasnya turun ke P3 karena dengan kuota SaaS sekecil sekarang (Free 10 potongan, Enterprise 1.000) penyimpanan sudah bukan kendala; ia baru berarti untuk pemasangan on-premise berkorpus besar.' },
  { key: 'a-ingest-dedupe', track: 'agent', dimension: 'agentic', size: 'S', priority: 'P1',
    title: 'Cegah potongan kembar dari ingest berulang',
    why: 'DITEMUKAN SAAT MENGUJI MODE BERTINGKAT: korpus demo memuat potongan yang benar-benar kembar — dokumen yang sama masuk dua kali dengan batas potongan sedikit bergeser (terukur Jaccard 0,699 sementara semua pasangan lain di bawah 0,30). Akibatnya nyata: jarak vektornya SAMA PERSIS sehingga urutan antar-kembar ditentukan rencana kueri, bukan relevansi; kuota dan biaya embedding dibayar dua kali; dan jendela konteks LLM terisi kalimat yang sama berulang. Sekarang ini cuma ditambal di jalur baca oleh dedupeNearDuplicates(). Perbaikan di jalur TULIS: sidik jari isi per potongan + lewati yang sudah ada.' },
  { key: 'a-answer-policy-eval', track: 'agent', dimension: 'agentic', size: 'M', priority: 'P1',
    title: 'Eval kepatuhan bahasa & anti-halusinasi',
    why: 'Kebijakan jawaban (bahasa auto/id/en, nada, tingkat kepatuhan pada dokumen, temperature) sudah terpasang dan arahannya diuji unit — tapi yang diuji baru BUNYI instruksinya, bukan apakah model benar-benar menurutinya. Butuh himpunan pertanyaan dwibahasa dengan jawaban yang diketahui, plus pertanyaan yang jawabannya SENGAJA tak ada di dokumen: mode ketat harus menjawab "tidak ada di dokumen", bukan mengarang. Tanpa ini, klaim anti-halusinasi bersandar pada kalimat prompt, bukan pada bukti.' },
  { key: 'a-doc-classify', track: 'agent', dimension: 'agentic', size: 'M', priority: 'P1',
    title: 'Kategorisasi dokumen otomatis + penataan ke Memory',
    why: 'Saat ini KB adalah kantong potongan yang rata — tak ada yang tahu mana dokumen legal, keuangan, SOP, atau kontrak sampai seseorang membacanya. Kategori memungkinkan tiga hal yang kini mustahil: menyaring pencarian per jenis dokumen ("cari hanya di kontrak"), memberi chatbot divisi konteks yang lebih tajam, dan menyusun graph Memory berdasarkan jenis alih-alih hanya wikilink. Klasifikasi dijalankan sekali saat ingest (bukan tiap kueri) supaya tak menambah biaya di jalur panas.' },
  { key: 'a-doc-summary', track: 'agent', dimension: 'agentic', size: 'M', priority: 'P1',
    title: 'Ringkasan per dokumen (bukan per potongan)',
    why: 'Retrieval mengembalikan potongan 800 karakter yang dicomot dari tengah berkas — pertanyaan seperti "dokumen ini isinya tentang apa" tak bisa dijawab dari situ karena tak ada satu potongan pun yang memuat gambaran utuhnya. Ringkasan tingkat dokumen menutup lubang itu, sekaligus menjadi bahan yang jauh lebih baik untuk kategorisasi dan untuk catatan Memory. Dibuat sekali saat ingest dan disimpan, bukan dihitung ulang tiap ditanya.' },
  { key: 'a-eval', track: 'agent', dimension: 'agentic', size: 'M', priority: 'P1',
    title: 'Harness eval jawaban (golden set) untuk regresi',
    why: 'Setiap perubahan prompt/retrieval sekarang diuji dengan mata. Sekumpulan pertanyaan-jawaban baku membuat penurunan kualitas ketahuan sebelum sampai ke pelanggan.' },
  { key: 'a-injection-eval', track: 'agent', dimension: 'agentic', size: 'M', priority: 'P1',
    title: 'Korpus eval prompt injection otomatis',
    why: 'Guardrails 5 lapis sudah ada tapi belum pernah diserang secara sistematis. Korpus serangan yang berjalan di CI mengubah klaim keamanan jadi bukti.' },
  { key: 'a-cross-encoder', track: 'agent', dimension: 'agentic', size: 'L', priority: 'P2',
    title: 'Reranker cross-encoder neural',
    why: 'Hybrid search sudah terpasang (dua kaki + RRF + penyingkiran kembar), tapi itu penggabungan peringkat — bukan model yang membaca pasangan pertanyaan-potongan dan menilainya langsung. Cross-encoder memberi lompatan akurasi berikutnya, dengan harga: satu model lagi di jalur panas, dan batas memori lambda untuk model besar sudah tercatat di docs/DEPLOY-VERCEL.md. Kemungkinan besar harus lewat server embedding sendiri.' },
  { key: 'a-chunk', track: 'agent', dimension: 'agentic', size: 'M', priority: 'P1',
    title: 'Semantic chunking (bukan potong 800 karakter)',
    why: 'Pemotongan tetap sering membelah tabel dan pasal di tengah. Memotong di batas makna menaikkan kualitas rujukan tanpa mengganti model apa pun.' },
  { key: 'a-blocks-table', track: 'agent', dimension: 'agentic', size: 'M', priority: 'P1',
    title: 'Blok tabel & chart multi-seri di jawaban',
    why: 'Jawaban terstruktur baru mendukung chart satu seri; pertanyaan perbandingan (antar tahun, antar divisi) hampir selalu menuntut tabel.' },
  { key: 'a-conv-search', track: 'agent', dimension: 'uiux', size: 'M', priority: 'P1',
    title: 'Pencarian, filter tanggal & ekspor di Conversations',
    why: 'Riwayat sudah lengkap tapi belum bisa ditelusuri — makin banyak percakapan, makin tak terpakai.' },
  { key: 'a-alerting', track: 'agent', dimension: 'feature', size: 'M', priority: 'P1',
    title: 'Alerting di Observability',
    why: 'Saat ini hanya papan baca. Kegagalan sync, lonjakan galat, atau kuota nyaris habis tak memberi tahu siapa pun.' },
  { key: 'a-dashboard-trend', track: 'agent', dimension: 'uiux', size: 'S', priority: 'P2',
    title: 'Grafik tren & isi bagian bawah Dashboard',
    why: 'Separuh bawah dashboard masih kosong padahal datanya sudah tersedia di metering.' },
  { key: 'a-invoice', track: 'agent', dimension: 'feature', size: 'M', priority: 'P2',
    title: 'Invoice/kuitansi PDF + riwayat pembayaran',
    why: 'Pelanggan Indonesia hampir selalu butuh bukti bayar untuk pembukuan; tanpa itu penjualan B2B tersendat di bagian keuangan.' },
  { key: 'a-memory-chat', track: 'agent', dimension: 'agentic', size: 'M', priority: 'P2',
    title: 'Memory belajar dari percakapan, bukan hanya sync',
    why: 'Agen memory kini hanya terpicu saat dokumen masuk. Pertanyaan berulang pengguna adalah sinyal pengetahuan terkaya yang sekarang terbuang.' },
  { key: 'a-2fa', track: 'agent', dimension: 'feature', size: 'M', priority: 'P2',
    title: 'Autentikasi dua faktor (TOTP)',
    why: 'Akun superadmin memegang kredensial seluruh tenant; satu password bukan perlindungan yang memadai untuk itu.' },
  { key: 'a-ratelimit', track: 'agent', dimension: 'launch', size: 'M', priority: 'P2',
    title: 'Rate limit terdistribusi',
    why: 'Batas per-lambda berlipat sebanyak instance yang hidup, jadi batas sebenarnya jauh lebih longgar dari yang dijanjikan. Menunggu Redis dari sisi manusia.' },
  { key: 'a-a11y', track: 'agent', dimension: 'uiux', size: 'M', priority: 'P2',
    title: 'Audit aksesibilitas WCAG AA',
    why: 'Lighthouse menandai kontras beberapa teks. Pengadaan institusi/pemerintah kerap mensyaratkan kepatuhan ini secara tertulis.' },
  { key: 'a-mobile', track: 'agent', dimension: 'uiux', size: 'M', priority: 'P2',
    title: 'Audit responsif layar sempit',
    why: 'Tabel lebar (Conversations, Usage, Team) belum pernah diuji di ponsel — pemilik bisnis justru paling sering membuka dari sana.' },
  { key: 'a-sync-progress', track: 'agent', dimension: 'uiux', size: 'M', priority: 'P2',
    title: 'Progres sync realtime di Knowledge',
    why: 'Sync panjang tampak menggantung: pengguna tak tahu apakah sedang berjalan atau sudah mati.' },
  { key: 'a-helpcenter', track: 'agent', dimension: 'launch', size: 'M', priority: 'P2',
    title: 'Help center / panduan pengguna',
    why: 'Panduan OAuth sudah ada, tapi pengguna baru belum punya dokumentasi memakai produknya. Ini skor terendah di seluruh assessment.' },
  { key: 'a-empty-tour', track: 'agent', dimension: 'uiux', size: 'M', priority: 'P2',
    title: 'Empty state bermakna & tur produk pertama kali',
    why: 'Tenant baru mendarat di halaman-halaman kosong tanpa tahu langkah pertamanya apa.' },
  { key: 'a-onprem-docs', track: 'agent', dimension: 'feature', size: 'M', priority: 'P2',
    title: 'Panduan instalasi on-premise + mekanisme lisensi',
    why: 'docker-compose sudah jalan, tapi pelanggan on-prem butuh panduan yang bisa diikuti tim IT mereka sendiri, plus kunci lisensi yang bisa diperiksa.' },
  { key: 'a-mcp', track: 'agent', dimension: 'agentic', size: 'M', priority: 'P2',
    title: 'MCP server Nalar',
    why: 'Membuat basis pengetahuan tenant bisa dipanggil langsung dari Claude/IDE pelanggan. Pembeda kuat di pasar yang belum ramai.' },
  { key: 'a-rbac-div', track: 'agent', dimension: 'feature', size: 'M', priority: 'P2',
    title: 'RBAC per-divisi',
    why: 'Peran masih dua tingkat (admin/member) untuk seluruh tenant, padahal chatbot sudah dimiliki divisi. Perusahaan besar menuntut anggota divisi hanya melihat miliknya.' },
  { key: 'a-csv', track: 'agent', dimension: 'feature', size: 'S', priority: 'P2',
    title: 'Ekspor CSV analitik & rentang tanggal kustom',
    why: 'Permintaan yang selalu muncul begitu analitik mulai dibawa ke rapat.' },
  { key: 'a-chat-sessions', track: 'agent', dimension: 'uiux', size: 'S', priority: 'P2',
    title: 'Daftar & ganti riwayat sesi di halaman Chat',
    why: 'Percakapan lama hanya bisa dilihat lewat Conversations, tak bisa dilanjutkan dari tempat mengetik.' },
  { key: 'a-confidence', track: 'agent', dimension: 'agentic', size: 'S', priority: 'P2',
    title: 'Kalibrasi keyakinan & "tidak tahu" yang jujur',
    why: 'Saat rujukan lemah, jawaban tetap terdengar sama yakinnya. Menampilkan tingkat keyakinan mencegah kepercayaan yang salah tempat.' },
  { key: 'a-moderation', track: 'agent', dimension: 'agentic', size: 'S', priority: 'P2',
    title: 'Lapis moderasi konten',
    why: 'Guardrails menjaga dari injeksi, belum dari penyalahgunaan. Widget publik berarti siapa pun bisa mengetik apa pun ke dalamnya.' },
  { key: 'a-runbook', track: 'agent', dimension: 'launch', size: 'M', priority: 'P3',
    title: 'Runbook backup & DR + uji pemulihan',
    why: 'Neon menyediakan PITR, tapi pemulihan yang belum pernah dicoba bukan pemulihan. Butuh prosedur tertulis dan satu latihan nyata.' },
  { key: 'a-status', track: 'agent', dimension: 'launch', size: 'S', priority: 'P3',
    title: 'Halaman status publik + endpoint kesehatan',
    why: 'Saat terjadi gangguan, pelanggan butuh tempat melihat keadaannya selain menebak. Juga syarat bagi monitoring eksternal.' },
  { key: 'a-theme-preset', track: 'agent', dimension: 'feature', size: 'S', priority: 'P3',
    title: 'Preset tema branding per chatbot',
    why: 'Logo sudah bisa diunggah; warna dan sudut widget masih terkunci. White-label belum benar-benar white.' },
  { key: 'a-dark', track: 'agent', dimension: 'uiux', size: 'S', priority: 'P3',
    title: 'Audit dark mode menyeluruh',
    why: 'Halaman baru (Dataroom, Billing, Payments) belum ditelusuri satu per satu dalam mode gelap.' },
  { key: 'a-landing-demo', track: 'agent', dimension: 'uiux', size: 'M', priority: 'P3',
    title: 'Demo interaktif di landing',
    why: 'Chatbot demo berisi dokumen contoh yang bisa langsung dicoba pengunjung, tanpa mendaftar — bukti lebih kuat daripada tangkapan layar.' },
  { key: 'a-funnel', track: 'agent', dimension: 'launch', size: 'M', priority: 'P3',
    title: 'Analitik funnel produk',
    why: 'Belum terlihat di titik mana pendaftar berhenti: verifikasi, onboarding, chatbot pertama, atau pembayaran. Tanpa itu perbaikan konversi hanya menebak.' },
  { key: 'a-sso', track: 'agent', dimension: 'feature', size: 'L', priority: 'P3',
    title: 'SSO enterprise (SAML/OIDC)',
    why: 'Syarat yang hampir selalu muncul di korporasi besar. Login Google/Microsoft sudah ada — ini tingkat berikutnya, memakai identity provider milik mereka.' },
  { key: 'a-connectors', track: 'agent', dimension: 'feature', size: 'L', priority: 'P3',
    title: 'Konektor tambahan (Notion, Slack, S3)',
    why: 'Pengetahuan perusahaan tak hanya tinggal di Drive/SharePoint. Kerangka sync inkremental sudah umum, tinggal adaptornya.' },

  /* ── ditambahkan 31 Jul 2026 ──────────────────────────────────────
     Tiga di antaranya lahir dari pekerjaan yang sudah selesai; satu dari
     temuan yang muncul saat menghitung batas Vercel untuk korpus besar. */

  { key: 'a-chat-fullpage', track: 'agent', dimension: 'uiux', size: 'M', priority: 'P1',
    title: 'Chat halaman penuh publik + mode embed inline',
    why: 'Gelembung sudut cocok untuk chatbot yang MENEMANI isi situs — dibuka sambil lalu, satu sesi, ditutup dan dilupakan. Ia salah bentuk untuk tautan yang dibagikan sendiri, tempat percakapannya berumur panjang dan dibuka berulang kali. /c/{publicKey} memberi bentuk itu: chat memenuhi layar dengan daftar sesi di samping, diambil dari SERVER bukan localStorage supaya membersihkan penyimpanan peramban tak menghapus riwayat yang sebenarnya masih ada. embed.js mendapat data-mode="inline" yang memuatnya lewat iframe — bukan menggambar ulang antarmukanya, karena dua antarmuka yang sama berarti dua tempat yang harus diperbaiki dan yang satu pasti tertinggal.' },

  { key: 'a-recategorize', track: 'agent', dimension: 'agentic', size: 'S', priority: 'P1',
    title: 'Kategorikan ulang dokumen dari ringkasan yang sudah ada',
    why: 'Kategori hanya ditetapkan SEKALI, saat agen Memory meringkas dokumen. Kalau penilaian itu gagal — JSON model cacat, usulan kategori ditolak, kategorinya belakangan dihapus pengguna — catatan jatuh ke penampung dan tak pernah keluar lagi. Satu-satunya jalan keluar sebelumnya adalah menjalankan ulang seluruh agen: membaca ulang tiap dokumen, meringkas ulang semuanya, membangun ulang grafnya. Untuk membetulkan kategori saja itu ongkos yang tak masuk akal, dan karena mahal ia tak pernah dilakukan — sehingga penampungnya menumpuk selamanya.' },

  { key: 'a-ingest-worker', track: 'agent', dimension: 'feature', size: 'L', priority: 'P1',
    title: 'Pekerja ingest di luar Vercel untuk korpus besar',
    why: 'Terhitung dari batas kode produksi sendiri: korpus 700 GB berarti ±3,1 juta dokumen, dan dengan MAX_INGEST_PER_SYNC=150 per jalan serta maxDuration 60 detik itu ±20.589 kali jalan — ±14 hari nonstop kalau dipicu cron tiap menit dan setiap putaran sukses penuh. Ditambah jendela listing 2.000 yang membuat deteksi berkas terhapus permanen dilewati, dan 700 GB yang harus mengalir lewat lambda (±70% jatah transfer Vercel Pro sebulan). Yang menghalangi BUKAN kapasitas — indeks 700 GB kini hanya 2,5 GB dan melayani pertanyaan dari Vercel sudah muat — melainkan tak adanya proses latar yang hidup terus. Basis datanya sama, jadi menjalankan ingest dari VPS sementara penyajian tetap di Vercel tak menuntut kode baru; yang dibutuhkan hanya pemicu dan pembungkusnya.' },

  { key: 'a-visitor-identity', track: 'agent', dimension: 'feature', size: 'M', priority: 'P2',
    title: 'Riwayat chat publik yang ikut berpindah perangkat',
    why: 'Identitas pengunjung di /c dan di widget sepenuhnya visitorId di localStorage. Untuk chatbot landing page itu tepat dan sengaja. Tapi batasnya nyata: buka dari ponsel setelah mengobrol di laptop, riwayatnya kosong — dan pengunjung akan menyangka datanya terhapus, bukan menyangka identitasnya berbeda. Sekarang batas itu ditulis apa adanya di kaki daftar sesi, yang cukup untuk jujur tapi tak menyelesaikan apa pun. Jalan keluarnya bisa ringan (tautan lanjutkan-percakapan berisi token sekali pakai) atau berat (login pengunjung opsional); yang berat baru sepadan kalau ada pelanggan yang benar-benar memintanya.' },
];

export const SEED: SeedItem[] = [...HUMAN, ...AGENT];

/* ══════════════════════════════════════════════════════════════════════ */

export interface BacklogRow {
  id: string; key: string; track: Track; dimension: Dimension;
  title: string; why: string; size: Size; blocked: string | null;
  status: Status; position: number; priority: Priority;
}

/**
 * Menyisipkan kartu seed yang belum ada.
 *
 * Pemeriksaan sengaja mengabaikan `deleted_at`: kartu yang dihapus manual
 * tak boleh hidup lagi tiap halaman dibuka.
 */
async function ensureSeeded(): Promise<void> {
  const existing = await db.select({ key: backlogItems.key }).from(backlogItems);
  const known = new Set(existing.map((r) => r.key));
  const missing = SEED.filter((s) => !known.has(s.key));
  if (!missing.length) return;
  await db.insert(backlogItems).values(
    missing.map((s, i) => ({
      key: s.key, track: s.track, dimension: s.dimension, title: s.title,
      why: s.why, size: s.size, blocked: s.blocked ?? null, priority: s.priority,
      status: 'todo' as const, position: known.size + i,
    })),
  ).onConflictDoNothing();
}

export const backlogService = {
  async list(): Promise<BacklogRow[]> {
    await ensureSeeded();
    const rows = await db.select().from(backlogItems)
      .where(isNull(backlogItems.deletedAt))
      .orderBy(asc(backlogItems.position), asc(backlogItems.createdAt));
    return rows as BacklogRow[];
  },

  /**
   * Memindahkan satu kartu, lalu menuliskan ulang urutan kolom tujuan.
   *
   * `order` berisi seluruh id kolom tujuan SESUDAH perpindahan — dikirim
   * frontend dalam satu permintaan supaya papan tak pernah setengah jadi
   * bila permintaan kedua gagal.
   */
  async move(_actor: Actor, input: { id: string; status: Status; order: string[] }): Promise<void> {
    await db.update(backlogItems)
      .set({ status: input.status, updatedAt: new Date() })
      .where(and(eq(backlogItems.id, input.id), isNull(backlogItems.deletedAt)));

    // Satu UPDATE ber-CASE, bukan N round-trip — papan bisa berisi puluhan
    // kartu dan tiap seret akan menulis ulang seluruh kolom.
    const ids = input.order.filter((v, i) => input.order.indexOf(v) === i);
    if (!ids.length) return;
    const cases = sql.join(
      ids.map((id, i) => sql`when ${backlogItems.id} = ${id}::uuid then ${i}`),
      sql` `,
    );
    await db.update(backlogItems)
      .set({ position: sql`case ${cases} else ${backlogItems.position} end` })
      .where(sql`${backlogItems.id} = any(array[${sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)}])`);
  },

  /**
   * Ubah kepentingan sebuah kartu. Sengaja TERPISAH dari `move()`: menyeret
   * kartu mengatur antrean, mengubah prioritas menilai kepentingan — dan
   * mencampurnya membuat satu seretan diam-diam menulis ulang penilaian.
   */
  async setPriority(actor: Actor, id: string, priority: Priority): Promise<void> {
    await db.update(backlogItems)
      .set({ priority, updatedAt: new Date() })
      .where(and(eq(backlogItems.id, id), isNull(backlogItems.deletedAt)));
    await audit(actor.tenantId, actor.id, 'platform.backlog_priority', 'platform', { id, priority });
  },

  async create(actor: Actor, input: {
    track: Track; dimension: Dimension; title: string; why: string; size: Size;
    priority?: Priority; blocked?: string;
  }): Promise<BacklogRow> {
    const key = `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const [row] = await db.insert(backlogItems).values({
      key, track: input.track, dimension: input.dimension, title: input.title,
      why: input.why, size: input.size, blocked: input.blocked || null,
      priority: input.priority ?? 'P2',
      status: 'todo', position: -1, // muncul di puncak kolom "belum tersentuh"
    }).returning();
    await audit(actor.tenantId, actor.id, 'platform.backlog_created', 'platform', { title: input.title });
    return row as BacklogRow;
  },

  async remove(actor: Actor, id: string): Promise<void> {
    await db.update(backlogItems)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(backlogItems.id, id));
    await audit(actor.tenantId, actor.id, 'platform.backlog_removed', 'platform', { id });
  },
};
