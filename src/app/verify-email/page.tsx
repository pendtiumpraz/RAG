'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

/** Halaman tujuan tautan verifikasi email (publik, D13). */
export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyInner />
    </Suspense>
  );
}

function VerifyInner() {
  const token = useSearchParams().get('token') ?? '';
  const [state, setState] = useState<'loading' | 'ok' | 'bad'>('loading');

  useEffect(() => {
    if (!token) { setState('bad'); return; }
    fetch('/api/auth/verify-email', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    }).then((r) => setState(r.ok ? 'ok' : 'bad')).catch(() => setState('bad'));
  }, [token]);

  return (
    <main className="vmail">
      <div className="card">
        <b className="brand">Nalar</b>
        {state === 'loading' && <p className="microlabel">MEMVERIFIKASI…</p>}
        {state === 'ok' && (<>
          <div className="mark ok">✓</div>
          <h1>Email terverifikasi</h1>
          <p>Terima kasih. Pendaftaranmu kini menunggu <b>persetujuan admin</b> —
            kami mengabarimu lewat email begitu akunmu aktif.</p>
          <Link className="btn btn-primary" href="/auth">Ke halaman masuk</Link>
        </>)}
        {state === 'bad' && (<>
          <div className="mark bad">×</div>
          <h1>Tautan tidak berlaku</h1>
          <p>Tautan verifikasi salah, sudah dipakai, atau kedaluwarsa (berlaku 24 jam).
            Coba daftar ulang atau hubungi pengelola.</p>
          <Link className="btn" href="/auth">Kembali</Link>
        </>)}
      </div>
      <style>{`
        .vmail{ min-height:100dvh; display:grid; place-items:center; padding:24px; background:var(--bg); }
        .vmail .card{ width:100%; max-width:440px; padding:32px; text-align:center;
          display:flex; flex-direction:column; align-items:center; gap:12px; }
        .vmail .brand{ font-family:var(--font-display); font-size:19px; letter-spacing:-.02em; }
        .vmail h1{ font-size:22px; letter-spacing:-.02em; margin:0; }
        .vmail p{ color:var(--muted); font-size:14.5px; line-height:1.65; margin:0; }
        .vmail .mark{ width:56px; height:56px; border-radius:50%; display:grid; place-items:center;
          font-size:30px; font-weight:800; margin-top:8px; }
        .vmail .mark.ok{ background:var(--tint-good); color:var(--good); }
        .vmail .mark.bad{ background:var(--tint-danger); color:var(--danger); }
        .vmail .btn{ margin-top:10px; }
      `}</style>
    </main>
  );
}
