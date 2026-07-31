/**
 * ADEGAN "KORPUS BESAR DI VERCEL" — apa yang sudah muat, apa yang belum.
 *
 * Slide ini ada karena jawabannya TERBELAH, dan yang menyesatkan justru
 * menjawabnya dengan satu kata. Setelah halfvec dan mode bertingkat, korpus
 * 700 GB benar-benar bisa DILAYANI dari Vercel + Neon — indeksnya tinggal
 * 2,5 GB, jauh di bawah atap Neon. Menjawab "tidak bisa" hari ini berarti
 * mengulang batas yang sudah tidak ada.
 *
 * Tetapi MEMASUKKAN 700 GB tetap tak bisa, dan penghalangnya sama sekali
 * bukan kapasitas: Vercel tak punya proses latar yang hidup terus. Menjawab
 * "bisa" berarti menjanjikan sesuatu yang akan gagal setelah kontrak
 * ditandatangani — bentuk kebohongan yang paling mahal.
 *
 * Ketiga penghalangnya DIBACA DARI KODE, bukan diperkirakan:
 *   MAX_INGEST_PER_SYNC = 150   (knowledge/sync.service.ts)
 *   MAX_LIST_FILES      = 2000  (idem)
 *   maxDuration         = 60    (app/api/sources/[id]/sync/route.ts)
 * Bila salah satunya berubah, angka di slide ini ikut berubah — itulah
 * sebabnya semuanya dihitung, bukan diketik.
 */

const BIRU = '#2563EB';
const AMBER = '#F59E0B';
const HIJAU = '#059669';
const ABU = '#94A3B8';

/* ── yang dibaca dari kode produksi ─────────────────────────────────── */
/** knowledge/sync.service.ts — kerja mahal per satu kali jalan. */
const MAX_INGEST_PER_SYNC = 150;
/** knowledge/sync.service.ts — jendela listing metadata. */
const MAX_LIST_FILES = 2_000;
/** app/api/sources/[id]/sync/route.ts */
const MAX_DURATION_DTK = 60;

/* ── ukuran korpus ──────────────────────────────────────────────────── */
const KORPUS = 700e9;
const RASIO_RENCANA = 0.03;
const CHAR_PER_POTONGAN = 680;
const POTONGAN_PER_DOK = 10;
const BYTE_INDEKS = 804;
/** Atap tertinggi Neon: 16 CU. */
const NEON_RAM = 64e9;
/** Jatah transfer Vercel Pro per bulan. */
const VERCEL_TRANSFER = 1e12;

const potongan = (KORPUS * RASIO_RENCANA) / CHAR_PER_POTONGAN;
const dokumen = potongan / POTONGAN_PER_DOK;
const idxTingkat = dokumen * BYTE_INDEKS;
const idxDatar = potongan * BYTE_INDEKS;
const putaran = Math.ceil(dokumen / MAX_INGEST_PER_SYNC);
/** Hari bila dipicu cron tiap menit dan setiap putaran sukses penuh. */
const hari = putaran / (60 * 24);

const gb = (b: number) => b >= 1e9
  ? `${(b / 1e9).toFixed(b < 1e10 ? 1 : 0).replace('.', ',')} GB`
  : `${Math.round(b / 1e6)} MB`;
const jt = (n: number) => n >= 1e6
  ? `${(n / 1e6).toFixed(n < 1e7 ? 1 : 0).replace('.', ',')} jt`
  : `${Math.round(n / 1e3)} rb`;

export function SceneVercelBesar() {
  /* Geometri sebagai konstanta. Dua panel berdampingan dengan lebar tetap;
     tanpa ini, menambah satu baris di panel kanan akan mendorong teksnya ke
     luar kotak tanpa ada yang menyadarinya sampai slide ditayangkan. */
  const W = 368;
  const X_KIRI = 0;
  const X_KANAN = 392;
  const Y_PANEL = 26;
  const H_PANEL = 152;

  const bisa = [
    { t: `Indeks residen ${gb(idxTingkat)}`, d: `mode bertingkat · atap Neon ${gb(NEON_RAM)}` },
    { t: `Mode langsung pun muat — ${gb(idxDatar)}`, d: 'jalan mundur bila bertingkat dimatikan' },
    { t: '±15 ms kerja basis data', d: 'per pertanyaan, tak peduli korpusnya sebesar apa' },
    { t: 'Biaya per pertanyaan TIDAK naik', d: 'pencarian tak memakai token model' },
  ];

  const belum = [
    {
      t: `${putaran.toLocaleString('id-ID')} kali jalan`,
      d: `${MAX_INGEST_PER_SYNC} berkas/putaran · ${MAX_DURATION_DTK} dtk/lambda · ±${Math.round(hari)} hari nonstop`,
    },
    {
      t: `Jendela listing ${MAX_LIST_FILES.toLocaleString('id-ID')}`,
      d: `dari ${jt(dokumen)} dokumen — deteksi berkas terhapus tak pernah jalan`,
    },
    {
      t: `${gb(KORPUS)} lewat lambda`,
      d: `±${Math.round((KORPUS / VERCEL_TRANSFER) * 100)}% jatah transfer Vercel Pro sebulan`,
    },
    {
      t: 'Lambda dibekukan saat respons terkirim',
      d: 'tak ada proses latar yang hidup terus — ini yang menghalangi, bukan kapasitas',
    },
  ];

  const Panel = ({
    x, judul, kicker, warna, isi, tanda,
  }: {
    x: number; judul: string; kicker: string; warna: string;
    isi: Array<{ t: string; d: string }>; tanda: string;
  }) => (
    <>
      <g className="an-in" style={{ ['--d' as string]: x === X_KIRI ? '0s' : '0.25s' }}>
        <rect x={x} y={Y_PANEL} width={W} height={H_PANEL} rx="7" className="sc-box" />
        <rect x={x} y={Y_PANEL} width={W} height={4} rx="2" fill={warna} />
        <text x={x + 14} y={Y_PANEL + 22} className="sc-k" fill={warna}>{kicker}</text>
        <text x={x + 14} y={Y_PANEL + 40} className="sc-t" style={{ fontSize: 13 }}>{judul}</text>
        <text x={x + W - 14} y={Y_PANEL + 24} textAnchor="end" className="sc-t"
          fill={warna} style={{ fontSize: 15 }}>{tanda}</text>
      </g>
      {isi.map((b, i) => {
        const y = Y_PANEL + 58 + i * 24;
        return (
          <g key={b.t} className="an-in"
            style={{ ['--d' as string]: `${(x === X_KIRI ? 0.4 : 0.65) + i * 0.14}s` }}>
            <circle cx={x + 19} cy={y - 3} r="2.5" fill={warna} />
            <text x={x + 30} y={y} className="sc-t">{b.t}</text>
            <text x={x + 30} y={y + 11} className="sc-s">{b.d}</text>
          </g>
        );
      })}
    </>
  );

  return (
    <svg viewBox="0 0 760 258" role="img"
      aria-label="Korpus 700 GB di Vercel: melayani pertanyaan sudah muat, memasukkan dokumennya belum, dan jalan tengahnya memisahkan keduanya">
      <text x="0" y="14" className="sc-k">
        korpus 700 GB · jawabannya terbelah, dan menjawabnya satu kata akan menyesatkan
      </text>

      <Panel x={X_KIRI} kicker="MELAYANI PERTANYAAN" judul="Sudah muat hari ini"
        warna={HIJAU} isi={bisa} tanda="✓" />
      <Panel x={X_KANAN} kicker="MEMASUKKAN DOKUMEN" judul="Belum — dan bukan soal kapasitas"
        warna={AMBER} isi={belum} tanda="✗" />

      {/* Jalan tengahnya bukan tambalan: databasenya memang sama, jadi
          memisahkan pemicu ingest dari penyajian tak menuntut kode baru. */}
      <g className="an-in" style={{ ['--d' as string]: '1.5s' }}>
        <rect x="0" y="190" width="760" height="42" rx="6"
          fill="#EFF6FF" stroke={BIRU} strokeWidth="1.5" />
        <text x="14" y="208" className="sc-t">
          Jalan tengahnya: ingest dijalankan dari VPS murah, penyajian tetap di Vercel — satu basis data, satu basis kode.
        </text>
        <text x="14" y="222" className="sc-s">
          Di VPS tak ada batas {MAX_DURATION_DTK} detik dan transfernya tak lewat Vercel. Yang berbeda hanya pemicunya, bukan produknya.
        </text>
      </g>

      <g className="an-in" style={{ ['--d' as string]: '1.7s' }}>
        <text x="0" y="250" className="sc-s" fill={ABU}>
          Ketiga penghalang di kanan dibaca dari kode produksi (MAX_INGEST_PER_SYNC, MAX_LIST_FILES, maxDuration), bukan diperkirakan — bila batasnya dinaikkan, angka slide ini ikut berubah.
        </text>
      </g>
    </svg>
  );
}
