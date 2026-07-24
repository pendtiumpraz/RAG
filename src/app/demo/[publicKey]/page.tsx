'use client';

import { use, useEffect, useState } from 'react';
import Script from 'next/script';
import Image from 'next/image';

/**
 * Demo / trial page PUBLIK per chatbot: /demo/<publicKey>.
 * Menyematkan widget embed asli (embed.js) → pengunjung bisa mencoba
 * chatbot dengan knowledge base-nya sendiri. Owner tinggal share link ini.
 */
export default function DemoPage({ params }: { params: Promise<{ publicKey: string }> }) {
  const { publicKey } = use(params);
  const [state, setState] = useState<'loading' | 'ok' | 'notfound'>('loading');

  useEffect(() => {
    fetch(`/api/chat/${encodeURIComponent(publicKey)}`)
      .then((r) => setState(r.ok ? 'ok' : 'notfound'))
      .catch(() => setState('notfound'));
  }, [publicKey]);

  return (
    <main style={S.wrap}>
      <header style={S.head}>
        <Image src="/brand/nalar-logo-400.png" alt="Nalar" width={120} height={48} style={{ height: 30, width: 'auto' }} />
        <span style={S.tag}>MODE DEMO</span>
      </header>

      <div style={S.center}>
        {state === 'loading' && <p style={{ color: 'var(--muted)' }}>Memuat demo…</p>}
        {state === 'notfound' && (
          <div style={S.card}>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22, margin: 0 }}>Chatbot tidak ditemukan</h1>
            <p style={{ color: 'var(--muted)', marginTop: 8 }}>Public key tidak valid atau chatbot dinonaktifkan.</p>
          </div>
        )}
        {state === 'ok' && (
          <div style={S.card}>
            <div style={S.badge}><span className="led" /> LIVE · sourced</div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 26, margin: '14px 0 0', letterSpacing: '-0.02em' }}>
              Coba chatbot ini
            </h1>
            <p style={{ color: 'var(--muted)', marginTop: 12, lineHeight: 1.6, maxWidth: '42ch', marginInline: 'auto' }}>
              Klik gelembung chat di kanan bawah dan tanyakan apa saja — jawabannya diambil dari knowledge base chatbot ini, lengkap dengan sitasi.
            </p>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--faint)', marginTop: 20, letterSpacing: '.06em' }}>
              {publicKey}
            </p>
          </div>
        )}
      </div>

      {state === 'ok' && <Script src="/embed.js" data-chatbot={publicKey} strategy="afterInteractive" />}
    </main>
  );
}

const S: Record<string, React.CSSProperties> = {
  wrap: { minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' },
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 26px', borderBottom: '1px solid var(--line)', background: 'var(--panel)' },
  tag: { fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '.14em', color: 'var(--signal)', background: 'var(--tint-signal)', padding: '4px 10px', borderRadius: 6 },
  center: { flex: 1, display: 'grid', placeItems: 'center', padding: 24 },
  card: { textAlign: 'center', maxWidth: 480, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16, padding: '40px 32px', boxShadow: 'var(--pop)' },
  badge: { display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--good)', border: '1px solid color-mix(in srgb,var(--good-mark) 40%,transparent)', background: 'var(--tint-good)', borderRadius: 999, padding: '4px 12px' },
};
