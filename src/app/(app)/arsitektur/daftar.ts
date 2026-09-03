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
];

export const LABEL_JENIS: Record<Diagram['jenis'], string> = {
  architecture: 'Peta',
  workflow: 'Alur',
  sequence: 'Urutan',
  dataflow: 'Aliran data',
  lifecycle: 'Daur hidup',
};
