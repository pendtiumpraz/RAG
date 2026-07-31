'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Field } from '../../_components/ui';

/** Halaman atur ulang password dari tautan email (publik, D13). */
export default function ResetPage() {
  return (
    <Suspense fallback={null}>
      <ResetInner />
    </Suspense>
  );
}

function ResetInner() {
  const token = useSearchParams().get('token') ?? '';
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit() {
    if (pw.length < 8) { setErr('Password minimal 8 karakter'); return; }
    if (pw !== pw2) { setErr('Konfirmasi password tidak sama'); return; }
    setBusy(true); setErr(null);
    try {
      const r = await fetch('/api/auth/reset', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password: pw }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? 'Gagal mengatur password');
      setDone(true);
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <main className="rst">
      <div className="card">
        <b className="brand">Nalar</b>
        {done ? (<>
          <div className="mark ok">✓</div>
          <h1>Password diperbarui</h1>
          <p>Silakan masuk dengan password barumu.</p>
          <Link className="btn btn-primary" href="/auth">Ke halaman masuk</Link>
        </>) : (<>
          <h1>Atur password baru</h1>
          <p>Masukkan password baru untuk akunmu. Tautan ini berlaku 1 jam dan sekali pakai.</p>
          <Field label="Password baru" style={{ width: '100%' }}><input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }} /></Field>
          <Field label="Ulangi password" style={{ width: '100%' }}><input className="input" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }} /></Field>
          {err && <span className="error">{err}</span>}
          <button className={`btn btn-primary${busy ? ' is-loading' : ''}`} style={{ width: '100%' }}
            disabled={busy || !token} onClick={submit}>Simpan password</button>
          {!token && <span className="microlabel">TAUTAN TIDAK LENGKAP — BUKA DARI EMAIL</span>}
        </>)}
      </div>
      <style>{`
        .rst{ min-height:100dvh; display:grid; place-items:center; padding:24px; background:var(--bg); }
        .rst .card{ width:100%; max-width:420px; padding:32px; display:flex; flex-direction:column;
          align-items:center; gap:14px; text-align:center; }
        .rst .brand{ font-family:var(--font-display); font-size:19px; letter-spacing:-.02em; }
        .rst h1{ font-size:22px; letter-spacing:-.02em; margin:0; }
        .rst p{ color:var(--muted); font-size:14px; line-height:1.6; margin:0; }
        .rst .field{ text-align:left; }
        .rst .mark{ width:56px; height:56px; border-radius:50%; display:grid; place-items:center;
          font-size:30px; font-weight:800; background:var(--tint-good); color:var(--good); }
      `}</style>
    </main>
  );
}
