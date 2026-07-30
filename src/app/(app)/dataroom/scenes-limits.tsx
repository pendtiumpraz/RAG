/**
 * ADEGAN BATAS & KAPASITAS untuk dek HLA.
 *
 * Angka langganan DIIMPOR dari `core/limits.ts` — yang benar-benar ditegakkan
 * kode, bukan diketik ulang di slide. Kalau kuotanya diubah, slide ikut, dan
 * presentasi tak pernah menjanjikan sesuatu yang produknya tak lakukan.
 *
 * Angka kapasitas server diturunkan dari SATU pengukuran nyata: 8.189 byte
 * per potongan di tabel (diukur dengan pg_column_size pada data produksi) dan
 * ±1.570 byte per potongan untuk indeks berdimensi asli. Semua sisanya
 * aritmetika dari dua angka itu — dan asumsinya ditulis di slide, bukan
 * disembunyikan.
 */
import { PLAN_LIMITS } from '@/modules/core/limits';

const BIRU = '#2563EB';
const AMBER = '#F59E0B';
const HIJAU = '#059669';
const ABU = '#94A3B8';

/* ── batas langganan ────────────────────────────────────────────────── */

const PLAN_LABEL: Record<string, string> = {
  free: 'Free', pro: 'Pro', enterprise: 'Enterprise', onprem: 'On-Premise',
};

const angka = (n: number) =>
  n === Infinity ? 'tanpa batas' : n.toLocaleString('id-ID');

/** ±680 karakter per potongan — angka yang sama dengan slide penyimpanan. */
const CHAR_PER_POTONGAN = 680;
/** Bagian berkas kantoran yang benar-benar jadi teks (nilai tengah). */
const RASIO_TEKS = 0.02;

const ringkas = (n: number) =>
  n === Infinity ? '∞'
    : n >= 1e6 ? `${(n / 1e6).toFixed(n < 1e7 ? 1 : 0).replace('.', ',')} jt`
    : n >= 1e3 ? `${Math.round(n / 1e3)} rb`
    : String(n);

/** Kuota potongan → perkiraan berkas sumber yang muat. */
const setaraBerkas = (potongan: number) => {
  if (potongan === Infinity) return '∞';
  const byte = (potongan * CHAR_PER_POTONGAN) / RASIO_TEKS;
  return byte >= 1e12 ? `${(byte / 1e12).toFixed(1).replace('.', ',')} TB`
    : byte >= 1e9 ? `${Math.round(byte / 1e9)} GB`
    : `${Math.round(byte / 1e6)} MB`;
};

export function ScenePlans() {
  const plans = ['free', 'pro', 'enterprise', 'onprem'];
  /* SEMUA baris membaca PLAN_LIMITS. Dua baris terbawah dulu ditulis mati
     sebagai "tanpa batas" — dan begitu kuotanya benar-benar dipasang, slide
     ini jadi berbohong tanpa ada yang menyadarinya. Slide yang mengutip
     konstanta tak bisa tertinggal dari kodenya. */
  const kolom = [
    { t: 'Pesan / bulan', f: (p: string) => angka(PLAN_LIMITS[p].messagesPerMonth) },
    { t: 'Chatbot', f: (p: string) => angka(PLAN_LIMITS[p].maxChatbots) },
    { t: 'Anggota tim', f: (p: string) => angka(PLAN_LIMITS[p].maxMembers) },
    { t: 'Laju (burst)', f: (p: string) => `${PLAN_LIMITS[p].chatBurst}/detik` },
    { t: 'Knowledge base', f: (p: string) => angka(PLAN_LIMITS[p].maxKnowledgeBases) },
    { t: 'Potongan dokumen', f: (p: string) => ringkas(PLAN_LIMITS[p].maxChunks) },
    {
      t: 'Setara berkas sumber',
      f: (p: string) => setaraBerkas(PLAN_LIMITS[p].maxChunks),
    },
  ];

  /* Geometri ditulis sebagai konstanta, bukan angka yang bertebaran. Versi
     sebelumnya menaruh enam baris tabel yang berakhir di y=242 di atas kotak
     catatan yang mulai di y=200 — keduanya bertumpuk dan tak terbaca. Dengan
     tinggi baris dan titik akhir yang dihitung, tabrakan semacam itu tak bisa
     terjadi diam-diam lagi. */
  const Y_TABEL = 66;
  const H_BARIS = 26;
  const Y_AKHIR = Y_TABEL + kolom.length * H_BARIS;   // 66 + 6×26 = 222
  const Y_CATATAN = Y_AKHIR + 12;                      // 234

  return (
    <svg viewBox={`0 0 760 ${Y_CATATAN + 48}`} role="img"
      aria-label="Batas tiap paket langganan: pesan per bulan, chatbot, anggota tim, laju, knowledge base, potongan dokumen, dan perkiraan berkas sumber yang setara">
      <text x="0" y="12" className="sc-k">yang benar-benar ditegakkan kode · bukan janji brosur</text>

      {/* kepala kolom */}
      {plans.map((p, i) => (
        <g key={p} className="an-in" style={{ ['--d' as string]: `${0.1 + i * 0.1}s` }}>
          <rect x={216 + i * 138} y={24} width={130} height={24} rx="5"
            fill={p === 'onprem' ? '#0F172A' : '#F8FAFC'}
            stroke={p === 'onprem' ? '#0F172A' : '#D8E0EA'} strokeWidth="1.5" />
          <text x={281 + i * 138} y={40} textAnchor="middle"
            className={`sc-t ${p === 'onprem' ? 'sc-w' : ''}`}>{PLAN_LABEL[p]}</text>
        </g>
      ))}

      {kolom.map((k, r) => {
        const y = Y_TABEL + r * H_BARIS;
        // Baris terakhir adalah TERJEMAHAN, bukan kuota — dibedakan supaya
        // tak ada yang mengira "68 GB" itu angka yang ditegakkan kode.
        const turunan = k.t === 'Setara berkas sumber';
        return (
          <g key={k.t} className="an-in" style={{ ['--d' as string]: `${0.5 + r * 0.1}s` }}>
            <line x1="0" y1={y + 8} x2="760" y2={y + 8} stroke="#EEF2F7" strokeWidth="1" />
            <text x="0" y={y} className={turunan ? 'sc-s' : 'sc-t'}>{k.t}</text>
            {turunan && (
              <text x={k.t.length * 6.2 + 12} y={y} className="sc-k">perkiraan, bukan kuota</text>
            )}
            {plans.map((p, i) => (
              <text key={p} x={281 + i * 138} y={y} textAnchor="middle"
                className={turunan ? 'sc-s' : 'sc-t'}
                fill={turunan ? ABU : undefined}>{k.f(p)}</text>
            ))}
          </g>
        );
      })}

      {/* Kenapa kuotanya per POTONGAN dan bukan per gigabyte — pertanyaan
          pertama siapa pun yang membaca tabel ini. */}
      <g className="an-in" style={{ ['--d' as string]: '1.4s' }}>
        <rect x="0" y={Y_CATATAN} width="760" height="42" rx="6"
          fill="#EFF6FF" stroke={BIRU} strokeWidth="1.5" />
        <text x="14" y={Y_CATATAN + 19} className="sc-t">
          Kuota dihitung per POTONGAN, bukan per gigabyte — karena potonganlah satuan biaya yang nyata.
        </text>
        <text x="14" y={Y_CATATAN + 33} className="sc-s">
          Dua pelanggan dengan 10 GB Drive bisa menghabiskan jatah yang jauh berbeda: PDF hasil pindai nyaris tak berisi teks, CSV hampir seluruhnya teks.
        </text>
      </g>
    </svg>
  );
}

/* ── kapasitas infrastruktur ────────────────────────────────────────── */

/** Diukur di produksi dengan pg_column_size — bukan perkiraan. */
const BYTE_BARIS = 8_189;
/** Indeks vektor berdimensi asli, per potongan (4,07× lebih kecil dari 1.536 dim). */
const BYTE_INDEKS = 1_572;
/** Rata-rata potongan per dokumen pada korpus perkantoran. */
const POTONGAN_PER_DOK = 10;

/** Berapa potongan muat bila indeksnya harus residen di RAM sebesar `gb`. */
const potonganDatar = (gb: number) => (gb * 1e9) / BYTE_INDEKS;
/** Berapa potongan muat pada disk sebesar `gb` (baris + indeks). */
const potonganDisk = (gb: number) => (gb * 1e9) / (BYTE_BARIS + BYTE_INDEKS);

const juta = (n: number) => `${(n / 1e6).toFixed(n < 1e7 ? 1 : 0).replace('.', ',')} jt`;
const ribu = (n: number) => n >= 1e6 ? juta(n) : `${Math.round(n / 1000).toLocaleString('id-ID')} rb`;

export function SceneCapacity() {
  const baris = [
    {
      t: 'Vercel Pro + Neon', s: 'maksimum 16 CU · 64 GB RAM',
      ram: 64, disk: 2_000, c: BIRU,
      n: 'atap tertinggi Neon — di atasnya harus pindah',
    },
    {
      t: 'On-premise', s: 'server 128 GB RAM · 2 TB NVMe',
      ram: 128, disk: 2_000, c: HIJAU,
      n: 'batasnya perangkat, bukan paket — bisa ditambah',
    },
    {
      t: 'AWS RDS / Aurora', s: 'instans memori besar · 768 GB RAM',
      ram: 768, disk: 16_000, c: ABU,
      n: 'atap tertinggi, biaya bulanan tertinggi',
    },
  ];

  return (
    <svg viewBox="0 0 760 278" role="img"
      aria-label="Kapasitas Vercel dengan Neon, on-premise, dan AWS dalam jumlah potongan dan dokumen">
      <text x="0" y="14" className="sc-k">
        diturunkan dari 8.189 byte/potongan terukur · mode bertingkat mengubah atapnya sama sekali
      </text>

      {baris.map((b, i) => {
        /* Tinggi baris 66 dengan dua batang di dalamnya: batang pertama di
           y+16, kedua di y+44, label terakhir di y+57. Versi sebelumnya
           memakai 62 dan keterangan kiri sepanjang 62 karakter yang meluber
           melewati x=286 tempat batangnya mulai. Sekarang kolom kiri dibatasi
           lebarnya dan keterangannya dipendekkan pada sumbernya. */
        const y = 26 + i * 66;
        const datar = potonganDatar(b.ram);
        const bertingkat = potonganDisk(b.disk);
        const X_BAR = 268;
        const W_MAX = 150;
        const wDatar = Math.max(8, (datar / potonganDatar(768)) * W_MAX);
        const wTingkat = Math.max(8, (bertingkat / potonganDisk(16_000)) * W_MAX);
        return (
          <g key={b.t}>
            <g className="an-in" style={{ ['--d' as string]: `${0.1 + i * 0.25}s` }}>
              <text x="0" y={y + 16} className="sc-t">{b.t}</text>
              <text x="0" y={y + 30} className="sc-s">{b.s}</text>
              <text x="0" y={y + 44} className="sc-m" style={{ fontSize: 7.5 }}>{b.n}</text>
            </g>

            {/* mode datar — dibatasi RAM */}
            <g className="an-in" style={{ ['--d' as string]: `${0.4 + i * 0.25}s` }}>
              <text x={X_BAR} y={y + 10} className="sc-k">mode langsung</text>
            </g>
            <rect x={X_BAR} y={y + 14} width={wDatar} height={12} rx="3" fill={b.c} opacity="0.45"
              className="an-bar" style={{ ['--d' as string]: `${0.5 + i * 0.25}s` }} />
            <text x={X_BAR + W_MAX + 12} y={y + 24} className="sc-t an-in"
              style={{ ['--d' as string]: `${0.9 + i * 0.25}s` }}>
              {juta(datar)} potongan
            </text>

            {/* mode bertingkat — dibatasi disk */}
            <g className="an-in" style={{ ['--d' as string]: `${0.6 + i * 0.25}s` }}>
              <text x={X_BAR} y={y + 42} className="sc-k">mode bertingkat</text>
            </g>
            <rect x={X_BAR} y={y + 46} width={wTingkat} height={12} rx="3" fill={b.c}
              className="an-bar" style={{ ['--d' as string]: `${0.7 + i * 0.25}s` }} />
            <text x={X_BAR + W_MAX + 12} y={y + 56} className="sc-t an-in"
              style={{ ['--d' as string]: `${1.1 + i * 0.25}s` }}>
              {juta(bertingkat)} potongan
            </text>
            <text x={X_BAR + W_MAX + 12} y={y + 66} className="sc-m an-in"
              style={{ ['--d' as string]: `${1.2 + i * 0.25}s`, fontSize: 8 }}>
              ±{ribu(bertingkat / POTONGAN_PER_DOK)} dokumen
            </text>
          </g>
        );
      })}

      <g className="an-in" style={{ ['--d' as string]: '1.7s' }}>
        <rect x="0" y="230" width="760" height="42" rx="6" fill="#F8FAFC" stroke="#D8E0EA" />
        <text x="14" y="248" className="sc-t">
          Mode langsung dibatasi RAM; mode bertingkat dibatasi DISK — dan disk jauh lebih murah dinaikkan.
        </text>
        <text x="14" y="262" className="sc-s">
          Asumsi ±10 potongan per dokumen, indeks berdimensi asli. Angka Neon &amp; AWS adalah atap paket tertinggi, bukan yang dipakai hari ini.
        </text>
      </g>
    </svg>
  );
}

/* ── batas Vercel yang benar-benar terasa ───────────────────────────── */

export function SceneVercel() {
  const batas = [
    {
      t: 'Unggahan berkas ±4,5 MB per permintaan', c: AMBER,
      d: 'Batas badan permintaan Vercel. Berkas besar masuk lewat konektor Drive/SharePoint, bukan lewat tombol unggah.',
    },
    {
      t: 'Penyimpanan sementara ±512 MB', c: AMBER,
      d: 'Model embedding kecil (22 MB) berjalan mulus — terukur 3,8 detik dingin, 0,5 detik hangat. Model besar (543 MB+) tak muat dan butuh server embedding terpisah.',
    },
    {
      t: 'Pembatas laju tak berbagi antar instans', c: AMBER,
      d: 'Hitungannya ada di memori tiap instans. Pada satu instans ia tepat; saat lalu lintas naik dan instans bertambah, batasnya jadi lebih longgar dari angka yang tertulis.',
    },
    {
      t: 'Tak ada proses latar yang hidup terus', c: ABU,
      d: 'Sync panjang dipecah — maksimum 150 berkas per jalannya, sisanya dilanjut jalan berikutnya. Sudah berjalan begitu hari ini.',
    },
  ];

  return (
    <svg viewBox="0 0 760 240" role="img"
      aria-label="Batas Vercel yang benar-benar terasa pada produk ini dan cara masing-masing sudah ditangani">
      <text x="0" y="14" className="sc-k">bukan daftar spesifikasi — hanya yang benar-benar menyentuh produk ini</text>

      {batas.map((b, i) => (
        <g key={b.t} className="an-in" style={{ ['--d' as string]: `${0.15 + i * 0.22}s` }}>
          <rect x="0" y={26 + i * 52} width="760" height="44" rx="6" className="sc-box" />
          <rect x="0" y={26 + i * 52} width="4" height="44" rx="2" fill={b.c} />
          <text x="18" y={45 + i * 52} className="sc-t">{b.t}</text>
          <text x="18" y={60 + i * 52} className="sc-s">{b.d}</text>
        </g>
      ))}

      <g className="an-in" style={{ ['--d' as string]: '1.3s' }}>
        <text x="0" y="232" className="sc-s">
          Keempatnya sudah punya jalan keluar di produk ini — yang belum punya jalan keluar adalah atap Neon: di atas 16 CU tak ada paket berikutnya.
        </text>
      </g>
    </svg>
  );
}
