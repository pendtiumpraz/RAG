'use client';

import { useMemo, useState } from 'react';
import { BUKTI } from './bukti.generated';
import type { AdeganBukti, LangkahBukti, StatusBukti } from './bukti-tipe';

/**
 * DATAROOM · BUKTI FITUR — wiki fitur yang isinya DISAKSIKAN, bukan diklaim.
 *
 * Seluruh isinya dihasilkan `npm run tur`: peramban sungguhan membuka
 * lingkungan STAGING, menekan tombolnya, dan memotret tiap langkah. Tak ada satu pun
 * status di halaman ini yang ditulis tangan.
 *
 * KENAPA BENTUKNYA WIKI, bukan daftar panjang. Dengan tiga puluh fitur dan
 * seratusan langkah, satu gulungan raksasa memaksa pembacanya menggulir
 * melewati hal yang tak ia cari — dan pembaca dataroom biasanya datang dengan
 * satu pertanyaan spesifik ("apa RBAC-nya jalan?"). Navigasi kiri menjawab
 * pertanyaan itu dalam satu klik, dan pita statusnya terbaca sekaligus sebagai
 * daftar isi dan sebagai ringkasan kesehatan.
 *
 * KEGAGALAN TIDAK DISEMBUNYIKAN. Fitur yang gagal tampil merah di navigasi,
 * lengkap dengan tangkapan layar saat gagal. Dataroom yang hanya memuat kabar
 * baik tak memberi tahu pembacanya apa pun.
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

/** Kelompok navigasi — urutannya urutan orang mengenal produknya. */
function kelompok(a: AdeganBukti): string {
  if (!a.butuhLogin) return 'Permukaan publik';
  if (['dashboard', 'chat', 'chatbots', 'knowledge', 'documents', 'graf'].includes(a.id)) return 'Inti produk';
  if (['conversations', 'analytics', 'memory', 'categories', 'usage'].includes(a.id)) return 'Wawasan & data';
  if (['team', 'divisions', 'branding', 'models', 'settings'].includes(a.id)) return 'Pengaturan & tim';
  return 'Platform & superadmin';
}
const URUTAN = ['Permukaan publik', 'Inti produk', 'Wawasan & data', 'Pengaturan & tim', 'Platform & superadmin'];

export default function BuktiFitur() {
  const [aktifId, setAktifId] = useState<string>(BUKTI.adegan[0]?.id ?? '');
  const [besar, setBesar] = useState<{ src: string; judul: string } | null>(null);
  const r = BUKTI.ringkas;

  const grup = useMemo(() => {
    const m = new Map<string, AdeganBukti[]>();
    for (const a of BUKTI.adegan) {
      const k = kelompok(a);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(a);
    }
    return URUTAN.filter((k) => m.has(k)).map((k) => [k, m.get(k)!] as const);
  }, []);

  const aktif = BUKTI.adegan.find((a) => a.id === aktifId) ?? BUKTI.adegan[0];
  const langkahDipakai = aktif?.langkah.filter((l) => l.status !== 'dilewati').length ?? 0;

  return (
    <div className="dr-wiki">
      {/* ── rak kiri: daftar isi + kesehatan sekaligus ─────────────── */}
      <nav className="wk-nav" aria-label="Daftar fitur">
        <div className="wk-ringkas">
          <b>{r.bekerja}<small>/{r.total}</small></b>
          <span>fitur bekerja penuh</span>
          <div className="wk-pil">
            {r.sebagian > 0 && <span className="warn">{r.sebagian} sebagian</span>}
            {r.gagal > 0 && <span className="bad">{r.gagal} gagal</span>}
            {r.dilewati > 0 && <span>{r.dilewati} dilewati</span>}
          </div>
        </div>

        {grup.map(([nama, isi]) => (
          <div key={nama} className="wk-grup">
            <span className="microlabel">{nama.toUpperCase()}</span>
            <ul>
              {isi.map((a) => (
                <li key={a.id}>
                  <button
                    className={`wk-item${a.id === aktifId ? ' on' : ''}`}
                    aria-current={a.id === aktifId ? 'page' : undefined}
                    onClick={() => setAktifId(a.id)}
                  >
                    <i className={`wk-dot ${PITA[a.status]}`} aria-hidden />
                    <span>{a.fitur}</span>
                    <em className="mono">{a.langkah.length}</em>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* ── kanan: satu fitur, langkah demi langkah ─────────────────── */}
      <article className="wk-isi">
        <header className="wk-kepala">
          <div>
            <h2>{aktif?.fitur}</h2>
            <p className="wk-sub">
              <code>{aktif?.jalur}</code>
              {aktif?.butuhLogin ? ' · butuh login' : ' · dapat dibuka tanpa akun'}
              {` · ${langkahDipakai} langkah`}
            </p>
          </div>
          <span className={`as-badge ${PITA[aktif?.status ?? 'dilewati']}`}>
            {NAMA[aktif?.status ?? 'dilewati']}
          </span>
        </header>

        <p className="wk-ringkasan">{aktif?.ringkas}</p>

        {aktif?.langkah.map((l) => (
          <Langkah key={l.n} l={l} fitur={aktif.fitur} onBesar={setBesar} />
        ))}

        <footer className="wk-kaki">
          <p>
            <b>Cara bukti ini dikumpulkan.</b> <code>npm run tur</code>{' '}
            menjalankan peramban sungguhan (playwright-core + Edge) terhadap{' '}
            <code>{BUKTI.basis}</code> pada {waktu(BUKTI.pada)}, mode {BUKTI.mode}
            {BUKTI.masuk ? ', masuk lewat formulir login sebagai superadmin' : ', tanpa login'}.
          </p>
          <p>
            {/* DITULIS DI LAYAR, bukan cuma di komentar kode. Pembaca dataroom
                yang mengira ini pemasangan pelanggan akan menyimpulkan lebih
                banyak daripada yang dibuktikan — dan yang menanggung akibat
                salah paham itu bukan yang menulis halamannya. */}
            <b>Ini lingkungan staging</b>, bukan pemasangan pelanggan. Korpusnya
            kecil, jadi apa pun yang bergantung pada UKURAN DATA — latensi,
            rencana kueri, perilaku pada korpus ratusan GB — tidak terwakili di
            sini. Yang dibuktikan halaman ini: fiturnya ada dan bekerja. Yang
            TIDAK dibuktikan: perilakunya di bawah beban sungguhan.
          </p>
          <p>
            Tiap langkah menyebut <b>penanda</b> yang harus terlihat setelahnya;
            halaman yang menjawab 200 tapi tak menampilkan penandanya dicatat{' '}
            <b>gagal</b>, karena itulah yang dilihat pengguna. Galat konsol
            peramban ikut direkam dan menurunkan status ke <b>sebagian</b>.
            Skenario tak punya cara menyatakan &ldquo;bekerja&rdquo; sendiri.
          </p>
          {BUKTI.jejakBersih.length > 0 && (
            <p>
              <b>Objek uji dibersihkan.</b>{' '}
              <code>{BUKTI.jejakBersih.join(' · ')}</code>
            </p>
          )}
        </footer>
      </article>

      {besar && (
        <div className="bk-lightbox" role="dialog" aria-label={besar.judul} onClick={() => setBesar(null)}>
          <figure onClick={(e) => e.stopPropagation()}>
            {/* Sengaja <img>, bukan next/image: ini bukti tur, dan bukti tak
                boleh dikompresi ulang oleh pengoptimal gambar — teks kecil di
                tangkapan layar harus tetap terbaca apa adanya. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={besar.src} alt={besar.judul} />
            <figcaption>
              {besar.judul}
              <button className="btn btn-sm" onClick={() => setBesar(null)}>Tutup</button>
            </figcaption>
          </figure>
        </div>
      )}
    </div>
  );
}

function Langkah({ l, fitur, onBesar }: {
  l: LangkahBukti; fitur: string; onBesar: (v: { src: string; judul: string }) => void;
}) {
  const src = l.gambar ? `/bukti/${l.gambar}` : null;
  const judul = `${fitur} — langkah ${l.n}: ${l.nama}`;
  return (
    <section className={`wk-langkah ${PITA[l.status]}`}>
      <div className="wk-lk-kepala">
        <span className="wk-n">{l.n}</span>
        <b>{l.nama}</b>
        {l.status !== 'bekerja' && <span className={`as-badge ${PITA[l.status]}`}>{NAMA[l.status]}</span>}
        {l.http !== null && <span className="mono wk-tanda">HTTP {l.http}</span>}
        {l.ms > 0 && <span className="mono wk-tanda">{(l.ms / 1000).toFixed(1)}s</span>}
      </div>
      {l.catatan && <p className="wk-catatan">{l.catatan}</p>}
      {l.galat.length > 0 && (
        <ul className="wk-galat">
          {l.galat.map((g, i) => <li key={i}><code>{g}</code></li>)}
        </ul>
      )}
      {src && (
        <button className="wk-shot" onClick={() => onBesar({ src, judul })} title="Perbesar">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={judul} loading="lazy" />
        </button>
      )}
    </section>
  );
}
