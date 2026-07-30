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

export function ScenePlans() {
  const plans = ['free', 'pro', 'enterprise', 'onprem'];
  const kolom = [
    { t: 'Pesan / bulan', f: (p: string) => angka(PLAN_LIMITS[p].messagesPerMonth) },
    { t: 'Chatbot', f: (p: string) => angka(PLAN_LIMITS[p].maxChatbots) },
    { t: 'Anggota tim', f: (p: string) => angka(PLAN_LIMITS[p].maxMembers) },
    { t: 'Laju (burst)', f: (p: string) => `${PLAN_LIMITS[p].chatBurst}/detik` },
    { t: 'Knowledge base', f: () => 'tanpa batas' },
    { t: 'Dokumen & ukuran', f: () => 'tanpa batas' },
  ];

  return (
    <svg viewBox="0 0 760 250" role="img"
      aria-label="Batas tiap paket langganan: pesan per bulan, chatbot, anggota tim, laju, dan yang belum dibatasi">
      <text x="0" y="14" className="sc-k">yang benar-benar ditegakkan kode · bukan janji brosur</text>

      {/* kepala kolom */}
      {plans.map((p, i) => (
        <g key={p} className="an-in" style={{ ['--d' as string]: `${0.1 + i * 0.1}s` }}>
          <rect x={208 + i * 140} y={26} width={132} height={26} rx="5"
            fill={p === 'onprem' ? '#0F172A' : '#F8FAFC'}
            stroke={p === 'onprem' ? '#0F172A' : '#D8E0EA'} strokeWidth="1.5" />
          <text x={274 + i * 140} y={43} textAnchor="middle"
            className={`sc-t ${p === 'onprem' ? 'sc-w' : ''}`}>{PLAN_LABEL[p]}</text>
        </g>
      ))}

      {kolom.map((k, r) => {
        const y = 62 + r * 30;
        const belum = k.t === 'Knowledge base' || k.t === 'Dokumen & ukuran';
        return (
          <g key={k.t} className="an-in" style={{ ['--d' as string]: `${0.5 + r * 0.12}s` }}>
            <line x1="0" y1={y + 20} x2="760" y2={y + 20} stroke="#EEF2F7" strokeWidth="1" />
            <text x="0" y={y + 14} className={belum ? 'sc-s' : 'sc-t'}>{k.t}</text>
            {belum && <text x="0" y={y + 25} className="sc-k">belum dibatasi</text>}
            {plans.map((p, i) => (
              <text key={p} x={274 + i * 140} y={y + 14} textAnchor="middle"
                className={belum ? 'sc-s' : 'sc-t'}
                fill={belum ? ABU : undefined}>{k.f(p)}</text>
            ))}
          </g>
        );
      })}

      {/* Celah yang harus disebut, bukan disembunyikan. */}
      <g className="an-in" style={{ ['--d' as string]: '1.6s' }}>
        <rect x="0" y="200" width="760" height="44" rx="6" fill="#FFFBEB" stroke={AMBER} strokeWidth="1.5" />
        <text x="14" y="220" className="sc-t">
          Jumlah knowledge base, jumlah dokumen, dan besar penyimpanan BELUM punya kuota.
        </text>
        <text x="14" y="235" className="sc-s">
          Untuk on-premise itu memang benar — batasnya server pelanggan sendiri. Untuk SaaS ia perlu ditambahkan sebelum pelanggan berbayar pertama masuk.
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
      n: 'Atap tertinggi Neon. Di atas ini tak ada paket yang lebih besar — harus pindah.',
    },
    {
      t: 'On-premise', s: 'server 128 GB RAM · 2 TB NVMe',
      ram: 128, disk: 2_000, c: HIJAU,
      n: 'Batasnya perangkat yang dibeli, bukan paket. Bisa ditambah kapan saja.',
    },
    {
      t: 'AWS RDS / Aurora', s: 'instans memori besar · 768 GB RAM',
      ram: 768, disk: 16_000, c: ABU,
      n: 'Atap tertinggi dari ketiganya, dengan biaya bulanan yang juga tertinggi.',
    },
  ];

  return (
    <svg viewBox="0 0 760 258" role="img"
      aria-label="Kapasitas Vercel dengan Neon, on-premise, dan AWS dalam jumlah potongan dan dokumen">
      <text x="0" y="14" className="sc-k">
        diturunkan dari 8.189 byte/potongan terukur · mode bertingkat mengubah atapnya sama sekali
      </text>

      {baris.map((b, i) => {
        const y = 30 + i * 62;
        const datar = potonganDatar(b.ram);
        const bertingkat = potonganDisk(b.disk);
        const wDatar = Math.max(8, (datar / potonganDatar(768)) * 190);
        const wTingkat = Math.max(8, (bertingkat / potonganDisk(16_000)) * 190);
        return (
          <g key={b.t}>
            <g className="an-in" style={{ ['--d' as string]: `${0.1 + i * 0.25}s` }}>
              <text x="0" y={y + 14} className="sc-t">{b.t}</text>
              <text x="0" y={y + 27} className="sc-s">{b.s}</text>
              <text x="0" y={y + 42} className="sc-m">{b.n.slice(0, 62)}</text>
            </g>

            {/* mode datar — dibatasi RAM */}
            <g className="an-in" style={{ ['--d' as string]: `${0.4 + i * 0.25}s` }}>
              <text x={286} y={y + 10} className="sc-k">mode langsung</text>
            </g>
            <rect x={286} y={y + 14} width={wDatar} height={13} rx="3" fill={b.c} opacity="0.45"
              className="an-bar" style={{ ['--d' as string]: `${0.5 + i * 0.25}s` }} />
            <text x={286 + wDatar + 8} y={y + 25} className="sc-t an-in"
              style={{ ['--d' as string]: `${0.9 + i * 0.25}s` }}>
              {juta(datar)} potongan
            </text>

            {/* mode bertingkat — dibatasi disk */}
            <g className="an-in" style={{ ['--d' as string]: `${0.6 + i * 0.25}s` }}>
              <text x={286} y={y + 40} className="sc-k">mode bertingkat</text>
            </g>
            <rect x={286} y={y + 44} width={wTingkat} height={13} rx="3" fill={b.c}
              className="an-bar" style={{ ['--d' as string]: `${0.7 + i * 0.25}s` }} />
            <text x={286 + wTingkat + 8} y={y + 55} className="sc-t an-in"
              style={{ ['--d' as string]: `${1.1 + i * 0.25}s` }}>
              {juta(bertingkat)} potongan · ±{ribu(bertingkat / POTONGAN_PER_DOK)} dokumen
            </text>
          </g>
        );
      })}

      <g className="an-in" style={{ ['--d' as string]: '1.7s' }}>
        <rect x="0" y="218" width="760" height="40" rx="6" fill="#F8FAFC" stroke="#D8E0EA" />
        <text x="14" y="236" className="sc-t">
          Mode langsung dibatasi RAM; mode bertingkat dibatasi DISK — dan disk jauh lebih murah dinaikkan.
        </text>
        <text x="14" y="250" className="sc-s">
          Asumsi: ±10 potongan per dokumen, indeks berdimensi asli. Angka Neon &amp; AWS adalah atap paket tertinggi masing-masing, bukan yang dipakai hari ini.
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
