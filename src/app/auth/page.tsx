'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { signIn } from 'next-auth/react';

const PENDING_MSG = 'Akunmu sudah terdaftar dan sedang menunggu verifikasi admin. '
  + 'Kamu akan bisa masuk setelah disetujui.';
const REJECTED_MSG = 'Pendaftaran akun ini ditolak. Hubungi admin bila menurutmu ini keliru.';

/** Halaman auth (brand resmi, LIGHT) — wired ke NextAuth. */
export default function AuthPage() {
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState({ orgName: '', name: '', email: '', password: '' });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // Jalur OAuth ditolak di callback signIn dan dikembalikan ke sini dgn alasan.
  useEffect(() => {
    const err = new URLSearchParams(window.location.search).get('error');
    if (err === 'pending') setNotice(PENDING_MSG);
    else if (err === 'rejected') setError(REJECTED_MSG);
    else if (err === 'oauth_no_email') setError('Provider tak memberikan alamat email.');
    if (err) window.history.replaceState({}, '', '/auth');
  }, []);

  async function doLogin(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null); setNotice(null);
    const res = await signIn('credentials', { email: form.email, password: form.password, redirect: false });
    if (!res?.error) { window.location.href = '/chat'; return; }

    // NextAuth sengaja menolak akun pending sama seperti password salah (supaya
    // login tak bisa dipakai menebak email terdaftar). Tanyakan alasannya —
    // endpoint itu baru menjawab setelah password terbukti benar.
    const why = await fetch('/api/auth/login-status', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: form.email, password: form.password }),
    }).then((r) => r.json()).catch(() => ({ outcome: 'invalid' }));
    setBusy(false);

    if (why.outcome === 'pending') setNotice(PENDING_MSG);
    else if (why.outcome === 'rejected') setError(REJECTED_MSG);
    else setError('Email atau password salah.');
  }

  async function doRegister(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null); setNotice(null);
    const res = await fetch('/api/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    setBusy(false);
    if (!res.ok) { const j = await res.json().catch(() => ({})); setError(j.error ?? 'Pendaftaran gagal.'); return; }
    // TIDAK auto-login lagi: akun baru berstatus pending sampai diverifikasi.
    // Mencoba masuk lalu gagal hanya akan membingungkan.
    setTab('login');
    setForm((f) => ({ ...f, orgName: '', name: '', password: '' }));
    setNotice(PENDING_MSG);
  }

  return (
    <main className="auth-shell">
      <div className="auth-card card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
          <Image src="/brand/nalar-logo-400.png" alt="Nalar" width={120} height={48} priority style={{ height: 30, width: 'auto' }} />
          <span className="microlabel">ENTERPRISE KNOWLEDGE</span>
        </div>

        <div className="tabs" style={{ marginBottom: 24 }}>
          <button className="tab" aria-selected={tab === 'login'} onClick={() => setTab('login')}>Masuk</button>
          <button className="tab" aria-selected={tab === 'register'} onClick={() => setTab('register')}>Daftar</button>
        </div>

        <div className="stack gap-2" style={{ marginBottom: 18 }}>
          <button className="btn" style={{ width: '100%' }} onClick={() => signIn('google', { callbackUrl: '/chat' })} disabled={busy}>Lanjut dengan Google</button>
          <button className="btn" style={{ width: '100%' }} onClick={() => signIn('azure-ad', { callbackUrl: '/chat' })} disabled={busy}>Lanjut dengan Microsoft</button>
        </div>
        <div className="auth-div">ATAU EMAIL</div>

        {tab === 'login' ? (
          <form onSubmit={doLogin} className="stack gap-4">
            <div className="field"><label>Email</label><input className="input" type="email" required value={form.email} onChange={set('email')} placeholder="nama@perusahaan.com" /></div>
            <div className="field"><label>Password</label><input className="input" type="password" required value={form.password} onChange={set('password')} /></div>
            {error && <span className="error">{error}</span>}
            {notice && <span className="notice">{notice}</span>}
            <button className={`btn btn-primary btn-lg${busy ? ' is-loading' : ''}`} style={{ width: '100%' }} disabled={busy}>Masuk</button>
            <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Belum punya akun? <a onClick={() => setTab('register')} style={{ cursor: 'pointer' }}>Daftar gratis</a></p>
          </form>
        ) : (
          <form onSubmit={doRegister} className="stack gap-4">
            <div className="field"><label>Nama organisasi</label><input className="input" required value={form.orgName} onChange={set('orgName')} placeholder="PT Nusantara" /></div>
            <div className="field"><label>Nama lengkap</label><input className="input" required value={form.name} onChange={set('name')} /></div>
            <div className="field"><label>Email</label><input className="input" type="email" required value={form.email} onChange={set('email')} placeholder="nama@perusahaan.com" /></div>
            <div className="field"><label>Password</label><input className="input" type="password" required minLength={8} value={form.password} onChange={set('password')} placeholder="Minimal 8 karakter" /></div>
            {error && <span className="error">{error}</span>}
            {notice && <span className="notice">{notice}</span>}
            <button className={`btn btn-primary btn-lg${busy ? ' is-loading' : ''}`} style={{ width: '100%' }} disabled={busy}>Buat workspace</button>
            <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Sudah punya akun? <a onClick={() => setTab('login')} style={{ cursor: 'pointer' }}>Masuk</a></p>
          </form>
        )}
        <p className="microlabel" style={{ textAlign: 'center', marginTop: 26 }}>
          PENDAFTARAN TERBUKA · AKUN AKTIF SETELAH DIVERIFIKASI ADMIN
        </p>
      </div>

      <style>{`
        .auth-shell{ min-height:100vh; display:grid; place-items:center; background:var(--bg); padding:24px; }
        .auth-card{ width:100%; max-width:400px; padding:30px; }
        .auth-div{ display:flex; align-items:center; gap:12px; color:var(--faint); font-family:var(--font-mono);
          font-size:10px; letter-spacing:.14em; margin:4px 0 18px; }
        .auth-div::before,.auth-div::after{ content:""; height:1px; flex:1; background:var(--line); }
        /* "menunggu verifikasi" bukan kegagalan — jangan diwarnai merah seperti galat. */
        .notice{ font-size:13px; line-height:1.5; color:var(--ink); background:var(--card-2);
          border:1px solid var(--line); border-left:3px solid var(--source);
          border-radius:var(--rad-sm); padding:10px 12px; }
      `}</style>
    </main>
  );
}
