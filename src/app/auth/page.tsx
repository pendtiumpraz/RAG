'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';

/**
 * Halaman auth nyata (Retrieval Instrument) — wired ke NextAuth:
 *  • Masuk  : signIn('credentials') / signIn('google') / signIn('azure-ad')
 *  • Daftar : POST /api/auth/signup (buat tenant) → auto signIn credentials
 */
export default function AuthPage() {
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ orgName: '', name: '', email: '', password: '' });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function doLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const res = await signIn('credentials', {
      email: form.email, password: form.password, redirect: false,
    });
    setBusy(false);
    if (res?.error) setError('Email atau password salah.');
    else window.location.href = '/settings';
  }

  async function doRegister(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setBusy(false);
      setError(j.error ?? 'Pendaftaran gagal.');
      return;
    }
    // tenant terbuat → langsung login
    const login = await signIn('credentials', {
      email: form.email, password: form.password, redirect: false,
    });
    setBusy(false);
    if (login?.error) setError('Akun terbuat — silakan masuk manual.');
    else window.location.href = '/settings';
  }

  return (
    <main style={S.shell}>
      <div style={S.card}>
        <div style={S.brand}>
          <svg width="30" height="30" viewBox="0 0 48 48" fill="none">
            <rect x="1" y="1" width="46" height="46" rx="9" fill="#161A22" stroke="#303947" />
            <path d="M13 15 L34 24 M13 24 L34 24 M13 33 L34 24" stroke="#7D8CFF" strokeWidth="2" strokeLinecap="round" />
            <circle cx="13" cy="15" r="3" fill="#7D8CFF" /><circle cx="13" cy="24" r="3" fill="#7D8CFF" />
            <circle cx="13" cy="33" r="3" fill="#7D8CFF" /><circle cx="34" cy="24" r="5.5" fill="#E3B15C" />
          </svg>
          <b style={{ fontSize: 19 }}>nalar<span style={{ color: '#E3B15C' }}>.</span></b>
          <span style={S.micro}>REASONING · SOURCED</span>
        </div>

        <div style={S.tabs}>
          <button style={S.tab(tab === 'login')} onClick={() => setTab('login')}>Masuk</button>
          <button style={S.tab(tab === 'register')} onClick={() => setTab('register')}>Daftar</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          <button style={S.oauth} disabled={busy} onClick={() => signIn('google', { callbackUrl: '/settings' })}>
            Lanjut dengan Google
          </button>
          <button style={S.oauth} disabled={busy} onClick={() => signIn('azure-ad', { callbackUrl: '/settings' })}>
            Lanjut dengan Microsoft
          </button>
        </div>
        <div style={S.divider}>ATAU EMAIL</div>

        {tab === 'login' ? (
          <form onSubmit={doLogin} style={S.form}>
            <label style={S.label}>Email
              <input style={S.input} type="email" required value={form.email} onChange={set('email')} placeholder="nama@perusahaan.com" /></label>
            <label style={S.label}>Password
              <input style={S.input} type="password" required value={form.password} onChange={set('password')} /></label>
            {error && <div style={S.error}>{error}</div>}
            <button style={S.primary} disabled={busy}>{busy ? 'Memproses…' : 'Masuk'}</button>
          </form>
        ) : (
          <form onSubmit={doRegister} style={S.form}>
            <label style={S.label}>Nama organisasi
              <input style={S.input} required value={form.orgName} onChange={set('orgName')} placeholder="PT Nusantara" /></label>
            <label style={S.label}>Nama lengkap
              <input style={S.input} required value={form.name} onChange={set('name')} /></label>
            <label style={S.label}>Email
              <input style={S.input} type="email" required value={form.email} onChange={set('email')} /></label>
            <label style={S.label}>Password
              <input style={S.input} type="password" required minLength={8} value={form.password} onChange={set('password')} placeholder="Minimal 8 karakter" /></label>
            {error && <div style={S.error}>{error}</div>}
            <button style={S.primary} disabled={busy}>{busy ? 'Membuat workspace…' : 'Buat workspace'}</button>
            <p style={S.micro}>SETIAP PENDAFTARAN = TENANT BARU YANG TERISOLASI (RLS)</p>
          </form>
        )}
      </div>
    </main>
  );
}

/* Retrieval Instrument tokens (inline — global CSS menyusul di Fase 04) */
const S = {
  shell: { minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#0C0E12',
    color: '#E9ECF2', fontFamily: '"Segoe UI", system-ui, sans-serif', padding: 24 } as React.CSSProperties,
  card: { width: '100%', maxWidth: 392, background: '#12151C', border: '1px solid #303947',
    borderRadius: 10, padding: 28 } as React.CSSProperties,
  brand: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 } as React.CSSProperties,
  micro: { fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 9.5, letterSpacing: '0.14em',
    color: '#5D6675', marginLeft: 'auto' } as React.CSSProperties,
  tabs: { display: 'flex', borderBottom: '1px solid #303947', marginBottom: 20 } as React.CSSProperties,
  tab: (on: boolean): React.CSSProperties => ({
    flex: 1, padding: 11, border: 'none', background: 'none', cursor: 'pointer',
    fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 11, letterSpacing: '0.14em',
    textTransform: 'uppercase', color: on ? '#E9ECF2' : '#9AA3B2', fontWeight: on ? 700 : 500,
    borderBottom: on ? '2px solid #7D8CFF' : '2px solid transparent', marginBottom: -1 }),
  oauth: { minHeight: 44, border: '1px solid #303947', background: '#1B2029', color: '#E9ECF2',
    borderRadius: 6, fontSize: 13.5, fontWeight: 600, cursor: 'pointer' } as React.CSSProperties,
  divider: { display: 'flex', alignItems: 'center', gap: 10, color: '#5D6675',
    fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 9.5, letterSpacing: '0.14em',
    margin: '4px 0 16px' } as React.CSSProperties,
  form: { display: 'flex', flexDirection: 'column', gap: 14 } as React.CSSProperties,
  label: { display: 'flex', flexDirection: 'column', gap: 6,
    fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 10.5, letterSpacing: '0.06em',
    textTransform: 'uppercase', color: '#9AA3B2' } as React.CSSProperties,
  input: { minHeight: 44, background: '#0F1218', border: '1px solid #303947', borderRadius: 6,
    color: '#E9ECF2', padding: '10px 12px', fontSize: 13.5, outline: 'none' } as React.CSSProperties,
  primary: { minHeight: 46, background: '#7D8CFF', border: '1px solid #7D8CFF', color: '#0B0D14',
    borderRadius: 6, fontSize: 14.5, fontWeight: 700, cursor: 'pointer', marginTop: 4 } as React.CSSProperties,
  error: { color: '#F0666B', fontSize: 13, border: '1px solid rgba(240,102,107,.4)',
    background: 'rgba(240,102,107,.12)', borderRadius: 6, padding: '9px 12px' } as React.CSSProperties,
};
