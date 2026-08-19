import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { platformSettingsService, yearlyPlanPrices } from '@/modules/payments/platform-settings.service';
import { LandingPricing } from './_components/landing-pricing';
import './landing.css';

/* Harga dibaca server-side dari DB. Sebuah query DB biasa TIDAK membuat rute
   dinamis, jadi tanpa ini Next mem-prerender harga saat BUILD (baku sampai
   redeploy). ISR 1 jam: halaman tetap statis & cepat, tapi perubahan harga
   oleh superadmin ikut dalam ≤1 jam tanpa deploy ulang. */
export const revalidate = 3600;

export const metadata: Metadata = {
  /**
   * Judul beranda sengaja PERSIS "Nalar" — sama dengan App name di OAuth
   * consent screen. Sebelumnya "Nalar — Enterprise Knowledge Intelligence",
   * dan pemeriksa Google membandingkannya dengan "Nalar" lalu melaporkan nama
   * aplikasi tidak cocok. Penjelasan produknya pindah ke description & h1.
   */
  // `absolute` melewati template '%s · Nalar' di layout — tanpa ini judulnya
  // jadi "Nalar · Nalar" dan tetap dianggap tidak cocok.
  title: { absolute: 'Nalar' },
  description:
    'Nalar adalah aplikasi tanya-jawab atas dokumen perusahaan: menghubungkan Google Drive, '
    + 'OneDrive, SharePoint, atau unggahan langsung, lalu menjawab pertanyaan berdasarkan isinya '
    + 'lengkap dengan sitasi ke dokumen sumbernya.',
  applicationName: 'Nalar',
  openGraph: {
    title: 'Nalar',
    siteName: 'Nalar',
    description:
      'Aplikasi tanya-jawab atas dokumen perusahaan, dengan sitasi ke dokumen sumbernya.',
    url: 'https://nalar.sainskerta.net',
    type: 'website',
  },
};

/**
 * Data terstruktur — nama & tujuan aplikasi dalam bentuk yang dibaca MESIN.
 *
 * Sampai sini nama "Nalar" hanya ada di <title> dan teks biasa, sehingga
 * pemeriksa otomatis harus menebaknya dari heuristik (h1? logo? judul?).
 * JSON-LD menyatakannya eksplisit: `name` persis sama dengan App name di OAuth
 * consent screen, `description` menjelaskan fungsinya dalam bahasa Inggris,
 * dan kebijakan privasi ditautkan sebagai properti, bukan sekadar <a>.
 */
const JSON_LD = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': 'https://nalar.sainskerta.net/#organization',
      name: 'Nalar',
      url: 'https://nalar.sainskerta.net',
      logo: 'https://nalar.sainskerta.net/brand/nalar-logo-400.png',
      email: 'pendtiumpraz@gmail.com',
    },
    {
      '@type': 'WebSite',
      '@id': 'https://nalar.sainskerta.net/#website',
      name: 'Nalar',
      url: 'https://nalar.sainskerta.net',
      inLanguage: 'id-ID',
      publisher: { '@id': 'https://nalar.sainskerta.net/#organization' },
    },
    {
      '@type': 'SoftwareApplication',
      name: 'Nalar',
      alternateName: 'Nalar',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      url: 'https://nalar.sainskerta.net',
      description:
        'Nalar is a question-answering application for an organisation’s own documents. '
        + 'It connects to a document source you choose — Google Drive, OneDrive, SharePoint, '
        + 'or a direct upload — extracts the text, and answers questions based on that text, '
        + 'citing the source file for every answer. The result can be embedded as a chatbot on '
        + 'your own website.',
      privacyPolicy: 'https://nalar.sainskerta.net/privacy',
      termsOfService: 'https://nalar.sainskerta.net/terms',
      publisher: { '@id': 'https://nalar.sainskerta.net/#organization' },
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'IDR' },
    },
  ],
};

/** Landing publik (bukan redirect ke login). Brand resmi Nalar.
 *  Harga dibaca server-side dari DB (fallback DEFAULTS bila DB rewel), lalu
 *  di-ISR per jam (lihat `revalidate`) — jujur tanpa biaya per-permintaan. */
export default async function Landing() {
  const cfg = await platformSettingsService.get();
  const yearly = yearlyPlanPrices(cfg.planPrices);
  return (
    <>
      <script
        type="application/ld+json"
        // JSON.stringify di sini aman: isinya konstanta, bukan input pengguna.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />
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
            <a href="#tentang">Tentang</a><a href="#harga">Harga</a><a href="#data-google">Data Google</a>
            <a href="/privacy">Privasi</a><a href="/terms">Ketentuan</a>
            <a href="#english" lang="en">English</a>
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
            {/* <h1> sengaja HANYA berisi nama aplikasi. Sebelumnya "Nalar — tanya
                dokumen perusahaanmu sendiri.", dan pemeriksa yang mengambil nama
                dari h1 (bukan <title>) membaca seluruh kalimat itu lalu menyebutnya
                tak cocok dengan App name "Nalar". Slogannya turun jadi elemen
                terpisah — tampilannya sama, tapi namanya kini tak bercampur. */}
            <h1>Nalar</h1>
            <p className="lp-tagline">Tanya dokumen <span className="blue">perusahaanmu sendiri.</span></p>
            {/* Penjelasan tujuan ditaruh DI ATAS, dalam bahasa lugas: peninjau
                OAuth Google membaca bagian teratas beranda lebih dulu, dan
                slogan pemasaran saja dinilai tidak menjelaskan apa pun. */}
            <p className="lede">
              <b>Nalar</b> membaca dokumen yang kamu hubungkan — dari Google Drive,
              OneDrive, SharePoint, atau unggahan langsung — lalu menjawab pertanyaan
              berdasarkan isinya, <b>lengkap dengan sitasi ke dokumen sumbernya</b>.
              Chatbot yang dihasilkan bisa dipasang di situs mana pun.
            </p>
            {/* Menyambungkan TUJUAN aplikasi dengan DATA GOOGLE yang diminta, di
                bagian teratas beranda. Menjelaskan "Nalar itu apa" saja tidak
                cukup bagi peninjau — mereka mencari relevansi antara fungsi
                aplikasi dan scope yang dimintanya, dan mencarinya di hero. */}
            <p className="lp-oauth-line">
              <b>Nalar terhubung dengan akun Google-mu</b> untuk membaca berkas Drive
              yang kamu pilih sendiri — supaya isinya bisa diindeks dan dikutip saat
              menjawab — dan untuk menyimpan catatan ringkasannya kembali ke folder{' '}
              <code>_nalar-memory/</code> yang dibuat aplikasi ini di Drive-mu.
              Menghubungkan Google bersifat opsional.
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
        <div className="lp-sec">
          <span className="lp-eyebrow">TENTANG APLIKASI INI</span>
          <h2 className="lp-h2">Dokumen perusahaanmu, jadi bisa ditanya</h2>
          <p className="lp-sub">
            <b>Nalar</b> adalah aplikasi tanya-jawab atas dokumen milik organisasimu
            sendiri — untuk tim dan perusahaan, bukan pemakaian pribadi.
          </p>

          <ol className="lp-steps">
            <li className="lp-stepc">
              <span className="n">1</span>
              <h3>Hubungkan sumber dokumen</h3>
              <p>Google Drive, OneDrive, SharePoint, atau unggah langsung. Kamu yang
                memilih folder mana yang dibaca — tak ada yang diambil diam-diam.</p>
            </li>
            <li className="lp-stepc">
              <span className="n">2</span>
              <h3>Nalar membaca &amp; menyusunnya</h3>
              <p>Teksnya diekstrak dan disusun jadi basis pengetahuan yang bisa dicari
                berdasarkan makna, bukan sekadar kecocokan kata.</p>
            </li>
            <li className="lp-stepc">
              <span className="n">3</span>
              <h3>Tanya, dapat jawaban bersitasi</h3>
              <p>Setiap jawaban menunjuk dokumen sumbernya, jadi bisa diperiksa — tak
                perlu dipercaya begitu saja.</p>
            </li>
          </ol>

          <div className="lp-note">
            <b>Chatbot siap pasang.</b> Hasilnya dapat ditempelkan di situs mana pun
            lewat satu baris skrip — misalnya untuk layanan pelanggan atau helpdesk
            internal. Setiap organisasi punya ruang datanya sendiri yang terpisah di
            tingkat basis data; dokumen satu organisasi tidak pernah dapat diakses
            organisasi lain.
          </div>
        </div>
      </section>

      {/* DATA GOOGLE — disyaratkan untuk scope sensitif (Drive). */}
      <section className="lp-wrap" id="data-google">
        <div className="lp-sec">
          <span className="lp-eyebrow">PENGGUNAAN DATA GOOGLE</span>
          <h2 className="lp-h2">Bagaimana Nalar memakai data Google kamu</h2>
          <p className="lp-sub">
            Menghubungkan Google Drive bersifat <b>opsional</b> — Nalar tetap bisa
            dipakai penuh dengan mengunggah dokumen secara langsung. Bila kamu memang
            menghubungkannya, ini persis yang diminta dan yang tidak.
          </p>

          <div className="lp-scopes">
            <div className="lp-scope">
              <div className="lp-scope-h">
                <span className="badge badge-source">baca saja</span>
                <code>drive.readonly</code>
              </div>
              <h3>Melihat berkas Drive</h3>
              <p>Membaca dokumen yang <b>kamu pilih sendiri</b>, untuk dijadikan basis
                pengetahuan chatbotmu.</p>
              <ul className="lp-can">
                <li className="no">Tidak bisa mengubah berkasmu</li>
                <li className="no">Tidak bisa menghapus berkasmu</li>
                <li className="no">Tidak menyalin berkas aslinya</li>
              </ul>
            </div>

            <div className="lp-scope">
              <div className="lp-scope-h">
                <span className="badge badge-source">terbatas</span>
                <code>drive.file</code>
              </div>
              <h3>Menulis di folder buatan Nalar</h3>
              <p>Menyimpan ringkasan pengetahuan ke folder <code>_nalar-memory/</code>
                milikmu, agar bisa kamu baca sendiri.</p>
              <ul className="lp-can">
                <li className="no">Hanya berkas buatan aplikasi ini</li>
                <li className="no">Tak menjangkau berkas Drive lainnya</li>
                <li className="ok">Bisa kamu hapus kapan saja</li>
              </ul>
            </div>
          </div>

          <div className="lp-guarantee">
            <div className="g">
              <span className="microlabel">YANG DISIMPAN</span>
              <p>Hanya <b>teks hasil ekstraksi</b> dan representasi numeriknya untuk
                pencarian — bukan salinan berkas aslinya.</p>
            </div>
            <div className="g">
              <span className="microlabel">YANG TIDAK KAMI LAKUKAN</span>
              <p>Data Google kamu <b>tidak dijual</b>, <b>tidak dipakai untuk iklan</b>,
                dan <b>tidak dipakai melatih model AI</b> mana pun.</p>
            </div>
            <div className="g">
              <span className="microlabel">KENDALI DI TANGANMU</span>
              <p>Putus koneksi kapan saja dari halaman Knowledge, atau cabut izinnya
                langsung dari setelan akun Google.</p>
            </div>
          </div>

          <p className="lp-sub" style={{ marginTop: 20 }}>
            Rincian lengkap ada di <a href="/privacy">Kebijakan Privasi</a> dan{' '}
            <a href="/terms">Ketentuan Layanan</a>.
          </p>
        </div>
      </section>

      {/* RINGKASAN INGGRIS — bukan hiasan.
          Peninjau verifikasi OAuth Google bekerja dalam bahasa Inggris, sedangkan
          seluruh beranda ini berbahasa Indonesia (<html lang="id">). Halaman yang
          tak terbaca peninjau dinilai persis seperti temuan mereka: "tidak
          menjelaskan tujuan aplikasi". Bagian ini menyatakan nama aplikasi,
          fungsinya, dan alasan tiap scope Drive diminta — dalam bahasa Inggris,
          statis (tanpa perlu diklik), dan ditandai lang="en". */}
      <section className="lp-wrap" id="english">
        <div className="lp-sec lp-en" lang="en">
          <span className="lp-eyebrow">ENGLISH SUMMARY</span>
          <h2 className="lp-h2">What Nalar is, and why it asks for Google data</h2>
          {/* Kalimat pembuka mengikuti pola yang dicari peninjau Google:
              apa aplikasinya → apa fungsinya → KENAPA butuh data Google. */}
          <p className="lp-sub">
            <b>Nalar</b> is a question-answering application for company documents that helps
            teams find answers inside their own files, with a citation to the source document
            for every answer. <b>Nalar integrates with your Google account to read the Google
            Drive files you explicitly select</b>, so their text can be indexed and cited when
            answering your questions, <b>and to save summary notes back into a{' '}
            <code>_nalar-memory/</code> folder this app creates in your Drive</b>. Connecting
            Google is optional — Nalar works fully with direct uploads — and it is built for
            teams and companies rather than personal use.
          </p>

          <div className="lp-en-grid">
            <div>
              <span className="microlabel">WHAT THE APP DOES</span>
              <ul className="lp-can">
                <li className="ok">Connects a document source you choose — Google Drive,
                  OneDrive, SharePoint, or a direct upload</li>
                <li className="ok">Extracts the text and builds a searchable index of it</li>
                <li className="ok">Answers questions from that text, citing the source file</li>
                <li className="ok">Publishes the result as a chatbot you can embed on your
                  own website</li>
              </ul>
            </div>
            <div>
              <span className="microlabel">WHY IT REQUESTS GOOGLE DATA</span>
              <p className="lp-en-p">Connecting Google Drive is <b>optional</b> — Nalar works
                fully with direct uploads. If you do connect it:</p>
              <ul className="lp-can">
                <li className="ok"><b>drive.readonly</b> — reads only the documents you
                  select, to build your knowledge base</li>
                <li className="no">cannot modify or delete anything in your Drive</li>
                <li className="ok"><b>drive.file</b> — writes knowledge summaries into a{' '}
                  <code>_nalar-memory/</code> folder this app creates</li>
                <li className="no">cannot reach any other file in your Drive</li>
              </ul>
            </div>
          </div>

          <div className="lp-note">
            <b>How we handle your data.</b> We store only the extracted text and the numeric
            representation used for search — not a copy of your original files. Your Google
            data is never sold, never used for advertising, and never used to train any AI
            model. You can disconnect at any time from the Knowledge page, or revoke access
            directly in your Google Account settings. Full details:{' '}
            <a href="/privacy">Privacy Policy</a> · <a href="/terms">Terms of Service</a>.
          </div>
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

      {/* HARGA — kartu paket + toggle bulanan/tahunan (harga dari DB). */}
      <LandingPricing monthly={cfg.planPrices} yearly={yearly} />

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
