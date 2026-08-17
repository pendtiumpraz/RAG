/**
 * DATAROOM · DEK PROPOSAL UMKM LITE.
 *
 * Versi ringan "Nalar" yang DIJUAL ke usaha kecil-menengah (UMKM): warung,
 * toko, jasa, F&B, retail, klinik. Dipisah dari dek enterprise di `decks.ts`
 * karena pembacanya berbeda — pemilik UMKM, bukan tim IT.
 *
 * Fokus SATU hal yang bisa mereka pakai besok: chatbot layanan pelanggan
 * (CS) yang ditempel di website mereka, menjawab pertanyaan pelanggan 24 jam
 * dari dokumen/knowledge milik usaha mereka sendiri. Harga: Rp500.000/bulan.
 *
 * Nada ditulis SIMPLE dan non-teknis. Brand tetap Nalar (D4v3) — deep navy,
 * royal blue, emerald, amber — dan seluruh label berbahasa Indonesia.
 * Menggunakan jenis slide yang SAMA dengan dek lain (cover · bullets · flow ·
 * stats · table · twocol · closing) sehingga ikut dirender, dicetak ke PDF,
 * dan diekspor ke PPTX lewat sistem yang sama. Tanpa adegan beranimasi:
 * audience-nya tidak butuh detail arsitektur.
 */
import type { Slide } from './decks';

/** Harga publikasi UMKM Lite — per 2026, diputuskan Bos Galih. */
export const UMKM_HARGA = 'Rp500.000 / bulan';

/** Opsi untuk sedikit membuka pintu negosiasi tanpa mengubah inti tawaran. */
export const UMKM_TRIAL = '7 hari gratis — tanpa kartu, tanpa komitmen';

export const umkm: Slide[] = [
  { kind: 'cover', kicker: 'PROPOSAL UMKM LITE · NALAR', title: 'NALAR untuk UMKM',
    subtitle: 'Chatbot layanan pelanggan di website usaha Anda — menjawab pertanyaan pembeli 24 jam, dari dokumen usaha Anda sendiri. Tanpa ngoding, tanpa ribet.',
    foot: 'Enterprise Knowledge. Instant Intelligence.' },

  { kind: 'bullets', kicker: 'MASALAH', title: 'Pembeli bertanya di luar jam kerja — dan Anda tidak bisa menjawab semua',
    bullets: [
      'Pertanyaan yang sama berulang: harga, stok, jam buka, alamat, cara pesan, garansi',
      'Dijawab manual, pelan, dan kadang terlupa — pembeli pindah ke kompetitor',
      'WhatsApp penuh pada jam sibuk; admin kewalahan menjawab satu per satu',
      'Di media sosial, jawaban pertanyaan biasanya tidak konsisten antar-admin',
      'Belum ada tenaga yang bisa menerima telepon 24 jam nonstop',
    ],
    note: 'Pertanyaan berulang bukan masalah teknis — ini masalah kecepatan menjawab. Dan kecepatan menjawab menentukan apakah pembeli jadi beli.' },

  { kind: 'flow', kicker: 'SOLUSI', title: 'Chatbot CS di website Anda — dalam 3 langkah',
    steps: [
      { t: 'Ceritakan usaha Anda', d: 'langsung lewat obrolan dengan tim Nalar — apa yang dijual, harga, jam buka, cara pesan' },
      { t: 'Kami siapkan datanya', d: 'dokumen usaha Anda (katalog, daftar harga, FAQ) diubah jadi pengetahuan chatbot' },
      { t: 'Tempel ke website', d: 'satu baris kode kecil — chatbot pelanggan langsung aktif 24 jam' },
    ],
    note: 'Tidak perlu belajar teknologi. Yang perlu Anda lakukan hanya memberi tahu tim kami tentang usaha Anda.' },

  { kind: 'bullets', kicker: 'NILAI', title: 'Yang didapat pemilik usaha',
    bullets: [
      'Menjawab pertanyaan pembeli SECARA LANGSUNG dan konsisten, 24 jam sehari, 7 hari seminggu',
      'Jawaban selalu dari info usaha Anda sendiri — harga, stok, dan aturan yang Anda tetapkan',
      'Bisa menjawab ratusan pertanyaan bersamaan tanpa tambah karyawan',
      'Pelanggan dapat jawaban langsung bahkan setelah toko tutup',
      'Pemilik tetap pegang kendali: Anda yang menentukan apa yang dikatakan chatbot',
    ],
    note: 'Chatbot ini bukan pengganti Anda — ia rekan sambilan yang menjawab pertanyaan rutin, supaya Anda fokus melayani pelanggan yang benar-benar butuh manusia.' },

  { kind: 'twocol', kicker: 'SIAPA', title: 'Cocok untuk usaha kecil-menengah',
    cols: [
      { h: 'Jenis usaha', bullets: [
        'Warung & toko kelontong',
        'Makanan & minuman (F&B)',
        'Retail & fashion',
        'Jasa (bengkel, salon, laundry)',
        'Klinik & apotek kecil',
        'Jasa fotokopi, percetakan, laundry',
      ] },
      { h: 'Yang bisa ditanyakan pelanggan', bullets: [
        '"Harga paketnya berapa?"',
        '"Kalian buka jam berapa?"',
        '"Stok ukuran M masih ada?"',
        '"Cara pesan/order-nya gimana?"',
        '"Ada garansi atau retur?"',
        '"Alamat & cara sampai ke sana?"',
      ] },
    ],
    note: 'Ideal bagi usaha yang sudah punya website atau toko online dan ingin pembeli diberi jawaban cepat setiap saat.' },

  { kind: 'table', kicker: 'HARGA', title: 'Paket UMKM Lite — satu harga, semua sudah termasuk',
    headers: ['Isi paket', 'Keuntungan'],
    rows: [
      ['Chatbot CS untuk 1 website', 'pelanggan dapat jawaban langsung di situs Anda'],
      ['Menjawab dari dokumen usaha Anda', 'harga, katalog, FAQ, aturan Anda sendiri'],
      ['Aktif 24 jam / 7 hari', 'tidak ada jam tutup untuk pertanyaan umum'],
      ['Persiapan data oleh tim Nalar', 'Anda tidak perlu menyiapkan apa pun'],
      ['Dukungan bantuan', 'ada tim yang siap membantu bila perlu'],
      ['Harga tetap', `Rp500.000 / bulan — tanpa biaya tersembunyi, bisa berhenti kapan pun`],
    ],
    note: UMKM_TRIAL + ' — coba dulu sebelum berlangganan penuh.' },

  { kind: 'stats', kicker: 'HARGA', title: 'Rp500.000 / bulan — modal kecil untuk layanan 24 jam',
    stats: [
      { v: 'Rp500.000', l: 'per bulan', n: 'harga tetap, semua sudah termasuk' },
      { v: '24/7', l: 'selalu siaga', n: 'menjawab pertanyaan pelanggan kapan pun' },
      { v: '1 website', l: 'terpasang', n: 'satu usaha, satu identitas' },
      { v: '7 hari', l: 'coba gratis', n: 'tanpa kartu, tanpa komitmen' },
    ],
    note: 'Bandingkan dengan biaya seorang admin penuh waktu — atau dengan calon pembeli yang pergi karena tidak dijawab. Rp500rb/bulan adalah cara paling murah untuk tidak kehilangan satu pesanan pun karena pertanyaan tidak dijawab.' },

  { kind: 'table', kicker: 'PERBANDINGAN', title: 'NALAR Enterprise vs NALAR UMKM Lite',
    headers: ['Kebutuhan', 'Enterprise', 'UMKM Lite'],
    rows: [
      ['Penyimpanan knowledge', '1 TB (besar, lintas divisi)', 'cukup untuk dokumen usaha Anda'],
      ['Jumlah chatbot/website', 'banyak, multi-divisi', '1 chatbot untuk 1 website'],
      ['Kebutuhan teknis', 'tim IT & server khusus', 'tidak perlu teknis sama sekali'],
      ['Model bahasa', 'bebas pilih, bisa on-premise', 'diatur penuh oleh tim Nalar'],
      ['Harga', 'disesuaikan (perusahaan)', UMKM_HARGA],
    ],
    note: 'Dua-duanya mesin Nalar yang sama dan terpercaya — hanya porsinya disesuaikan. Usaha besar butuh kapasitas besar; UMKM cukup yang ringan dan mudah.' },

  { kind: 'bullets', kicker: 'KENAPA NALAR', title: 'Kenapa percaya pada NALAR, bukan sekadar chatbot biasa',
    bullets: [
      'Jawaban SELALU dari dokumen usaha Anda sendiri — harga dan aturan yang Anda tetapkan, bukan karangan',
      'Merek Nalar yang sama dipakai perusahaan besar — Enterprise Knowledge. Instant Intelligence.',
      'Setiap jawaban bisa ditelusuri ke sumbernya — Anda tahu dari mana chatbot mendapat informasi',
      'Data usaha Anda dijaga — informasi pelanggan dan penjualan tidak bocor keluar',
      'Terus diperbarui dan dipelihara oleh tim kami — Anda tinggal menikmati',
    ],
    note: 'Anda membeli robot penjaga toko yang selalu siap, yang hanya tahu — dan hanya boleh bicara — sesuai info usaha Anda.' },

  { kind: 'closing', title: 'Jawab pembeli lebih cepat. Jual lebih banyak.',
    subtitle: 'Mulai dengan 7 hari gratis. Jika cocok, Rp500.000/bulan — dan pelanggan Anda tidak akan pernah lagi menunggu jawaban di luar jam buka.',
    foot: 'NALAR — Enterprise Knowledge. Instant Intelligence.' },
];
