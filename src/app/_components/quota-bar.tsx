'use client';

import { useApi } from '../_lib/api';

/**
 * BILAH SISA KUOTA PENYIMPANAN.
 *
 * Endpoint `/api/usage/storage` sudah ada sejak kuota dipasang, tapi TAK SATU
 * PUN halaman memakainya. Akibatnya batas paket baru terasa saat unggahan
 * atau sync DITOLAK — dan penolakan yang datang setelah orang menunggu proses
 * selesai terbaca sebagai produk yang rusak, bukan sebagai batas paket. Itu
 * bukan sekadar pengalaman yang kurang enak: dengan kuota Free yang sengaja
 * dibuat ketat, inilah pembeda antara pesan "paketmu penuh" dan kesan
 * "aplikasinya error".
 *
 * TIGA KEADAAN, tiga tampilan yang berbeda — dan membedakannya yang membuat
 * bilah ini berguna:
 *
 *   < 80%   tenang. Angka saja, tanpa warna peringatan. Bilah yang selalu
 *           merah berhenti dibaca sebagai peringatan.
 *   ≥ 80%   amber + kalimat yang menyebut apa yang akan terjadi. Ambangnya
 *           di sini, bukan di 95%, karena satu kali sync bisa memakan sisa
 *           20% sekaligus — peringatan yang datang di 95% sudah terlambat
 *           untuk ditindaklanjuti.
 *   = 100%  merah + menyebut jalan keluarnya. Batas yang menolak tanpa
 *           menawarkan apa pun tak dibaca sebagai batas, melainkan sebagai
 *           jalan buntu.
 */

export interface StorageUsage {
  plan: string;
  isPlatform: boolean;
  chunks: number;
  /** null di JSON = tanpa batas (Infinity tak bisa diangkut JSON). */
  maxChunks: number | null;
  knowledgeBases: number;
  maxKnowledgeBases: number | null;
  approxDocuments: number;
  approxBytes: number;
  percent: number;
}

const ambangPeringatan = 80;

const mb = (b: number) =>
  b >= 1e9 ? `${(b / 1e9).toFixed(1).replace('.', ',')} GB`
    : b >= 1e6 ? `${Math.round(b / 1e6)} MB`
    : `${Math.round(b / 1e3)} KB`;

/**
 * `null` dari JSON berarti tanpa batas.
 *
 * Infinity tidak selamat melewati JSON.stringify — ia jadi `null`. Menganggap
 * null sebagai NOL akan membuat tenant on-premise melihat "kuota 0" dan
 * bilah merah penuh, padahal justru merekalah yang tak dibatasi apa pun.
 */
const takTerbatas = (v: number | null | undefined) => v == null || !Number.isFinite(v);

export function QuotaBar({ compact = false, refreshKey = 0 }: {
  compact?: boolean;
  /**
   * Dinaikkan pemanggil sesudah tindakan yang MENGUBAH pemakaian (sync,
   * unggah, hapus dokumen).
   *
   * Tanpa ini bilahnya mengambil data sekali saat mount lalu diam — dan ia
   * jadi basi persis pada saat angkanya paling berubah. Bilah kuota yang
   * menampilkan angka sebelum sync, sesudah sync selesai, lebih buruk
   * daripada tak ada bilah: orang mengira masih punya sisa yang sebenarnya
   * sudah terpakai.
   *
   * Diangkut sebagai parameter kueri karena `useApi` menyegarkan ketika
   * PATH-nya berubah; server mengabaikannya.
   */
  refreshKey?: number;
}) {
  const u = useApi<StorageUsage>(
    refreshKey ? `/api/usage/storage?r=${refreshKey}` : '/api/usage/storage');
  if (u.loading || u.error || !u.data) return null;
  const d = u.data;

  if (takTerbatas(d.maxChunks)) {
    /* Tenant platform & on-premise memang tanpa batas. Menampilkan bilah
       kosong untuk mereka bukan informasi, hanya perabot; disebut sekali
       dengan kalimat pendek sudah cukup. */
    return (
      <p className="microlabel" style={{ margin: 0 }}>
        PENYIMPANAN TANPA BATAS · {d.chunks.toLocaleString('id-ID')} POTONGAN TERPAKAI
      </p>
    );
  }

  const maks = d.maxChunks as number;
  const persen = Math.min(100, d.percent);
  const penuh = d.chunks >= maks;
  const dekat = persen >= ambangPeringatan;
  const warna = penuh ? 'var(--danger)' : dekat ? 'var(--source-mark)' : 'var(--signal)';
  const sisa = Math.max(0, maks - d.chunks);

  return (
    <div className="stack gap-2" style={{ minWidth: compact ? 200 : 260 }}>
      <div className="cluster" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className="microlabel" style={{ margin: 0 }}>PENYIMPANAN</span>
        <div className="meter" style={{ width: compact ? 90 : 140, flex: 'none' }}>
          <i style={{ width: `${Math.max(2, persen)}%`, background: warna }} />
        </div>
        <span style={{
          fontSize: 12, fontWeight: 650, color: warna, fontVariantNumeric: 'tabular-nums',
        }}>{persen}%</span>
      </div>

      {/* Angka POTONGAN yang ditegakkan kode disebut lebih dulu; terjemahan
          ke dokumen & megabyte menyusul sebagai cara membacanya. Menaruh
          terjemahan di depan membuat orang mengira MB-lah kuotanya, lalu
          bingung ketika berkas 1 MB berisi tabel menghabiskan jatah lebih
          banyak daripada berkas 5 MB hasil pindai. */}
      <p className="sub" style={{ margin: 0, fontSize: 12 }}>
        {d.chunks.toLocaleString('id-ID')} / {maks.toLocaleString('id-ID')} potongan
        {/* Pembulatan ke bawah menghasilkan "±0 dokumen" untuk korpus yang
            sebenarnya BERISI — dua potongan dibulatkan jadi nol, dan itu
            terbaca sebagai "belum ada apa-apa" tepat pada tenant yang baru
            mulai mengisi. Keadaan itu disebut apa adanya. */}
        {' · '}{d.chunks > 0 && d.approxDocuments === 0
          ? 'kurang dari 1 dokumen'
          : `±${d.approxDocuments.toLocaleString('id-ID')} dokumen`}
        {' · '}±{mb(d.approxBytes)} di basis data
      </p>

      {penuh ? (
        <p className="sub" style={{ margin: 0, fontSize: 12, color: 'var(--danger)' }}>
          Kuota habis. Unggahan dan sync berikutnya akan ditolak — hapus dokumen yang
          tak lagi dipakai, atau naikkan paket.
        </p>
      ) : dekat ? (
        <p className="sub" style={{ margin: 0, fontSize: 12, color: 'var(--warn)' }}>
          Sisa {sisa.toLocaleString('id-ID')} potongan (±{Math.round(sisa / 10).toLocaleString('id-ID')} dokumen).
          Satu kali sync folder besar bisa menghabiskannya sekaligus.
        </p>
      ) : null}
    </div>
  );
}
