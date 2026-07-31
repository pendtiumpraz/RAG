'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * HALAMAN STATUS PUBLIK.
 *
 * Di LUAR grup (app) dan tanpa sesi: saat terjadi gangguan, orang yang paling
 * butuh melihatnya justru yang tak bisa masuk.
 *
 * BATAS YANG MENENTUKAN, dan halaman ini menuliskannya sendiri: ia dilayani
 * oleh aplikasi yang sama yang dipantaunya. Kalau seluruh layanan mati,
 * halaman ini ikut mati — dan halaman status yang diam saat gangguan lebih
 * buruk daripada tidak punya sama sekali, karena orang menyimpulkan "berarti
 * tidak apa-apa". Menuliskannya di muka adalah satu-satunya cara halaman ini
 * tetap jujur pada keadaan yang justru tak bisa ditampilkannya.
 *
 * TIDAK memuat data tenant apa pun. Halaman publik yang menyebut nama
 * pelanggan, jumlah percakapan, atau kuota siapa pun akan membocorkan keadaan
 * bisnis mereka kepada siapa saja yang membuka tautannya.
 */

interface Kesehatan {
  ok: boolean;
  db: { ok: boolean; latencyMs: number | null };
  mode: string;
  checkedInMs: number;
}

type Keadaan =
  | { jenis: 'memuat' }
  | { jenis: 'sehat'; data: Kesehatan }
  | { jenis: 'terganggu'; data: Kesehatan | null }
  /** Permintaannya sendiri gagal — aplikasinya kemungkinan besar tak hidup. */
  | { jenis: 'tak-terjangkau' };

const JEDA_MS = 15_000;

export default function StatusPage() {
  const [keadaan, setKeadaan] = useState<Keadaan>({ jenis: 'memuat' });
  const [terakhir, setTerakhir] = useState<string | null>(null);

  const periksa = useCallback(async () => {
    try {
      const r = await fetch('/api/health', { cache: 'no-store' });
      // 503 TETAP membawa badan yang bisa dibaca — itu justru keadaan yang
      // paling ingin dilihat orang, jadi jangan diperlakukan sebagai gagal.
      const data = (await r.json().catch(() => null)) as Kesehatan | null;
      setKeadaan(r.ok && data?.ok ? { jenis: 'sehat', data } : { jenis: 'terganggu', data });
    } catch {
      setKeadaan({ jenis: 'tak-terjangkau' });
    }
    setTerakhir(new Date().toLocaleTimeString('id-ID'));
  }, []);

  useEffect(() => {
    void periksa();
    const t = setInterval(() => { void periksa(); }, JEDA_MS);
    return () => clearInterval(t);
  }, [periksa]);

  const warna = keadaan.jenis === 'sehat' ? 'var(--good)'
    : keadaan.jenis === 'memuat' ? 'var(--faint)' : 'var(--danger)';
  const judul = keadaan.jenis === 'sehat' ? 'Semua layanan berjalan normal'
    : keadaan.jenis === 'memuat' ? 'Memeriksa…'
    : keadaan.jenis === 'tak-terjangkau' ? 'Layanan tidak menjawab'
    : 'Ada gangguan';

  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: '48px 20px' }}>
      <span className="microlabel">STATUS LAYANAN NALAR</span>
      <h1 style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
        <span aria-hidden style={{
          width: 12, height: 12, borderRadius: '50%', background: warna, flex: 'none',
        }} />
        {judul}
      </h1>

      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-pad table-wrap">
          <table className="table"><tbody>
            <tr>
              <td>Aplikasi</td>
              <td className="num">{keadaan.jenis === 'tak-terjangkau'
                ? <span className="badge badge-warn">tak menjawab</span>
                : <span className="badge badge-ok"><span className="led led-live" />menjawab</span>}</td>
            </tr>
            <tr>
              <td>Basis data</td>
              <td className="num">{
                keadaan.jenis === 'memuat' ? '…'
                  : keadaan.jenis === 'tak-terjangkau' ? <span className="badge">tak diketahui</span>
                  : keadaan.data?.db.ok
                    ? <span className="badge badge-ok"><span className="led led-live" />terjangkau</span>
                    : <span className="badge badge-warn">tak terjangkau</span>
              }</td>
            </tr>
            {keadaan.jenis !== 'memuat' && keadaan.jenis !== 'tak-terjangkau' && keadaan.data?.db.latencyMs != null && (
              <tr><td>Waktu tanggap basis data</td>
                <td className="num mono">{keadaan.data.db.latencyMs} ms</td></tr>
            )}
            <tr><td>Terakhir diperiksa</td><td className="num mono">{terakhir ?? '—'}</td></tr>
          </tbody></table>
        </div>
      </div>

      {/* Batas yang membuat halaman ini jujur. Tanpa kalimat ini, halaman yang
          DIAM saat gangguan akan dibaca sebagai "berarti tidak apa-apa". */}
      <p style={{ color: 'var(--muted)', fontSize: 13.5, lineHeight: 1.7, marginTop: 24 }}>
        Halaman ini dilayani oleh aplikasi yang sama yang dipantaunya. Kalau seluruh
        layanan mati, halaman ini ikut mati — jadi <b>halaman yang tak bisa dibuka
        adalah gangguan itu sendiri</b>, bukan tanda bahwa semuanya baik-baik saja.
        Untuk pemantauan yang berdiri sendiri, arahkan monitor luar (UptimeRobot,
        Better Stack, atau sejenisnya) ke <code>/api/health</code>; endpoint itu
        membalas <b>503</b> saat basis data tak terjangkau, jadi monitor benar-benar
        berbunyi alih-alih membaca 200 yang berisi kabar buruk.
      </p>

      <p style={{ color: 'var(--muted)', fontSize: 13.5, lineHeight: 1.7 }}>
        Halaman ini sengaja tidak menampilkan data pelanggan mana pun — tidak nama
        workspace, tidak jumlah percakapan, tidak sisa kuota. Yang bisa dilihat di
        sini hanya keadaan platform.
      </p>

      <p style={{ marginTop: 24 }}>
        {/* Tautan biasa, BUKAN <Link>, dan disengaja. Halaman ini dibuka justru
            saat ada yang tidak beres; navigasi sisi-klien menuntut router dan
            bundel aplikasi tetap sehat, sementara pemuatan halaman penuh tidak
            menuntut apa pun selain server yang menjawab. Di halaman status,
            keandalan lebih berharga daripada perpindahan yang mulus. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a className="btn" href="/">Kembali ke beranda</a>
      </p>
    </main>
  );
}
