/**
 * KORPUS SINTETIS BESAR — bahan untuk mengukur recall lapisan pertama.
 *
 * Kenapa dibuat, bukan dipinjam: korpus produksi berisi 76 potongan. Angka
 * recall di 76 potongan tidak membuktikan apa pun tentang 200.000, karena
 * yang hendak diukur justru gejala yang HANYA muncul saat korpusnya besar —
 * dokumen yang bertetangga rapat sehingga centroid-nya saling menutupi.
 *
 * Kenapa TEKS, bukan vektor acak: mensimulasikan geometri embedding dengan
 * vektor acak akan menjawab pertanyaan yang salah. Vektor acak di 384 dimensi
 * saling tegak lurus hampir sempurna, jadi dokumen yang benar SELALU menang
 * dan recall-nya keluar 100% — jawaban yang menenangkan dan tak ada
 * hubungannya dengan korpus sungguhan. Kesulitan lapisan pertama lahir dari
 * dokumen yang MIRIP, dan kemiripan itu hanya nyata kalau teksnya nyata dan
 * modelnya yang menilai.
 *
 * BENTUK KORPUS. Empat rumpun dokumen (kontrak, SOP, kebijakan SDM, laporan
 * keuangan). Di dalam satu rumpun, dokumen nyaris kembar: struktur, kalimat
 * pembuka, dan istilahnya sama — yang membedakan hanya nama pihak, angka, dan
 * tanggal. Itu memang KASUS SULIT, dan disengaja: basis pengetahuan
 * perusahaan sungguhan justru berbentuk begitu (ratusan kontrak dengan
 * template yang sama), dan di situlah lapisan pertama paling mungkin gagal.
 *
 * Tiap bagian memuat SATU fakta yang tak ada di bagian lain mana pun di
 * seluruh korpus, beserta pertanyaan yang hanya bisa dijawab oleh bagian itu.
 * Itulah yang membuat "dokumen yang benar" punya arti tunggal — tanpa itu,
 * recall tak bisa dihitung karena tak ada kunci jawaban.
 */

export interface PotonganSintetis {
  /** Nomor potongan di dalam dokumennya (0-based) — sejajar `metadata.chunk`. */
  nomor: number;
  teks: string;
  /**
   * Pertanyaan yang sama, tapi menyebut dokumennya dengan KATA-KATA alih-alih
   * kode registernya — cara orang bertanya kalau tak memegang nomornya.
   *
   * Inilah kasus yang belum pernah diukur: kaki leksikal menyelamatkan
   * pencarian di korpus bertemplate justru karena kodenya langka, dan
   * pertanyaan tanpa kode kehilangan penyelamat itu. null untuk potongan
   * pengisi.
   */
  tanyaKata?: string | null;
  /**
   * Pertanyaan yang HANYA dijawab potongan ini, atau null untuk potongan
   * pengisi. Pengisi bukan hiasan: ia MENENTUKAN hasil, karena centroid
   * produksi adalah rata-rata 50 potongan — potongan pengisi itulah yang
   * mengencerkan sinyal potongan yang membawa jawaban.
   */
  tanya: string | null;
}

export interface DokumenSintetis {
  docRef: string;
  judul: string;
  rumpun: string;
  potongan: PotonganSintetis[];
}

/**
 * Potongan per dokumen.
 *
 * Angka ini yang membuat pengukurannya berarti. Dokumen berisi 4 potongan
 * memberi satu potongan per bagian, jadi centroid bagiannya SAMA DENGAN
 * vektor potongannya — dan perata-rataan, satu-satunya langkah yang benar
 * benar bisa merusak lapisan pertama, tak pernah terjadi. Pengukuran seperti
 * itu selalu melaporkan lapisan pertama tanpa cacat, dan laporannya nyaris
 * tautologi: potongan yang masuk 12 teratas datar mustahil punya lebih dari
 * 11 dokumen pesaing.
 *
 * 60 potongan memberi satu bagian penuh (50) plus sisa — persis bentuk yang
 * dihasilkan `document-vectors.service.ts`.
 */
export const POTONGAN_PER_DOK = 60;

const RUMPUN = ['kontrak', 'sop', 'sdm', 'keuangan'] as const;

const KOTA = ['Jakarta', 'Surabaya', 'Bandung', 'Medan', 'Makassar', 'Semarang',
  'Palembang', 'Denpasar', 'Balikpapan', 'Pontianak', 'Manado', 'Padang'];
const BIDANG = ['konstruksi', 'logistik', 'perkebunan', 'manufaktur', 'ritel',
  'perikanan', 'pertambangan', 'telekomunikasi', 'farmasi', 'percetakan'];
const SUKU = ['Arta', 'Bahari', 'Cakra', 'Dirgantara', 'Eka', 'Fajar', 'Giri',
  'Harta', 'Indra', 'Jaya', 'Kirana', 'Lestari', 'Mandiri', 'Nusa', 'Oasis',
  'Purnama', 'Rembulan', 'Sentosa', 'Tirta', 'Utama', 'Wijaya', 'Yudha'];
const AKHIRAN = ['Sejahtera', 'Abadi', 'Perkasa', 'Gemilang', 'Makmur',
  'Nusantara', 'Persada', 'Raya', 'Bersama', 'Cemerlang'];

/**
 * Acak DETERMINISTIK (mulberry32).
 *
 * Korpusnya harus sama persis tiap kali dijalankan — kalau tidak, dua angka
 * recall yang dibandingkan berasal dari dua korpus berbeda, dan selisihnya
 * tak berarti apa-apa.
 */
export function acakan(benih: number): () => number {
  let a = benih >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pilih<T>(r: () => number, xs: readonly T[]): T { return xs[Math.floor(r() * xs.length)]; }

function namaPT(r: () => number): string {
  return `PT ${pilih(r, SUKU)} ${pilih(r, AKHIRAN)}`;
}

/** Rupiah dengan pemisah ribuan — bentuk yang benar-benar muncul di dokumen. */
function rupiah(n: number): string {
  return `Rp${n.toLocaleString('id-ID')}`;
}

function bagianKontrak(r: () => number, i: number): { judul: string; fakta: PotonganSintetis[] } {
  const a = namaPT(r), b = namaPT(r);
  const kota = pilih(r, KOTA), bidang = pilih(r, BIDANG);
  const nilai = (Math.floor(r() * 900) + 100) * 1_000_000;
  const bulan = Math.floor(r() * 24) + 6;
  const denda = (Math.floor(r() * 40) + 5) / 100;
  const kodePerkara = `ARB-${1000 + i}`;
  const pembuka = `Perjanjian kerja sama ini dibuat dan ditandatangani di ${kota} antara ${a} sebagai pihak pertama dan ${b} sebagai pihak kedua, keduanya bergerak di bidang ${bidang}. Nomor register perjanjian ini adalah ${kodePerkara}.`;
  return {
    judul: `Perjanjian Kerja Sama ${a} dan ${b} (${kodePerkara})`,
    fakta: [
      { nomor: 0,
        teks: `${pembuka} Pasal 1 Nilai Pekerjaan. Nilai keseluruhan pekerjaan yang disepakati dalam perjanjian ${kodePerkara} adalah ${rupiah(nilai)} termasuk pajak pertambahan nilai. Pembayaran dilakukan dalam tiga termin sesuai kemajuan pekerjaan yang diverifikasi bersama oleh kedua pihak.`,
        tanya: `Berapa nilai keseluruhan pekerjaan dalam perjanjian ${kodePerkara}?`,
        tanyaKata: `Berapa nilai pekerjaan dalam perjanjian antara ${a} dan ${b}?` },
      { nomor: 1,
        teks: `${pembuka} Pasal 2 Jangka Waktu. Perjanjian ${kodePerkara} berlaku selama ${bulan} bulan terhitung sejak tanggal penandatanganan dan dapat diperpanjang atas kesepakatan tertulis kedua pihak. Perpanjangan diajukan paling lambat tiga puluh hari sebelum masa berlaku berakhir.`,
        tanya: `Berapa bulan masa berlaku perjanjian ${kodePerkara}?`,
        tanyaKata: `Berapa bulan masa berlaku perjanjian antara ${a} dan ${b}?` },
      { nomor: 2,
        teks: `${pembuka} Pasal 3 Denda Keterlambatan. Apabila pihak kedua terlambat menyelesaikan pekerjaan, dikenakan denda sebesar ${denda}% dari nilai pekerjaan untuk setiap hari keterlambatan dalam perjanjian ${kodePerkara}, dengan denda maksimum lima persen dari nilai keseluruhan.`,
        tanya: `Berapa persen denda keterlambatan per hari dalam perjanjian ${kodePerkara}?`,
        tanyaKata: `Berapa persen denda keterlambatan per hari dalam perjanjian ${a} dengan ${b}?` },
      { nomor: 3,
        teks: `${pembuka} Pasal 4 Penyelesaian Sengketa. Segala perselisihan yang timbul dari perjanjian ${kodePerkara} diselesaikan secara musyawarah, dan bila tidak tercapai kesepakatan, diselesaikan melalui Badan Arbitrase Nasional Indonesia perwakilan ${kota} sesuai peraturan yang berlaku.`,
        tanya: `Di kota mana sengketa perjanjian ${kodePerkara} diselesaikan?`,
        tanyaKata: `Di kota mana sengketa antara ${a} dan ${b} diselesaikan?` },
    ],
  };
}

function bagianSop(r: () => number, i: number): { judul: string; fakta: PotonganSintetis[] } {
  const proses = pilih(r, ['penerimaan barang', 'kalibrasi alat', 'penanganan keluhan',
    'pemeliharaan mesin', 'pengiriman ekspor', 'audit internal']);
  const kode = `SOP-${2000 + i}`;
  const jam = Math.floor(r() * 20) + 2;
  const suhu = Math.floor(r() * 25) + 2;
  const unit = pilih(r, ['Gudang', 'Produksi', 'Mutu', 'Logistik', 'Teknik']);
  const pembuka = `Prosedur operasional baku ${kode} mengatur ${proses} pada unit ${unit}. Dokumen ini wajib dipatuhi seluruh petugas yang terlibat dan ditinjau ulang setiap tahun.`;
  return {
    judul: `Prosedur Operasional Baku ${kode} — ${proses}`,
    fakta: [
      { nomor: 0,
        teks: `${pembuka} Bagian 1 Ruang Lingkup. Prosedur ${kode} berlaku untuk seluruh kegiatan ${proses} yang dilakukan unit ${unit}, termasuk kegiatan yang dialihdayakan kepada pihak ketiga di bawah pengawasan unit tersebut.`,
        tanya: `Unit mana yang menjalankan prosedur ${kode}?`,
        tanyaKata: `Unit mana yang menjalankan prosedur ${proses}?` },
      { nomor: 1,
        teks: `${pembuka} Bagian 2 Batas Waktu. Setiap tahapan dalam prosedur ${kode} harus diselesaikan paling lambat ${jam} jam sejak permintaan diterima. Keterlambatan wajib dilaporkan kepada penyelia beserta alasannya pada hari yang sama.`,
        tanya: `Berapa jam batas penyelesaian tahapan dalam prosedur ${kode}?`,
        tanyaKata: `Berapa jam batas penyelesaian tahapan ${proses} di unit ${unit}?` },
      { nomor: 2,
        teks: `${pembuka} Bagian 3 Kondisi Penyimpanan. Barang yang ditangani dalam prosedur ${kode} disimpan pada suhu ${suhu} derajat Celsius dengan kelembapan terkendali, dan dicatat dua kali sehari pada kartu pemantauan.`,
        tanya: `Pada suhu berapa barang disimpan menurut prosedur ${kode}?`,
        tanyaKata: `Pada suhu berapa barang disimpan pada ${proses} di unit ${unit}?` },
      { nomor: 3,
        teks: `${pembuka} Bagian 4 Rekaman. Seluruh rekaman prosedur ${kode} disimpan sekurang-kurangnya lima tahun dan dapat diakses auditor internal maupun eksternal tanpa persetujuan tambahan dari unit ${unit}.`,
        tanya: `Berapa lama rekaman prosedur ${kode} disimpan?`,
        tanyaKata: `Berapa lama rekaman ${proses} di unit ${unit} disimpan?` },
    ],
  };
}

function bagianSdm(r: () => number, i: number): { judul: string; fakta: PotonganSintetis[] } {
  const kode = `HR-${3000 + i}`;
  const jabatan = pilih(r, ['staf', 'penyelia', 'manajer', 'analis', 'teknisi']);
  const cuti = Math.floor(r() * 12) + 12;
  const tunjangan = (Math.floor(r() * 40) + 10) * 100_000;
  const kota = pilih(r, KOTA);
  const pembuka = `Kebijakan sumber daya manusia ${kode} mengatur hak dan kewajiban karyawan berstatus ${jabatan} pada kantor ${kota}.`;
  return {
    judul: `Kebijakan SDM ${kode} — ${jabatan} ${kota}`,
    fakta: [
      { nomor: 0,
        teks: `${pembuka} Bab 1 Hak Cuti. Karyawan ${jabatan} yang tunduk pada kebijakan ${kode} berhak atas ${cuti} hari cuti tahunan yang dapat diambil setelah masa percobaan selesai, dan sisa cuti tidak dapat diuangkan.`,
        tanya: `Berapa hari cuti tahunan menurut kebijakan ${kode}?`,
        tanyaKata: `Berapa hari cuti tahunan karyawan ${jabatan} di kantor ${kota}?` },
      { nomor: 1,
        teks: `${pembuka} Bab 2 Tunjangan Transportasi. Kebijakan ${kode} menetapkan tunjangan transportasi sebesar ${rupiah(tunjangan)} per bulan, dibayarkan bersama gaji pokok dan disesuaikan bila karyawan dipindahtugaskan.`,
        tanya: `Berapa tunjangan transportasi dalam kebijakan ${kode}?`,
        tanyaKata: `Berapa tunjangan transportasi karyawan ${jabatan} di kantor ${kota}?` },
      { nomor: 2,
        teks: `${pembuka} Bab 3 Jam Kerja. Jam kerja yang diatur kebijakan ${kode} adalah empat puluh jam sepekan dengan pengaturan fleksibel yang disetujui atasan langsung, dan kehadiran dicatat melalui sistem presensi kantor ${kota}.`,
        tanya: `Di kantor kota mana kebijakan ${kode} diberlakukan?`,
        tanyaKata: `Di kantor kota mana kebijakan untuk ${jabatan} itu diberlakukan?` },
      { nomor: 3,
        teks: `${pembuka} Bab 4 Peninjauan. Kebijakan ${kode} ditinjau setiap dua tahun oleh komite yang beranggotakan perwakilan manajemen dan perwakilan karyawan, dan perubahannya diumumkan tiga puluh hari sebelum berlaku.`,
        tanya: `Berapa tahun sekali kebijakan ${kode} ditinjau?`,
        tanyaKata: `Berapa tahun sekali kebijakan ${jabatan} di ${kota} ditinjau?` },
    ],
  };
}

function bagianKeuangan(r: () => number, i: number): { judul: string; fakta: PotonganSintetis[] } {
  const kode = `LK-${4000 + i}`;
  const tahun = 2018 + Math.floor(r() * 8);
  const pendapatan = (Math.floor(r() * 900) + 100) * 1_000_000_000;
  const laba = Math.floor(pendapatan * (r() * 0.2 + 0.02));
  const pt = namaPT(r);
  const pembuka = `Laporan keuangan ${kode} milik ${pt} untuk tahun buku ${tahun} disusun sesuai standar akuntansi keuangan yang berlaku di Indonesia dan telah diaudit.`;
  return {
    judul: `Laporan Keuangan ${kode} — ${pt} ${tahun}`,
    fakta: [
      { nomor: 0,
        teks: `${pembuka} Bagian 1 Pendapatan. Pendapatan usaha yang dilaporkan dalam ${kode} mencapai ${rupiah(pendapatan)} sepanjang tahun buku, tumbuh dibanding tahun sebelumnya terutama dari segmen penjualan langsung.`,
        tanya: `Berapa pendapatan usaha yang dilaporkan dalam ${kode}?`,
        tanyaKata: `Berapa pendapatan usaha ${pt} pada tahun buku ${tahun}?` },
      { nomor: 1,
        teks: `${pembuka} Bagian 2 Laba Bersih. Laba bersih setelah pajak dalam laporan ${kode} tercatat ${rupiah(laba)}, setelah memperhitungkan beban bunga dan penyisihan piutang tak tertagih.`,
        tanya: `Berapa laba bersih setelah pajak dalam laporan ${kode}?`,
        tanyaKata: `Berapa laba bersih setelah pajak ${pt} tahun ${tahun}?` },
      { nomor: 2,
        teks: `${pembuka} Bagian 3 Opini Auditor. Auditor independen memberikan opini wajar tanpa pengecualian atas laporan ${kode} untuk tahun buku ${tahun}, tanpa paragraf penekanan suatu hal.`,
        tanya: `Untuk tahun buku berapa opini auditor atas laporan ${kode} diberikan?`,
        tanyaKata: `Untuk tahun buku berapa opini auditor atas laporan ${pt} diberikan?` },
      { nomor: 3,
        teks: `${pembuka} Bagian 4 Peristiwa Setelah Periode. Tidak terdapat peristiwa setelah periode pelaporan yang berdampak material terhadap laporan ${kode} selain perubahan susunan pengurus ${pt} yang telah diumumkan.`,
        tanya: `Perusahaan mana yang menerbitkan laporan ${kode}?`,
        tanyaKata: `Perusahaan mana yang menerbitkan laporan keuangan tahun buku ${tahun} itu?` },
    ],
  };
}

/**
 * Klausa PENGISI — isi dokumen selain empat potongan berfakta.
 *
 * Dibuat dari kalimat baku yang benar-benar memenuhi dokumen sungguhan
 * (ketentuan umum, kerahasiaan, keadaan kahar, pemberitahuan) dan TIDAK
 * memuat fakta unik apa pun. Perannya justru itu: potongan-potongan inilah
 * yang ikut dirata-ratakan ke dalam centroid bagian, sehingga potongan yang
 * membawa jawaban hanya menyumbang seperlima puluh arah centroid-nya.
 */
const KLAUSA = [
  'Para pihak sepakat menjaga kerahasiaan seluruh informasi yang diperoleh sehubungan dengan pelaksanaan dokumen ini dan tidak mengungkapkannya kepada pihak ketiga tanpa persetujuan tertulis.',
  'Segala pemberitahuan yang diperlukan disampaikan secara tertulis melalui surat tercatat atau surat elektronik ke alamat resmi yang tercantum pada bagian identitas.',
  'Keadaan kahar meliputi bencana alam, kebakaran, huru-hara, perang, dan kebijakan pemerintah yang secara langsung menghalangi pelaksanaan kewajiban salah satu pihak.',
  'Pihak yang mengalami keadaan kahar wajib memberitahukan kejadian tersebut paling lambat tujuh hari kalender sejak kejadian, disertai bukti yang memadai.',
  'Dokumen ini tidak dapat dialihkan sebagian maupun seluruhnya kepada pihak lain tanpa persetujuan tertulis terlebih dahulu dari pihak yang berkepentingan.',
  'Perubahan atas ketentuan dalam dokumen ini hanya sah apabila dibuat secara tertulis dan ditandatangani oleh wakil yang berwenang dari masing-masing pihak.',
  'Apabila salah satu ketentuan dinyatakan tidak sah oleh putusan yang berkekuatan hukum tetap, ketentuan lainnya tetap berlaku sepanjang tidak bertentangan.',
  'Seluruh biaya yang timbul dari pembuatan dokumen ini ditanggung bersama secara proporsional kecuali ditentukan lain secara tertulis oleh para pihak.',
  'Para pihak menjamin bahwa wakil yang menandatangani dokumen ini memiliki kewenangan penuh dan telah memperoleh persetujuan internal yang diperlukan.',
  'Dokumen ini tunduk pada hukum negara Republik Indonesia dan ditafsirkan sesuai peraturan perundang-undangan yang berlaku pada saat penerapannya.',
  'Setiap pihak wajib memelihara catatan pelaksanaan yang lengkap dan menyerahkan salinannya apabila diminta untuk keperluan pemeriksaan atau audit.',
  'Pelaksanaan kewajiban dievaluasi secara berkala oleh perwakilan kedua pihak dan hasilnya dituangkan dalam berita acara yang ditandatangani bersama.',
];

function pengisi(r: () => number, kode: string, nomor: number): PotonganSintetis {
  const a = KLAUSA[Math.floor(r() * KLAUSA.length)];
  const b = KLAUSA[Math.floor(r() * KLAUSA.length)];
  return {
    nomor,
    // Kode dokumen tetap disebut: dokumen sungguhan memang mengulang
    // penomorannya di tiap halaman, dan itu justru yang membuat seluruh
    // potongan satu dokumen saling mirip.
    teks: `Ketentuan lanjutan dokumen ${kode}. ${a} ${b}`,
    tanya: null,
  };
}

/**
 * Sisipkan potongan berfakta ke dalam dokumen sepanjang POTONGAN_PER_DOK.
 *
 * Posisinya disebar, bukan ditumpuk di depan: tiga potongan berfakta jatuh
 * di bagian pertama (potongan 0–49, dirata-ratakan bersama 47 pengisi) dan
 * satu di bagian kedua. Menaruh semuanya di depan akan membuat satu bagian
 * penuh berisi jawaban dan bagian lain kosong — bentuk yang tak pernah
 * muncul di dokumen sungguhan.
 */
function susun(r: () => number, fakta: PotonganSintetis[], kode: string): PotonganSintetis[] {
  const posisi = [5, 22, 41, 55].slice(0, fakta.length);
  const keluar: PotonganSintetis[] = [];
  for (let i = 0; i < POTONGAN_PER_DOK; i++) {
    const iF = posisi.indexOf(i);
    keluar.push(iF >= 0 ? { ...fakta[iF], nomor: i } : pengisi(r, kode, i));
  }
  return keluar;
}

/**
 * Bangun korpus berisi `jumlah` dokumen, empat rumpun berselang-seling.
 *
 * Deterministik terhadap `benih`: dokumen ke-i selalu sama, jadi korpus 1.000
 * dokumen adalah AWALAN persis dari korpus 10.000. Sifat itu yang membuat
 * kurva recall-terhadap-ukuran bisa dibaca — pada tiap titik yang bertambah
 * hanyalah pengganggunya, bukan pertanyaannya.
 */
export function bangunKorpus(jumlah: number, benih = 7): DokumenSintetis[] {
  const keluar: DokumenSintetis[] = [];
  for (let i = 0; i < jumlah; i++) {
    // Acakan per dokumen, bukan satu aliran untuk seluruh korpus: kalau satu
    // aliran, menambah dokumen akan menggeser isi dokumen sebelumnya.
    const r = acakan(benih * 1_000_003 + i);
    const rumpun = RUMPUN[i % RUMPUN.length];
    const b = rumpun === 'kontrak' ? bagianKontrak(r, i)
      : rumpun === 'sop' ? bagianSop(r, i)
      : rumpun === 'sdm' ? bagianSdm(r, i)
      : bagianKeuangan(r, i);
    const kode = b.fakta[0].tanya!.match(/(ARB|SOP|HR|LK)-\d+/)![0];
    keluar.push({
      docRef: `${rumpun}/${i}`, judul: b.judul, rumpun,
      potongan: susun(r, b.fakta, kode),
    });
  }
  return keluar;
}
