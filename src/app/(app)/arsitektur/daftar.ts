/**
 * MANIFES DIAGRAM — satu baris per fitur.
 *
 * Menambah fitur ke halaman Arsitektur = menulis satu spesifikasi di
 * `docs/hla/`, merendernya ke `public/hla/`, lalu menambah SATU entri di sini.
 * Tak ada komponen React baru, tak ada rute baru.
 *
 * `langkah` sengaja hidup di sini, bukan di dalam diagram: gambar menjelaskan
 * ALUR (apa memanggil apa, di mana ia gagal), sedangkan orang yang membuka
 * halaman ini biasanya ingin tahu CARA memakainya — dan dua pertanyaan itu
 * tak terjawab oleh bentuk yang sama. Diagram di kiri, langkah di kanan.
 */

export interface Diagram {
  id: string;
  /** Judul pendek untuk daftar di sisi kiri. */
  judul: string;
  /** Jenis archify — ikut ditampilkan supaya jelas ini alur, urutan, atau peta. */
  jenis: 'architecture' | 'workflow' | 'sequence' | 'dataflow' | 'lifecycle';
  /** Satu kalimat: fitur ini menjawab kebutuhan apa. */
  ringkas: string;
  /** Berkas HTML hasil render di public/hla/. */
  berkas: string;
  /** Spesifikasi sumbernya — ditulis apa adanya supaya bisa dirender ulang. */
  spec: string;
  /** Cara memakainya, urut. Menyebut menu yang benar-benar ada di sidebar. */
  langkah: string[];
  /** Batas & jebakan yang paling sering menimbulkan salah paham. */
  catat?: string[];
}

export const DIAGRAM: Diagram[] = [
  {
    id: 'arsitektur',
    judul: 'Peta arsitektur runtime',
    jenis: 'architecture',
    ringkas: 'Seluruh sistem dalam satu peta: jalur tanya, jalur masuk, isolasi tenant, dan pekerjaan yang tak muat di lambda.',
    berkas: '/hla/nalar-arsitektur.html',
    spec: 'docs/hla/nalar.architecture.json',
    langkah: [
      'Pakai pemilih tampilan di dalam diagram untuk memisahkan empat cerita itu.',
      'Klik satu simpul untuk menyorot jalur hulu–hilirnya.',
      'Buka satu tab penuh bila ingin mengekspor PNG/SVG.',
    ],
    catat: [
      'Dua batas digambar tegas: Vercel (tenggat 300 detik) dan VPS (proses panjang & model besar).',
      'Isolasi tenant ditegakkan database lewat RLS, bukan oleh kode aplikasi.',
    ],
  },
  {
    id: 'unggah-ingest',
    judul: 'Unggah berkas & ingest',
    jenis: 'workflow',
    ringkas: 'Enam langkah dari berkas di komputer sampai potongan yang bisa dicari — beserta dua cara ia gagal.',
    berkas: '/hla/unggah-ingest.html',
    spec: 'docs/hla/unggah-ingest.workflow.json',
    langkah: [
      'Knowledge → pilih knowledge base → Tambah sumber.',
      'Jenis sumber: "Unggah berkas dari komputer".',
      'Pilih berkas — total maksimal 4 MB per unggahan — lalu Tambah & sync.',
      'Baca ringkasannya: berapa masuk, berapa disimpan tanpa diingest, berapa dilewati.',
    ],
    catat: [
      '"Disimpan tanpa diingest" berarti berkasnya AMAN di penyimpanan, hanya teksnya belum terbaca.',
      'Tekan Sync pada sumber "Unggahan manual" untuk mencoba membaca ulang tanpa unggah ulang.',
      'Mengunggah nama berkas yang sama MENGGANTI isi lama, bukan menumpuk dua salinan.',
    ],
  },
  {
    id: 'tanya-jawab',
    judul: 'Tanya–jawab (jalur chat)',
    jenis: 'sequence',
    ringkas: 'Urutan satu giliran chat: gerbang keamanan, tiga kaki pencarian, lalu jawaban bersitasi yang mengalir.',
    berkas: '/hla/tanya-jawab.html',
    spec: 'docs/hla/tanya-jawab.sequence.json',
    langkah: [
      'Chatbots → buka chatbot → salin publicKey (cb_live_…).',
      'Isi "Domain diizinkan" sebelum menyebar kuncinya.',
      'Tempel potongan embed.js di situsmu, atau bagikan /c/{publicKey} apa adanya.',
      'Uji dari dasbor lewat halaman Chat.',
    ],
    catat: [
      'Gerbang berjalan lebih dulu: kunci, origin, batas laju, kuota — sebelum biaya pencarian dikeluarkan.',
      'Sumber dikirim SEBELUM teks, sehingga panel sitasi terisi saat jawaban masih mengalir.',
      'Mode kepatuhan ketat menjawab "tidak ada di dokumen" — itu jawaban yang benar, bukan kegagalan.',
    ],
  },
  {
    id: 'sync-konektor',
    judul: 'Sync konektor (delta)',
    jenis: 'workflow',
    ringkas: 'Drive/SharePoint/S3/Notion/Slack: listing murah dibandingkan manifest, lalu hanya yang berubah yang diunduh dan di-embed.',
    berkas: '/hla/sync-konektor.html',
    spec: 'docs/hla/sync-konektor.workflow.json',
    langkah: [
      'Settings → Connections → hubungkan akun Google atau Microsoft (sekali per akun).',
      'Knowledge → pilih KB → Tambah sumber → pilih penyedia, folder, atau tempel URL folder yang dibagikan.',
      'Sumber baru langsung disinkronkan; tekan Sync kapan pun untuk memeriksa perubahan.',
      'Baca statusnya: synced, partial (masih ada sisa), quota, atau error.',
    ],
    catat: [
      'Yang dibandingkan hanya metadata — Drive modifiedTime, Graph eTag — sehingga sync kedua jauh lebih murah.',
      'Listing yang terpotong TIDAK memicu penghapusan; berkas di luar jendela listing bukan berkas yang hilang.',
      'Format tak didukung disaring sebelum diunduh, dan status "quota" dibedakan dari "error" karena tindakannya berbeda.',
    ],
  },
  {
    id: 'memory-agent',
    judul: 'Memory Agent',
    jenis: 'workflow',
    ringkas: 'Dokumen diringkas jadi catatan ber-wikilink dan graf pengetahuan — lima lapis, dengan satu batas waktu yang menentukan.',
    berkas: '/hla/memory-agent.html',
    spec: 'docs/hla/memory-agent.workflow.json',
    langkah: [
      'Memory → pilih chatbot → Jalankan Agent untuk dokumen yang sudah terlanjur masuk.',
      'Unggahan baru dan assign KB memicunya sendiri — tak perlu ditekan.',
      'Bila mode tinjau menyala, catatan baru menunggu persetujuan: pakai Setujui semua.',
      'KB besar: jalankan `npm run memory:worker -- --chatbot=<nama>` dari VPS.',
    ],
    catat: [
      'Terukur di produksi: 25 dokumen → 116 catatan → 1.277 detik, jauh di atas tenggat 300 detik lambda.',
      'Catatan ditulis di L4 setelah SEMUA dokumen selesai — run yang terputus menyisakan nol catatan, bukan sebagian.',
      'Distill memanggil LLM sekali per dokumen; itu yang menentukan biaya maupun durasinya.',
    ],
  },
  {
    id: 'kategori-dokumen',
    judul: 'Kategori dokumen',
    jenis: 'workflow',
    ringkas: 'Taksonomi milik tenant: ditetapkan sekali saat meringkas, dan bisa dibereskan belakangan tanpa mengulang seluruh agen.',
    berkas: '/hla/kategori-dokumen.html',
    spec: 'docs/hla/kategori-dokumen.workflow.json',
    langkah: [
      'Kategori Dokumen → sunting daftarnya supaya cocok dengan jenis dokumen perusahaanmu.',
      'Usulan agen muncul berstatus "proposed" — setujui atau tolak di halaman yang sama.',
      'Kalau banyak dokumen menumpuk di "Belum dikategorikan", tekan Nilai ulang.',
    ],
    catat: [
      'Saat ingest kategori dinilai dari ISI dokumen dan gratis — ia menumpang panggilan distill yang memang sudah berjalan.',
      'Nilai ulang memakai RINGKASAN: lebih lemah, tapi cukup menjawab "ini dokumen jenis apa" dan jauh lebih murah.',
      'Hanya kategori yang KOSONG yang dinilai ulang; yang sudah diisi tak pernah disentuh.',
    ],
  },
  {
    id: 'kebijakan-jawaban',
    judul: 'Kebijakan jawaban chatbot',
    jenis: 'lifecycle',
    ringkas: 'Daur hidup satu jawaban: empat tuas per chatbot, rem anti-karangan, dan penegakan sitasi.',
    berkas: '/hla/kebijakan-jawaban.html',
    spec: 'docs/hla/kebijakan-jawaban.lifecycle.json',
    langkah: [
      'Chatbots → buka chatbot → bagian Kebijakan jawaban.',
      'Setel empat tuas: bahasa, nada, tingkat kepatuhan pada dokumen, dan suhu.',
      'Uji langsung di halaman Chat — kebijakan berlaku pada giliran berikutnya.',
    ],
    catat: [
      'Bot mengarang? Naikkan kepatuhan ke KETAT dan turunkan suhu.',
      'Bot terlalu sering menolak? Periksa dulu isi KB-nya — melonggarkan kepatuhan menutupi gejala, bukan sebab.',
      'Pada mode ketat, "tidak ada di dokumen" adalah jawaban yang BENAR, bukan kegagalan.',
    ],
  },
  {
    id: 'models-keys',
    judul: 'Models & Keys',
    jenis: 'workflow',
    ringkas: 'Memilih model chat & embedding, mendaftarkan server sendiri atau agregator, dan menyiapkan model cadangan.',
    berkas: '/hla/models-keys.html',
    spec: 'docs/hla/models-keys.workflow.json',
    langkah: [
      'Models & Keys → tab Kunci: isi API key provider yang dipakai.',
      'Tab Model: pilih satu model chat dan satu model embedding.',
      'Superadmin — tab Server: daftarkan endpoint OpenAI-compatible, lalu Test koneksi.',
      'Tab Server → Model cadangan: pilih model yang dipakai saat model aktif menolak.',
    ],
    catat: [
      'Model dari server sendiri berawalan vps: sehingga tak pernah bentrok dengan model cloud bernama sama.',
      'Kredensialnya milik SERVER, bukan kunci provider tenant — jangan diisi dua-duanya.',
      'Pilih cadangan yang BERBEDA dari model aktif; kalau sama, failover tak pernah menyala.',
    ],
  },
  {
    id: 'kuota-pembayaran',
    judul: 'Kuota & pembayaran',
    jenis: 'workflow',
    ringkas: 'Di mana batas paket diperiksa, apa yang terjadi saat tertabrak, dan bagaimana paket dinaikkan.',
    berkas: '/hla/kuota-pembayaran.html',
    spec: 'docs/hla/kuota-pembayaran.workflow.json',
    langkah: [
      'Usage → lihat pemakaian berjalan: potongan, penyimpanan, pesan bulan ini.',
      'Billing → pilih paket → bayar lewat gateway yang aktif.',
      'Superadmin: Billing → Kuota Paket untuk menimpa angka per paket tanpa deploy.',
    ],
    catat: [
      'Kuota diperiksa di service, bukan di satu rute — API v1 dan sync tunduk pada batas yang sama.',
      'Penolakan 402 menyebut angkanya (terpakai lawan batas), bukan sekadar "kuota habis".',
      'Yang membebaskan batas: mode on-premise dan tenant platform — PERAN superadmin sendiri tidak.',
    ],
  },
  {
    id: 'storage-byob',
    judul: 'Penyimpanan sendiri (BYOB)',
    jenis: 'workflow',
    ringkas: 'Menghubungkan bucket sendiri (S3/R2/MinIO/GCS/Azure) supaya berkas asli tinggal di infrastrukturmu.',
    berkas: '/hla/storage-byob.html',
    spec: 'docs/hla/storage-byob.workflow.json',
    langkah: [
      'Settings → Penyimpanan → pilih penyedia, isi bucket + kredensial.',
      'Tekan Uji koneksi, lalu jadikan penyimpanan bawaan.',
      'Tanpa BYOB unggahan tetap jalan — jatuh ke blob platform dari env.',
    ],
    catat: [
      'Hanya unggahan MANUAL yang menulis ke bucket; Drive/SharePoint tetap sync langsung tanpa menyalin berkas.',
      'Kunci objek memakai UUID + jalur berkas, jadi dua berkas sejudul tak pernah saling menimpa.',
      'Melepas koneksi menghapus kredensialnya dan tak bisa dipulihkan — berkas di sana berhenti bisa dibaca ulang.',
    ],
  },
  {
    id: 'api-v1',
    judul: 'API v1 & kunci',
    jenis: 'sequence',
    ringkas: 'Dua pintu masuk: kunci API milik satu tenant, dan token master server-ke-server yang boleh membuat tenant baru.',
    berkas: '/hla/api-v1.html',
    spec: 'docs/hla/api-v1.sequence.json',
    langkah: [
      'Settings → Integrations → API Keys → buat kunci; nilainya tampil SEKALI.',
      'Panggil dengan header Authorization: Bearer <kunci>.',
      'Kontrak lengkapnya OpenAPI 3.1 di GET /api/openapi.',
    ],
    catat: [
      'Kueri API berjalan di dalam withTenant — kunci yang bocor tak menjangkau tenant lain.',
      'Kuota paket berlaku identik; API bukan pintu belakang yang melewatinya.',
      'Kunci disimpan sebagai hash: hilang berarti dibuat ulang, bukan dilihat lagi.',
    ],
  },
  {
    id: 'team-divisi',
    judul: 'Orang & akses',
    jenis: 'workflow',
    ringkas: 'Pendaftaran terbuka tapi bergerbang: pending → disetujui superadmin → peran → divisi.',
    berkas: '/hla/team-divisi.html',
    spec: 'docs/hla/team-divisi.workflow.json',
    langkah: [
      'Team → antrean pendaftar → Setujui atau Tolak (khusus superadmin).',
      'Team → ubah peran anggota: admin ↔ member.',
      'Divisi → buat divisi, isi anggotanya, lalu tautkan chatbot ke divisi itu.',
    ],
    catat: [
      'Gerbangnya berlaku di DUA jalur: email-sandi dan Google/Microsoft. Melewatkan yang kedua membuat gerbangnya jadi hiasan.',
      'Akun pending ditolak persis seperti password salah — pesan berbeda akan membuat endpoint login bisa dipakai mendata email terdaftar.',
      'Peran menentukan yang boleh dilakukan; divisi menentukan chatbot dan konteks yang dilihat.',
    ],
  },
  {
    id: 'observability',
    judul: 'Jejak & peringatan',
    jenis: 'dataflow',
    ringkas: 'Dari kejadian ke orang yang bisa bertindak: audit, pemakaian, lalu saluran keluar Slack/webhook.',
    berkas: '/hla/observability.html',
    spec: 'docs/hla/observability.dataflow.json',
    langkah: [
      'Observability → kesehatan & aktivitas seluruh platform (superadmin).',
      'Usage → pemakaian tenant sendiri.',
      'Settings → Peringatan → tempel URL webhook Slack; Integrations → webhook keluar.',
    ],
    catat: [
      'Audit ditulis tiap giliran chat — itu yang membuat jawaban bisa ditelusuri ke sumbernya berbulan-bulan kemudian.',
      'Baris audit juga yang membuktikan run panjang benar-benar TUNTAS, bukan cuma dimulai.',
      'Peringatan sejenis diredam 6 jam: yang terlalu sering datang akan berhenti dibaca, dan saat itu ia berhenti berguna.',
    ],
  },
];

export const LABEL_JENIS: Record<Diagram['jenis'], string> = {
  architecture: 'Peta',
  workflow: 'Alur',
  sequence: 'Urutan',
  dataflow: 'Aliran data',
  lifecycle: 'Daur hidup',
};
