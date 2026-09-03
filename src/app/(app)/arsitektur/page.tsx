'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { EmptyState } from '../../_components/ui';
import { DIAGRAM, LABEL_JENIS } from './daftar';

/**
 * ARSITEKTUR & ALUR FITUR (HLA) — superadmin saja.
 *
 * Satu halaman, banyak diagram: peta arsitektur menyeluruh plus satu diagram
 * per fitur. Semuanya dihasilkan skill `archify` (tt-a1i/archify, MIT) dari
 * spesifikasi JSON bertipe di `docs/hla/`; berkas HTML-nya mandiri di
 * `public/hla/`. Daftarnya di `daftar.ts` — menambah fitur tak menyentuh
 * berkas ini.
 *
 * DIAGRAM DI KIRI, LANGKAH DI KANAN, dan pemisahan itu disengaja: gambar
 * menjawab "apa memanggil apa, dan di mana ia gagal", sedangkan orang yang
 * membuka halaman ini biasanya sedang mencari "saya harus klik apa". Satu
 * bentuk tak bisa menjawab keduanya tanpa mengorbankan salah satunya.
 *
 * KENAPA IFRAME, BUKAN KOMPONEN REACT. Keluaran archify adalah dokumen utuh
 * dengan runtime penjelajahnya sendiri (telusur rute, sorot hulu–hilir, cerita
 * terpandu). Menyalinnya jadi JSX berarti membongkar dokumen itu, kehilangan
 * seluruh interaksinya, lalu menanggung penggabungan ulang tiap kali
 * diagramnya diperbarui. Dibiarkan utuh, ia cukup ditimpa berkasnya.
 *
 * CSP: `frame-ancestors 'self'` untuk /hla/* diatur di next.config.mjs, dan
 * berkasnya ikut dijaga middleware. Tanpa keduanya halaman ini kosong tanpa
 * satu pun galat yang terlihat.
 */

export default function ArsitekturPage() {
  const { data: session } = useSession();
  const role = session?.user?.role;
  const [aktifId, setAktifId] = useState(DIAGRAM[0].id);
  const aktif = DIAGRAM.find((d) => d.id === aktifId) ?? DIAGRAM[0];

  if (role && role !== 'superadmin') {
    return <EmptyState title="Khusus superadmin"
      hint="Peta arsitektur memuat rincian infrastruktur internal." />;
  }

  return (
    <div className="stack gap-4">
      <div>
        <h1 style={{ margin: 0 }}>Arsitektur & alur fitur</h1>
        <p style={{ margin: '6px 0 0', color: 'var(--muted)', fontSize: 'var(--fs-sm)', maxWidth: '76ch' }}>
          Tiap fitur punya satu diagram alur dan langkah pemakaiannya. Diagramnya interaktif:
          klik simpul untuk menyorot jalur hulu–hilir, atau pakai pemilih tampilan di dalamnya
          untuk memisahkan cerita — jalan mulus, cara gagal, dan apa yang terjadi sesudahnya.
        </p>
      </div>

      {/* Daftar fitur: tab mendatar, bukan sidebar kedua — sidebar aplikasi
          sudah ada di kiri, dan dua kolom navigasi bersebelahan membuat orang
          bingung yang mana yang sedang mereka telusuri. */}
      <div className="cluster gap-2" role="tablist" aria-label="Pilih diagram" style={{ flexWrap: 'wrap' }}>
        {DIAGRAM.map((d) => (
          <button key={d.id} role="tab" aria-selected={d.id === aktifId}
            className={`btn btn-sm${d.id === aktifId ? ' btn-primary' : ''}`}
            onClick={() => setAktifId(d.id)}>
            {d.judul}
            <span className="microlabel" style={{ marginLeft: 6, opacity: 0.75 }}>{LABEL_JENIS[d.jenis]}</span>
          </button>
        ))}
      </div>

      <p style={{ margin: 0, color: 'var(--muted)', fontSize: 'var(--fs-sm)', maxWidth: '76ch' }}>
        {aktif.ringkas}
      </p>

      <div className="stack gap-4" style={{ gridTemplateColumns: 'minmax(0,1fr) 320px', display: 'grid', alignItems: 'stretch' }}>
        <iframe
          key={aktif.id}
          src={aktif.berkas}
          title={`Diagram: ${aktif.judul}`}
          style={{
            width: '100%', height: 'min(72vh, 720px)', minHeight: 480,
            border: '1px solid var(--line-strong)', borderRadius: 'var(--rad-lg)',
            background: 'var(--card)',
          }}
        />

        <div className="stack gap-4">
          <div className="card card-pad stack gap-3">
            <h3 style={{ margin: 0, fontSize: 'var(--fs-md)' }}>Cara pakai</h3>
            <ol className="stack gap-2" style={{ margin: 0, paddingLeft: 18, fontSize: 'var(--fs-sm)', lineHeight: 'var(--lh-base)' }}>
              {aktif.langkah.map((l) => <li key={l}>{l}</li>)}
            </ol>
          </div>

          {aktif.catat?.length ? (
            <div className="card card-pad stack gap-3">
              <h3 style={{ margin: 0, fontSize: 'var(--fs-md)' }}>Yang perlu diketahui</h3>
              <ul className="stack gap-2" style={{ margin: 0, paddingLeft: 18, fontSize: 'var(--fs-sm)', lineHeight: 'var(--lh-base)', color: 'var(--muted)' }}>
                {aktif.catat.map((c) => <li key={c}>{c}</li>)}
              </ul>
            </div>
          ) : null}

          <a className="btn btn-sm" href={aktif.berkas} target="_blank" rel="noopener noreferrer">
            Buka satu tab penuh
          </a>
        </div>
      </div>

      <p className="microlabel" style={{ margin: 0 }}>
        Dihasilkan dengan archify (MIT) dari {aktif.spec} — perbarui spesifikasinya,
        render ulang, lalu timpa berkas HTML-nya. Menambah fitur = satu spec + satu entri di daftar.ts.
      </p>
    </div>
  );
}
