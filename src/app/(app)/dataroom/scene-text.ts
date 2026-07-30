/**
 * PADANAN TEKS tiap adegan HLA.
 *
 * Ada dua alasan berkas ini terpisah dari `scenes.tsx`:
 *
 *  1. PPTX tak bisa membawa SVG beranimasi. Tanpa padanan teks, slide
 *     ilustrasi akan terekspor KOSONG — dek yang di layar paling jelas justru
 *     jadi dek yang di PowerPoint paling hampa.
 *  2. `export.ts` bukan komponen React; mengimpor berkas ber-JSX ke sana akan
 *     menyeret seluruh pohon render ke jalur ekspor tanpa alasan.
 *
 * Isinya bukan keterangan gambar, melainkan ISI yang sama disampaikan lewat
 * kata — dibaca sendiri pun utuh.
 */

export type SceneId =
  | 'ingest' | 'dedupe' | 'legs' | 'tiers' | 'policy' | 'guardrails' | 'rls' | 'memory'
  | 'tokens' | 'costs' | 'plans' | 'capacity' | 'vercel' | 'storage' | 'scale';

export const SCENE_STEPS: Record<SceneId, Array<{ t: string; d: string }>> = {
  ingest: [
    { t: 'Listing', d: 'Metadata saja — nama, ukuran, versi. Belum ada berkas yang ditarik.' },
    { t: 'Unduh', d: 'Berkas dibaca ke memori. Teks di dalam PDF tak ada di metadata, jadi tahap ini tak bisa dilewati.' },
    { t: 'Ekstrak teks', d: 'PDF dan DOCX diubah jadi teks polos. Berkas aslinya lalu dilepas — tak pernah ditulis ke disk.' },
    { t: 'Potong', d: 'Teks dipecah jadi potongan ±800 karakter di batas kalimat.' },
    { t: 'Embed', d: 'Tiap potongan diubah jadi vektor — inilah yang membuat pencarian memahami makna, bukan hanya kata.' },
    { t: 'Simpan', d: 'Teks + vektor masuk basis data. Berkas asli tetap tinggal di Drive/SharePoint Anda.' },
  ],
  dedupe: [
    { t: 'Lapis 1 — nama + ukuran', d: 'Dinilai dari listing, SEBELUM mengunduh. Berkas yang sama disalin ke folder lain langsung dilewati.' },
    { t: 'Batasnya', d: 'Lapis ini luput pada salinan yang di-rename — bentuk redundansi paling lazim di Drive dan SharePoint.' },
    { t: 'Lapis 2 — sidik jari isi', d: 'sha256 atas teks hasil ekstraksi. Menangkap salinan yang di-rename dan berkas sama berformat berbeda.' },
    { t: 'Sekaligus mengoreksi lapis 1', d: 'Dua berkas yang kebetulan senama-seukuran tapi isinya beda tetap masuk keduanya.' },
    { t: 'Yang dihemat', d: 'Bukan unduhannya — melainkan embedding dan penyimpanan vektor, bagian yang menentukan spesifikasi server.' },
    { t: 'Kembar dicatat', d: 'Ditampilkan beserta alasannya, tidak dibuang diam-diam: berkas yang lenyap tanpa jejak tak bisa dibedakan dari sync yang gagal.' },
  ],
  legs: [
    { t: 'Kaki vektor', d: 'Mencari berdasarkan MAKNA — "aturan cuti" menemukan dokumen yang menyebut "hak istirahat tahunan".' },
    { t: 'Kaki leksikal', d: 'Mencari yang PERSIS — nomor kontrak, nama orang, kode pasal. Yang lemah di pencarian makna.' },
    { t: 'Kaki memory', d: 'Mencari di ringkasan tingkat dokumen — menjawab pertanyaan bergambaran luas.' },
    { t: 'Penggabungan peringkat', d: 'Ketiganya digabung lewat PERINGKAT, bukan penjumlahan skor: skor dari mesin pencari berbeda tak setara.' },
    { t: 'Penyaringan', d: 'Potongan kembar dibuang, lalu keragaman ditata supaya konteks tak berisi enam kalimat yang mirip.' },
    { t: 'Jaring pengaman', d: 'Kaki leksikal TAK PERNAH ikut disaring mode hemat — pencarian nomor & nama selalu menyapu seluruh korpus.' },
  ],
  tiers: [
    { t: 'Mode langsung', d: 'Seluruh potongan berada dalam satu indeks. Cara paling teliti, dipakai selama korpus masih kecil.' },
    { t: 'Batasnya', d: 'Kebutuhan memori tumbuh mengikuti besar korpus — pada 1 TB itu berarti 282 GB sebelum optimasi.' },
    { t: 'Mode bertingkat', d: 'Yang residen di memori hanya satu vektor per DOKUMEN; potongannya dibaca dari disk sesuai kebutuhan.' },
    { t: 'Hasilnya', d: '282 GB → 69 GB (dimensi asli, terpasang & terukur) → 1–3 GB (bertingkat, terpasang).' },
    { t: 'Menyala sendiri', d: 'Ambangnya ditentukan sistem saat memasukkan dokumen. Tak ada mode yang perlu dipilih siapa pun.' },
    { t: 'Kenapa tak jadi saklar', d: 'Memilih mode retrieval menuntut penilaian yang pemilik data tak punya dasar untuk membuatnya, dan salah pilih berarti jawaban yang diam-diam kehilangan dokumen.' },
  ],
  policy: [
    { t: 'Bahasa', d: 'Ikut bahasa penanya (dinilai per pesan), atau dikunci ke Indonesia / Inggris.' },
    { t: 'Kepatuhan sumber', d: 'Ketat = tak ada di dokumen berarti bot menjawab "tidak ada". Itu jawaban yang benar.' },
    { t: 'Nada', d: 'Formal, ramah, ringkas, atau teknis — disetel per chatbot, bukan per perusahaan.' },
    { t: 'Kreativitas', d: 'Default 0,2 dan dijepit maksimum 1,0, ditegakkan di service maupun di basis data.' },
    { t: 'Kenapa itu penting', d: 'Sebelumnya tak satu pun penyedia dikirimi nilai ini, jadi semua berjalan pada bawaannya: 1,0 — nilai untuk menulis prosa.' },
    { t: 'Aturan bebas pemilik', d: 'Disisipkan sebagai preferensi GAYA, tak pernah bisa melonggarkan aturan bahasa dan kepatuhan di atasnya.' },
  ],
  guardrails: [
    { t: 'L1 · Sanitasi masukan', d: 'Pertanyaan dibersihkan sebelum menyentuh apa pun.' },
    { t: 'L2 · Anti penyusupan', d: 'Teks dokumen selalu dibungkus sebagai DATA — kalimat "abaikan aturan sebelumnya" di dalam PDF tetap dibaca sebagai isi, bukan perintah.' },
    { t: 'L3 · Batas eksekusi', d: 'Waktu dan panjang jawaban dibatasi, sehingga satu pertanyaan tak bisa menghabiskan sumber daya.' },
    { t: 'L4 · Redaksi rahasia', d: 'Kunci dan token yang terlanjur ada di dokumen disensor sebelum jawaban meninggalkan server.' },
    { t: 'L5 · Jejak audit', d: 'Pertanyaan, jawaban, dan dokumen yang dipakai tercatat — jawaban bisa ditelusuri berbulan-bulan kemudian.' },
    { t: 'Berlaku selalu', d: 'Kelimanya berjalan pada tiap giliran, bukan hanya pada mode tertentu. Tak ada jalur pintas.' },
  ],
  rls: [
    { t: 'Kunci dipasang di transaksi', d: 'Identitas pelanggan ditanamkan di dalam transaksi basis data, bukan disimpan di kode aplikasi.' },
    { t: 'Kebijakan melekat pada tabel', d: 'Basis data sendiri yang menyaring baris, sehingga tak ada kueri yang bisa "lupa" menyaring.' },
    { t: 'Peran yang dibatasi', d: 'Aplikasi menyambung sebagai peran yang TIDAK berhak melewati kebijakan itu.' },
    { t: 'Akibatnya', d: 'Kueri yang salah tulis sekalipun tetap tak bisa melintas antar pelanggan.' },
    { t: 'Bedanya dengan penyaringan di kode', d: 'Batas yang dijaga kode bocor karena satu baris yang lupa; batas yang dijaga basis data tidak punya baris untuk dilupakan.' },
    { t: 'Pada on-premise', d: 'Seluruh mekanisme ini berjalan di server Anda sendiri, dengan basis kode yang sama persis.' },
  ],
  memory: [
    { t: 'Ringkas', d: 'Tiap dokumen diringkas sekali oleh model, sekaligus diberi kategori. Satu panggilan per dokumen, hasilnya dipakai ulang.' },
    { t: 'Tautkan', d: 'Topik yang muncul di beberapa dokumen dijadikan tautan antar catatan.' },
    { t: 'Graf pengetahuan', d: 'Hasilnya peta yang bisa ditelusuri — dokumen mana bicara tentang apa, dan mana yang saling berkaitan.' },
    { t: 'Tinjauan opsional', d: 'Bila dinyalakan, hanya ringkasan yang disetujui yang masuk graf dan ikut menjawab.' },
    { t: 'Kegunaannya saat menjawab', d: 'Menjawab yang tak bisa dijawab potongan mana pun — "dokumen ini isinya apa", "aturan cuti tersebar di mana saja".' },
    { t: 'Batas pemakaiannya', d: 'Ditandai tegas sebagai tulisan AI. Angka, tanggal, nama, dan nomor pasal SELALU diambil dari teks asli.' },
  ],
  tokens: [
    { t: 'Pencarian tidak memakai token model', d: 'Kaki vektor, leksikal, dan memory semuanya berjalan di basis data. Korpus 1 TB maupun 1 GB — biayanya sama: nol token.' },
    { t: 'Enam potongan dokumen', d: 'Hanya potongan TERPILIH yang masuk ke model. Sekitar 1.800 token — bagian terbesar dari satu giliran.' },
    { t: 'Riwayat percakapan', d: 'Beberapa giliran terakhir dibawa serta supaya jawaban nyambung. Sekitar 700 token.' },
    { t: 'Aturan sistem & kebijakan chatbot', d: 'Bahasa, kepatuhan sumber, nada, dan aturan pemilik. Sekitar 450 token.' },
    { t: 'Total masuk ±3.000, keluar ±500', d: 'Tarif token keluar biasanya beberapa kali lipat token masuk, jadi panjang jawaban ikut menentukan biaya.' },
    { t: 'Yang perlu diingat', d: 'Besar korpus TIDAK menaikkan tagihan per pertanyaan. Yang naik hanya kebutuhan penyimpanan dan memori — dibayar sekali.' },
  ],
  costs: [
    { t: 'Biaya sekali — saat dokumen masuk', d: 'Embedding potongan, ringkasan Memory (satu panggilan model per dokumen), dan ruang penyimpanan.' },
    { t: 'Tidak berulang', d: 'Sync berikutnya hanya menyentuh berkas yang berubah; sisanya tak diunduh, tak di-embed, tak dibayar lagi.' },
    { t: 'Biaya berulang — tiap pertanyaan', d: 'Hanya panggilan model bahasa untuk menyusun jawaban. Pencarian tidak menambah apa pun.' },
    { t: 'Selisih antar model besar', d: 'Untuk 1.000 pertanyaan yang sama, model termurah dan termahal di tabel berbeda lebih dari dua puluh kali lipat.' },
    { t: 'Model bisa diganti kapan saja', d: 'Tanpa mengulang ingest apa pun — dokumen dan vektornya tetap di tempatnya.' },
    { t: 'Pada on-premise', d: 'Biaya berulang bisa ditekan hingga nol dengan model yang dijalankan sendiri; yang tersisa hanya listrik dan perawatan server.' },
  ],
  plans: [
    { t: 'Free — 1.000 pesan/bulan', d: '1 chatbot, 2 anggota, 2 knowledge base, 5 ribu potongan (±500 dokumen · ±170 MB berkas). Sengaja tetap fungsional penuh: orang tak membayar produk yang belum pernah dilihatnya bekerja.' },
    { t: 'Pro — 50.000 pesan/bulan', d: '10 chatbot, 15 anggota, 20 knowledge base, 200 ribu potongan (±20 ribu dokumen · ±6,8 GB berkas). Membuka analitik, memory, branding, dan tim.' },
    { t: 'Enterprise — 2 juta potongan', d: '±200 ribu dokumen, ±68 GB berkas, 200 knowledge base. Chatbot dan anggota tanpa batas. Penyimpanannya BERHINGGA dengan sengaja — pada SaaS, penyimpanan tanpa batas berarti biaya yang tak bisa diperkirakan.' },
    { t: 'On-Premise — tanpa batas', d: 'Semua kuota mati. Batasnya server milik pelanggan sendiri, dan memaksakan kuota buatan di atas perangkat yang sudah mereka bayar hanya terasa mengada-ada.' },
    { t: 'Kuota per POTONGAN, bukan per gigabyte', d: 'Potonganlah satuan biaya yang nyata: 8.228 byte baris + ±1.570 byte indeks vektor yang harus residen di RAM. Dua pelanggan dengan 10 GB Drive bisa menghabiskan jatah yang jauh berbeda — PDF pindaian nyaris tak berisi teks, CSV hampir seluruhnya teks.' },
    { t: 'Semua angka ditegakkan kode', d: 'Diambil langsung dari core/limits.ts, dan ditegakkan di knowledgeService.ingest() — satu jalur yang dilewati sync, unggahan, konektor URL, dan API sekaligus.' },
  ],
  capacity: [
    { t: 'Dasar perhitungan', d: '8.189 byte per potongan di tabel (diukur dengan pg_column_size pada data produksi) + ±1.570 byte indeks berdimensi asli. Sisanya aritmetika.' },
    { t: 'Vercel Pro + Neon', d: 'Atap tertinggi Neon adalah 16 CU / 64 GB RAM. Mode langsung: ±40 juta potongan. Di atas itu tak ada paket yang lebih besar — harus pindah.' },
    { t: 'On-premise 128 GB', d: 'Mode langsung ±80 juta potongan; mode bertingkat dibatasi disk, bukan RAM. Batasnya perangkat yang dibeli, dan bisa ditambah kapan saja.' },
    { t: 'AWS RDS / Aurora', d: 'Instans memori besar mencapai 768 GB RAM — atap tertinggi dari ketiganya, dengan biaya bulanan yang juga tertinggi.' },
    { t: 'Mode bertingkat mengubah atapnya', d: 'Mode langsung dibatasi RAM; mode bertingkat dibatasi DISK. Dan disk jauh lebih murah dinaikkan daripada RAM.' },
    { t: 'Yang tidak berubah', d: 'Berapa pun besar korpusnya, biaya per pertanyaan tetap sama — pencarian tak memakai token model.' },
  ],
  vercel: [
    { t: 'Unggahan ±4,5 MB per permintaan', d: 'Batas badan permintaan Vercel. Berkas besar masuk lewat konektor Drive/SharePoint, bukan lewat tombol unggah.' },
    { t: 'Penyimpanan sementara ±512 MB', d: 'Model embedding 22 MB berjalan mulus — terukur 3,8 detik dingin, 0,5 detik hangat. Model 543 MB+ tak muat dan butuh server embedding terpisah.' },
    { t: 'Pembatas laju tak berbagi antar instans', d: 'Hitungannya ada di memori tiap instans. Saat lalu lintas naik dan instans bertambah, batas efektifnya jadi lebih longgar dari angka yang tertulis.' },
    { t: 'Tak ada proses latar yang hidup terus', d: 'Sync panjang dipecah — maksimum 150 berkas per jalannya, sisanya dilanjut jalan berikutnya. Sudah berjalan begitu hari ini.' },
    { t: 'Keempatnya sudah punya jalan keluar', d: 'Bukan risiko terbuka; semuanya sudah ditangani di produk ini hari ini.' },
    { t: 'Yang belum punya jalan keluar', d: 'Atap Neon: di atas 16 CU tidak ada paket berikutnya. Melewatinya berarti pindah ke server sendiri atau ke AWS.' },
  ],
  storage: [
    { t: 'Satu potongan = 8.228 byte', d: 'Diukur dengan pg_column_size pada data produksi, bukan diperkirakan.' },
    { t: 'Vektornya 6.148 byte — 74,7%', d: '1.536 angka × 4 byte. Inilah yang memenuhi basis data, bukan teks dokumennya.' },
    { t: 'Teksnya hanya 680 byte — 8,3%', d: 'Vektor sembilan kali lebih besar dari teks yang diwakilinya. Itulah biaya sebenarnya dari pencarian makna.' },
    { t: '1 GB Drive → ±20 MB teks', d: 'Sekitar 2% dari berkas kantoran yang benar-benar jadi teks; sisanya gambar dan format.' },
    { t: '→ ±29 ribu potongan → ±288 MB', d: 'Basis datanya justru LEBIH KECIL dari berkas sumbernya, tapi 14× lebih besar dari teksnya.' },
    { t: 'Rasionya sangat bergantung jenis berkas', d: 'PDF hasil pindai mendekati 0%; CSV dan teks polos mendekati 100%. Rasio 2% adalah nilai tengah perkantoran.' },
  ],
  scale: [
    { t: '1 GB → ±288 MB basis data', d: '±29 ribu potongan. RAM mode langsung ±46 MB.' },
    { t: '100 GB → ±29 GB basis data', d: '±2,9 juta potongan. RAM mode langsung ±4,6 GB — masih nyaman di mana pun.' },
    { t: '700 GB → ±202 GB basis data', d: '±20,6 juta potongan. RAM mode langsung ±32 GB. Ini korpus klien on-premise.' },
    { t: '1 TB → ±288 GB basis data', d: '±29 juta potongan. RAM mode langsung 46–69 GB — melewati atap Neon.' },
    { t: 'Dua rasio, dua kegunaan', d: '2% untuk memperkirakan, 3% untuk MERENCANAKAN server. Merencanakan dengan nilai tengah adalah cara paling rapi untuk kehabisan memori enam bulan kemudian.' },
    { t: 'Mode bertingkat memangkas sepersepuluh', d: 'Korpus 1 TB: dari 46–69 GB menjadi 4,6–6,9 GB. Korpusnya sama, memorinya sepersepuluh.' },
  ],
};
