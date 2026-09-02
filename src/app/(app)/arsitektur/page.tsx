'use client';

import { useSession } from 'next-auth/react';
import { EmptyState } from '../../_components/ui';

/**
 * PETA ARSITEKTUR (HLA) — superadmin saja.
 *
 * Berkasnya `public/hla/nalar-arsitektur.html`: satu HTML MANDIRI berisi SVG
 * inline, dihasilkan oleh skill `archify` (tt-a1i/archify, MIT) dari sebuah
 * spesifikasi JSON bertipe yang ikut disimpan di `docs/hla/`.
 *
 * KENAPA IFRAME, BUKAN KOMPONEN REACT. Keluaran archify adalah dokumen utuh —
 * punya <html>, gaya, dan runtime penjelajahnya sendiri (telusur rute, sorot
 * hulu-hilir, cerita terpandu). Menyalinnya jadi JSX berarti membongkar
 * dokumen itu dan kehilangan seluruh interaksinya, lalu menanggung
 * penggabungan ulang setiap kali diagramnya diperbarui. Dibiarkan utuh, ia
 * cukup ditimpa berkasnya saja.
 *
 * CSP: `frame-ancestors 'self'` untuk /hla/* diatur di next.config.mjs.
 * Tanpa itu aturan menyeluruh `frame-ancestors 'none'` — yang memang benar
 * untuk seluruh dasbor — ikut menolak bingkai ini, dan halamannya kosong
 * tanpa satu pun galat yang terlihat.
 */

const BERKAS = '/hla/nalar-arsitektur.html';

export default function ArsitekturPage() {
  const { data: session } = useSession();
  const role = session?.user?.role;

  if (role && role !== 'superadmin') {
    return <EmptyState title="Khusus superadmin"
      hint="Peta arsitektur memuat rincian infrastruktur internal." />;
  }

  return (
    <div className="stack gap-4" style={{ height: 'calc(100vh - 140px)', minHeight: 520 }}>
      <div className="cluster" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--sp-4)' }}>
        <div>
          <h1 style={{ margin: 0 }}>Arsitektur runtime</h1>
          <p style={{ margin: '6px 0 0', color: 'var(--muted)', fontSize: 'var(--fs-sm)', maxWidth: '70ch' }}>
            Peta interaktif: klik simpul untuk menyorot jalur hulu-hilirnya, atau pakai
            pilihan tampilan di dalam diagram untuk memisahkan <b>jalur tanya</b>, <b>jalur masuk</b>,
            <b> isolasi tenant</b>, dan <b>pekerjaan yang tak muat di lambda</b>.
          </p>
        </div>
        {/* Tautan keluar bukan hiasan: bingkai memakai tinggi layar dasbor,
            sedangkan diagram lebar lebih enak dibaca satu tab penuh — dan
            ekspor PNG/SVG bawaan archify juga lebih mudah dari sana. */}
        <a className="btn btn-sm" href={BERKAS} target="_blank" rel="noopener noreferrer">
          Buka satu tab penuh
        </a>
      </div>

      <iframe
        src={BERKAS}
        title="Peta arsitektur runtime Nalar"
        style={{
          flex: 1, width: '100%', border: '1px solid var(--line-strong)',
          borderRadius: 'var(--rad-lg)', background: 'var(--card)',
        }}
      />

      <p className="microlabel" style={{ margin: 0 }}>
        Dihasilkan dengan archify (MIT) dari spesifikasi di docs/hla/nalar.architecture.json —
        perbarui spesifikasinya, jalankan ulang, lalu timpa berkas HTML-nya.
      </p>
    </div>
  );
}
