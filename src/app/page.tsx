import Image from 'next/image';
import Link from 'next/link';
import './landing.css';

export const metadata = {
  title: 'Nalar — Enterprise Knowledge Intelligence',
  description: 'Platform RAG untuk menghubungkan seluruh pengetahuan perusahaan menjadi jawaban yang akurat, aman, dan dapat dipertanggungjawabkan.',
};

/** Landing publik (bukan redirect ke login). Brand resmi Nalar. */
export default function Landing() {
  return (
    <>
      {/* NAV */}
      <header className="lp-nav">
        <div className="lp-nav-in">
          {/* Nama aplikasi ditulis sebagai TEKS, bukan hanya di dalam gambar —
              peninjau OAuth Google mencocokkan nama di consent screen dengan
              yang terbaca di beranda, dan alt-text gambar tidak cukup. */}
          <div className="cluster gap-2">
            <Image src="/brand/nalar-logo-400.png" alt="Nalar" width={130} height={52} priority style={{ height: 34, width: 'auto' }} />
            <span className="lp-appname">Nalar</span>
          </div>
          <nav className="lp-nav-links">
            {/* Kebijakan Privasi ditautkan dari NAVIGASI ATAS, bukan hanya
                footer — peninjau Google memeriksa keterjangkauannya. */}
            <a href="#tentang">Tentang</a><a href="#data-google">Data Google</a>
            <a href="/privacy">Privasi</a><a href="/terms">Ketentuan</a>
          </nav>
          <div className="cluster gap-2">
            <Link className="btn btn-sm" href="/auth">Masuk</Link>
            <Link className="btn btn-primary btn-sm" href="/auth">Mulai gratis</Link>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="lp-wrap">
        <div className="lp-hero">
          <div>
            <span className="lp-badge"><span className="led" /> Platform RAG multi-tenant · SaaS &amp; on-prem</span>
            <h1>Nalar — tanya dokumen<br /><span className="blue">perusahaanmu sendiri.</span></h1>
            {/* Penjelasan tujuan ditaruh DI ATAS, dalam bahasa lugas: peninjau
                OAuth Google membaca bagian teratas beranda lebih dulu, dan
                slogan pemasaran saja dinilai tidak menjelaskan apa pun. */}
            <p className="lede">
              <b>Nalar</b> membaca dokumen yang kamu hubungkan — dari Google Drive,
              OneDrive, SharePoint, atau unggahan langsung — lalu menjawab pertanyaan
              berdasarkan isinya, <b>lengkap dengan sitasi ke dokumen sumbernya</b>.
              Chatbot yang dihasilkan bisa dipasang di situs mana pun.
            </p>
            <div className="lp-cta">
              <Link className="btn btn-primary btn-lg" href="/auth">Mulai gratis →</Link>
              <Link className="btn btn-lg" href="/chat">Coba Chat</Link>
            </div>
            <p className="microlabel" style={{ marginTop: 14 }}>TANPA KARTU KREDIT · ISOLASI RLS BAWAAN · SETIAP JAWABAN BERSUMBER</p>
          </div>

          {/* product card */}
          <div className="lp-card" aria-hidden="true">
            <div className="h"><span className="mk"><Nmark /></span><b>Nalar · Chat</b><span className="badge badge-ok" style={{ marginLeft: 'auto' }}><span className="led" />sourced</span></div>
            <div className="b">
              <div className="lp-q">Apa limit approval pengadaan barang &amp; jasa?</div>
              <div className="lp-a">Berdasarkan <b>SOP Procurement v4.2 Pasal 8</b>: pengadaan ≤ Rp50jt disetujui Manager, Rp50–500jt oleh Director, &gt; Rp500jt oleh VP/CEO.<span className="cite">1</span></div>
              <div className="lp-src">
                <div className="lp-srow"><span className="n">[1]</span> SOP Procurement v4.2.pdf <span style={{ marginLeft: 'auto' }}>Hal. 8</span></div>
                <div className="lp-srow"><span className="n">[2]</span> Policy Authorization Matrix.xlsx <span style={{ marginLeft: 'auto' }}>Sheet 1</span></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* TENTANG — penjelasan tujuan aplikasi dalam bahasa lugas.
          Peninjau OAuth Google menolak beranda yang tak menjelaskan untuk apa
          aplikasinya ada; bagian ini menjawab itu tanpa jargon pemasaran. */}
      <section className="lp-wrap" id="tentang">
        <div className="lp-about">
          <h2>Tentang Nalar</h2>
          <p>
            <b>Nalar</b> adalah aplikasi tanya-jawab atas dokumen milik organisasimu
            sendiri. Kamu menghubungkan sumber dokumen — Google Drive, OneDrive,
            SharePoint, atau unggahan langsung — lalu Nalar membaca isinya dan
            membangun basis pengetahuan yang bisa ditanyai dengan bahasa sehari-hari.
          </p>
          <p>
            Setiap jawaban <b>disertai sitasi</b> ke dokumen sumbernya, sehingga bisa
            diperiksa dan tidak perlu dipercaya begitu saja. Chatbot yang dihasilkan
            dapat dipasang di situs mana pun lewat satu baris skrip, misalnya untuk
            layanan pelanggan atau helpdesk internal.
          </p>
          <p>
            Ditujukan untuk <b>organisasi dan tim</b>. Setiap organisasi memiliki ruang
            datanya sendiri yang terpisah di tingkat basis data, dan dokumen satu
            organisasi tidak pernah dapat diakses organisasi lain.
          </p>
        </div>
      </section>

      {/* DATA GOOGLE — disyaratkan untuk scope sensitif (Drive). */}
      <section className="lp-wrap" id="data-google">
        <div className="lp-about">
          <h2>Bagaimana Nalar memakai data Google kamu</h2>
          <p>
            Menghubungkan Google Drive bersifat <b>opsional</b> — Nalar tetap bisa
            dipakai dengan mengunggah dokumen secara langsung.
          </p>
          <ul className="lp-list">
            <li>
              <b>Melihat berkas Drive (baca saja).</b> Dipakai untuk membaca dokumen
              yang <i>kamu pilih</i> agar menjadi basis pengetahuan chatbotmu. Nalar
              tidak dapat mengubah atau menghapus berkas di Drive-mu.
            </li>
            <li>
              <b>Menulis di folder buatan Nalar.</b> Izin ini terbatas pada berkas yang
              dibuat aplikasi ini sendiri, dipakai untuk menyimpan ringkasan pengetahuan
              ke folder <code>_nalar-memory/</code>. Berkas lain di Drive-mu tidak
              terjangkau oleh izin ini.
            </li>
          </ul>
          <p>
            Yang kami simpan hanyalah <b>teks hasil ekstraksi</b> beserta representasi
            numeriknya untuk pencarian — bukan salinan berkas aslinya. Data Google kamu
            <b> tidak dijual, tidak dipakai untuk iklan, dan tidak dipakai melatih model
            AI</b>. Kamu bisa memutus koneksi kapan saja dari halaman Knowledge, atau
            mencabut izinnya langsung dari setelan akun Google.
          </p>
          <p>
            Rincian lengkap ada di <a href="/privacy">Kebijakan Privasi</a> dan{' '}
            <a href="/terms">Ketentuan Layanan</a>.
          </p>
        </div>
      </section>

      {/* PROPS */}
      <section className="lp-wrap" id="fitur">
        <div className="lp-props">
          <Prop icon={<PathIc d="M12 2 4 5v6c0 5 3.4 8.5 8 10 4.6-1.5 8-5 8-10V5l-8-3Z" />} t="Aman & Private" d="Data tetap berada di dalam perusahaan. Isolasi per tenant di level database." />
          <Prop icon={<PathIc d="M20 6 9 17l-5-5" />} t="Akurat & Terpercaya" d="Jawaban berdasarkan dokumen dengan kutipan yang bisa diverifikasi." />
          <Prop icon={<PathIc d="M6 6h.01M6 12h.01M6 18h.01M10 6h8M10 12h8M10 18h8" />} t="Knowledge Connected" d="Menghubungkan seluruh dokumen, Drive, SharePoint & sistem internal." />
          <Prop icon={<PathIc d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z" />} t="Cepat & Efisien" d="Temukan jawaban dari ribuan dokumen dalam hitungan detik." />
        </div>
      </section>

      {/* FLOW */}
      <section className="lp-flow" id="cara">
        <div className="lp-flow-in">
          <Step ic={<PathIc d="M10 4a6 6 0 104.5 10l4.3 4.3 1.4-1.4-4.3-4.3A6 6 0 0010 4z" />} t="Retrieve" />
          <span className="lp-arrow">→</span>
          <Step ic={<PathIc d="M12 8a4 4 0 100 8 4 4 0 000-8zM12 2v3M12 19v3M2 12h3M19 12h3" />} t="Reason" />
          <span className="lp-arrow">→</span>
          <Step ic={<PathIc d="M20 6 9 17l-5-5" />} t="Answer" />
        </div>
      </section>

      {/* FINAL */}
      <section className="lp-final">
        <h2>Jadikan dokumenmu bisa menjawab.</h2>
        <p>Setiap jawaban bersumber, setiap tenant terisolasi. Pasang chatbot pertamamu dalam hitungan menit.</p>
        <div className="cluster" style={{ justifyContent: 'center', marginTop: 24 }}>
          <Link className="btn btn-primary btn-lg" href="/auth">Mulai gratis</Link>
          <Link className="btn btn-lg" href="/auth">Masuk</Link>
        </div>
      </section>

      <footer className="lp-foot">
        <div className="lp-foot-in">
          <Image src="/brand/nalar-logo-400.png" alt="Nalar" width={110} height={44} style={{ height: 28, width: 'auto' }} />
          {/* Wajib bisa ditemukan: verifikasi OAuth Google memeriksa keberadaan
              tautan kebijakan privasi yang dapat diakses publik. */}
          <nav className="lp-legal">
            <a href="/privacy">Kebijakan Privasi</a>
            <a href="/terms">Ketentuan Layanan</a>
          </nav>
          <span className="mono">© 2026 Nalar · Enterprise Knowledge Intelligence</span>
        </div>
      </footer>
      <style>{`
        .lp-legal{ display:flex; gap:18px; }
        .lp-legal a{ color:var(--muted); text-decoration:none; font-size:13px; }
        .lp-legal a:hover{ color:var(--signal); text-decoration:underline; }
      `}</style>
    </>
  );
}

function Prop({ icon, t, d }: { icon: React.ReactNode; t: string; d: string }) {
  return <div className="lp-prop"><div className="ic">{icon}</div><h3>{t}</h3><p>{d}</p></div>;
}
function Step({ ic, t }: { ic: React.ReactNode; t: string }) {
  return <div className="lp-step"><div className="c">{ic}</div><b>{t}</b></div>;
}
function PathIc({ d }: { d: string }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
}
function Nmark() {
  return <svg width="14" height="14" viewBox="0 0 48 48" fill="none"><path d="M15 16 L33 24 M15 24 L33 24 M15 32 L33 24" stroke="#60A5FA" strokeWidth="2.6" strokeLinecap="round" /><circle cx="15" cy="16" r="3" fill="#fff" /><circle cx="33" cy="24" r="4" fill="#F59E0B" /></svg>;
}
