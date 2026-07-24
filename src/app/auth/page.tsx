'use client';

import { useState } from 'react';
import Image from 'next/image';
import { signIn } from 'next-auth/react';

/** Halaman auth (brand resmi, LIGHT) — wired ke NextAuth. */
export default function AuthPage() {
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ orgName: '', name: '', email: '', password: '' });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function doLogin(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    const res = await signIn('credentials', { email: form.email, password: form.password, redirect: false });
    setBusy(false);
    if (res?.error) setError('Email atau password salah.'); else window.location.href = '/chat';
  }
  async function doRegister(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    const res = await fetch('/api/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    if (!res.ok) { const j = await res.json().catch(() => ({})); setBusy(false); setError(j.error ?? 'Pendaftaran gagal.'); return; }
    const login = await signIn('credentials', { email: form.email, password: form.password, redirect: false });
    setBusy(false);
    if (login?.error) setError('Akun terbuat — silakan masuk.'); else window.location.href = '/chat';
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
            <button className={`btn btn-primary btn-lg${busy ? ' is-loading' : ''}`} style={{ width: '100%' }} disabled={busy}>Buat workspace</button>
            <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Sudah punya akun? <a onClick={() => setTab('login')} style={{ cursor: 'pointer' }}>Masuk</a></p>
          </form>
        )}
        <p className="microlabel" style={{ textAlign: 'center', marginTop: 26 }}>SETIAP PENDAFTARAN = TENANT BARU YANG TERISOLASI (RLS)</p>
      </div>

      <style>{`
        .auth-shell{ min-height:100vh; display:grid; place-items:center; background:var(--bg); padding:24px; }
        .auth-card{ width:100%; max-width:400px; padding:30px; }
        .auth-div{ display:flex; align-items:center; gap:12px; color:var(--faint); font-family:var(--font-mono);
          font-size:10px; letter-spacing:.14em; margin:4px 0 18px; }
        .auth-div::before,.auth-div::after{ content:""; height:1px; flex:1; background:var(--line); }
      `}</style>
    </main>
  );
}
