import Link from 'next/link';
import Image from 'next/image';

/**
 * Kerangka halaman legal (Privasi & Ketentuan) — PUBLIK, tanpa sesi.
 *
 * Sengaja tidak memakai shell dashboard: halaman ini harus bisa dibuka siapa
 * pun, termasuk peninjau OAuth Google yang memeriksa URL kebijakan privasi
 * sebelum aplikasi disetujui.
 */
export function LegalPage({ title, updated, intro, children }: {
  title: string; updated: string; intro: string; children: React.ReactNode;
}) {
  return (
    <main className="legal">
      <header className="legal-top">
        <Link href="/" aria-label="Beranda Nalar">
          <Image src="/brand/nalar-logo-400.png" alt="Nalar" width={110} height={44}
            style={{ height: 28, width: 'auto' }} />
        </Link>
        <nav className="cluster gap-4">
          <Link href="/privacy">Kebijakan Privasi</Link>
          <Link href="/terms">Ketentuan Layanan</Link>
        </nav>
      </header>

      <article className="legal-body">
        <h1>{title}</h1>
        <p className="legal-meta">Berlaku sejak {updated}</p>
        <p className="legal-intro">{intro}</p>
        {children}
      </article>

      <footer className="legal-foot">
        <span className="mono">© 2026 Nalar · Enterprise Knowledge Intelligence</span>
        <Link href="/">Kembali ke beranda</Link>
      </footer>

      <style>{`
        .legal{ max-width:820px; margin:0 auto; padding:0 22px 80px; color:var(--ink); }
        .legal-top{ display:flex; align-items:center; justify-content:space-between;
          gap:16px; padding:22px 0; border-bottom:1px solid var(--line); flex-wrap:wrap; }
        .legal-top a{ color:var(--muted); text-decoration:none; font-size:14px; }
        .legal-top a:hover{ color:var(--signal); }
        .legal-body{ padding-top:34px; line-height:1.7; }
        .legal-body h1{ font-size:32px; letter-spacing:-.02em; margin:0 0 6px; }
        .legal-meta{ color:var(--faint); font-family:var(--font-mono); font-size:12px;
          letter-spacing:.06em; text-transform:uppercase; margin:0 0 22px; }
        .legal-intro{ font-size:17px; color:var(--muted); margin:0 0 8px; }
        .legal-body h2{ font-size:20px; margin:38px 0 10px; padding-top:20px;
          border-top:1px solid var(--line); letter-spacing:-.01em; }
        .legal-body h3{ font-size:15.5px; margin:22px 0 6px; }
        .legal-body p{ margin:10px 0; }
        .legal-body ul{ padding-left:20px; margin:10px 0; }
        .legal-body li{ margin:7px 0; }
        .legal-body code{ font-family:var(--font-mono); font-size:.86em;
          background:var(--card-2); border:1px solid var(--line); border-radius:4px; padding:1px 5px; }
        .legal-body table{ width:100%; border-collapse:collapse; margin:14px 0; font-size:14px; }
        .legal-body th,.legal-body td{ text-align:left; padding:9px 10px;
          border-bottom:1px solid var(--line); vertical-align:top; }
        .legal-body th{ font-family:var(--font-mono); font-size:11px; letter-spacing:.08em;
          text-transform:uppercase; color:var(--muted); font-weight:600; }
        .legal-note{ background:var(--card-2); border:1px solid var(--line);
          border-left:3px solid var(--source); border-radius:8px; padding:13px 16px; margin:18px 0; }
        .legal-note b{ display:block; margin-bottom:4px; }
        .legal-note p{ margin:6px 0 0; font-size:14px; color:var(--muted); }
        .legal-foot{ display:flex; align-items:center; justify-content:space-between;
          gap:14px; margin-top:56px; padding-top:20px; border-top:1px solid var(--line);
          color:var(--faint); font-size:13px; flex-wrap:wrap; }
        .legal-foot a{ color:var(--muted); text-decoration:none; }
        .legal-foot a:hover{ color:var(--signal); }
      `}</style>
    </main>
  );
}
