'use client';

import { useState } from 'react';
import { BUKTI } from './bukti.generated';
import type { AdeganBukti, LangkahBukti, StatusBukti } from './bukti-tipe';

/**
 * DATAROOM · BUKTI FITUR — apa yang benar-benar disaksikan bekerja.
 *
 * Isinya SELURUHNYA dihasilkan `npm run tur`: peramban sungguhan membuka
 * produksi, menekan tombolnya, dan memotret tiap langkah. Tak ada satu pun
 * status di halaman ini yang ditulis tangan.
 *
 * Kenapa itu penting untuk dataroom: klaim "fitur X ada" gampang dibuat dan
 * mustahil diperiksa dari luar. Klaim "fitur X ditekan pada 2 Agu 2026 pukul
 * sekian di rag.sainskerta.net, ini tangkapan layarnya, servernya menjawab
 * 200, konsolnya bersih" bisa dibantah siapa pun yang mau — dan justru itu
 * yang membuatnya layak dipercaya.
 *
 * Kegagalan TIDAK disembunyikan. Adegan yang gagal tampil dengan warna
 * bahaya, lengkap dengan tangkapan layar saat gagal. Dataroom yang hanya
 * memuat kabar baik tak memberi tahu pembacanya apa pun.
 */

const NAMA: Record<StatusBukti, string> = {
  bekerja: 'BEKERJA', sebagian: 'SEBAGIAN', gagal: 'GAGAL', dilewati: 'DILEWATI',
};
const PITA: Record<StatusBukti, string> = {
  bekerja: 'ok', sebagian: 'warn', gagal: 'bad', dilewati: 'skip',
};

const waktu = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })} · ${d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`;
};

export default function BuktiFitur() {
  const [besar, setBesar] = useState<{ src: string; judul: string } | null>(null);
  const r = BUKTI.ringkas;

  return (
    <div className="dr-bukti">
      <div className="bk-summary">
        <div className="bk-overall">
          <span className="microlabel">DISAKSIKAN · {waktu(BUKTI.pada)}</span>
          <b>{r.bekerja}<small>/{r.total}</small></b>
          <span className="delta">fitur bekerja penuh</span>
        </div>
        <div className="bk-angka">
          <div><span className="microlabel">SEBAGIAN</span><b className={r.sebagian ? 'warn' : ''}>{r.sebagian}</b></div>
          <div><span className="microlabel">GAGAL</span><b className={r.gagal ? 'bad' : ''}>{r.gagal}</b></div>
          <div><span className="microlabel">DILEWATI</span><b>{r.dilewati}</b></div>
        </div>
        <p className="bk-meta">
          <code>{BUKTI.basis}</code> · mode {BUKTI.mode}
          {BUKTI.masuk ? ' · masuk sebagai superadmin demo' : ' · TANPA login'}
        </p>
      </div>

      {!BUKTI.masuk && (
        /* Ketiadaan bukti bukan bukti ketiadaan — dan kebalikannya juga.
           Tanpa peringatan ini, "8 dari 8 bekerja" terbaca seolah seluruh
           produk sudah diperiksa, padahal yang diperiksa baru halaman yang
           bisa dibuka tanpa akun. */
        <div className="bk-catat">
          <b>Baru permukaan publik.</b> Tur berjalan tanpa kredensial, jadi{' '}
          {BUKTI.adegan.length} fitur di atas adalah yang bisa dibuka siapa pun tanpa akun.
          Halaman di balik login belum diperiksa pada jalannya laporan ini —
          angka di atas tidak boleh dibaca sebagai penilaian seluruh produk.
        </div>
      )}

      {BUKTI.adegan.map((a) => <KartuAdegan key={a.id} a={a} onBesar={setBesar} />)}

      <p className="as-method">
        Metodologi: <code>npm run tur</code> menjalankan peramban sungguhan
        (playwright-core + Edge) terhadap {BUKTI.basis}. Tiap langkah menyebut
        PENANDA yang harus terlihat setelahnya; halaman yang menjawab 200 tapi
        tak menampilkan penandanya dicatat <b>gagal</b>, karena itulah yang
        dilihat pengguna. Galat konsol peramban ikut direkam dan menurunkan
        status ke <b>sebagian</b>. Skenario tak punya cara menyatakan
        &ldquo;bekerja&rdquo; sendiri. Bukti gambar: <code>/bukti/</code>.
        {BUKTI.jejakBersih.length > 0 && (
          <> Objek uji yang dibuat selama tur dihapus lagi di akhir:{' '}
            <code>{BUKTI.jejakBersih.join(' · ')}</code>.</>
        )}
      </p>

      {besar && (
        <div className="bk-lightbox" role="dialog" aria-label={besar.judul} onClick={() => setBesar(null)}>
          <figure onClick={(e) => e.stopPropagation()}>
            {/* Sengaja <img>, bukan next/image: ini bukti tur, dan bukti tidak
                boleh dikompresi ulang oleh pengoptimal gambar — teks kecil di
                tangkapan layar harus tetap terbaca apa adanya. Halaman ini
                juga superadmin saja, jadi LCP-nya tak menyangkut siapa pun. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={besar.src} alt={besar.judul} />
            <figcaption>{besar.judul}
              <button className="btn btn-sm" onClick={() => setBesar(null)}>Tutup</button>
            </figcaption>
          </figure>
        </div>
      )}
    </div>
  );
}

function KartuAdegan({ a, onBesar }: {
  a: AdeganBukti; onBesar: (v: { src: string; judul: string }) => void;
}) {
  return (
    <section className={`as-sec bk-sec ${PITA[a.status]}`}>
      <header>
        <h2>{a.fitur}</h2>
        <span className={`as-badge ${PITA[a.status]}`}>{NAMA[a.status]}</span>
      </header>
      <p className="desc">
        <code>{a.jalur}</code> · {a.ringkas}
        {a.butuhLogin && <span className="bk-kunci"> · butuh login</span>}
      </p>
      <ol className="bk-langkah">
        {a.langkah.map((l) => <BarisLangkah key={l.n} l={l} fitur={a.fitur} onBesar={onBesar} />)}
      </ol>
    </section>
  );
}

function BarisLangkah({ l, fitur, onBesar }: {
  l: LangkahBukti; fitur: string; onBesar: (v: { src: string; judul: string }) => void;
}) {
  const src = l.gambar ? `/bukti/${l.gambar}` : null;
  const judul = `${fitur} — langkah ${l.n}: ${l.nama}`;
  return (
    <li className={PITA[l.status]}>
      <div className="bk-kepala">
        <span className="bk-n">{l.n}</span>
        <b>{l.nama}</b>
        <span className={`as-badge ${PITA[l.status]}`}>{NAMA[l.status]}</span>
        {l.http !== null && <span className="mono bk-http">HTTP {l.http}</span>}
        {l.ms > 0 && <span className="mono bk-ms">{(l.ms / 1000).toFixed(1)}s</span>}
      </div>
      {l.catatan && <p className="bk-catatan">{l.catatan}</p>}
      {l.galat.length > 0 && (
        <ul className="bk-galat">
          {l.galat.map((g, i) => <li key={i}><code>{g}</code></li>)}
        </ul>
      )}
      {src && (
        <button className="bk-shot" onClick={() => onBesar({ src, judul })} title="Perbesar">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={judul} loading="lazy" />
        </button>
      )}
    </li>
  );
}
