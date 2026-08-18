'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { signIn } from 'next-auth/react';
import { Field } from '../_components/ui';

const PENDING_MSG = 'Akunmu sudah terdaftar dan sedang menunggu verifikasi admin. '
  + 'Kamu akan bisa masuk setelah disetujui.';
const REJECTED_MSG = 'Pendaftaran akun ini ditolak. Hubungi admin bila menurutmu ini keliru.';
const UNVERIFIED_MSG = 'Email ini belum diverifikasi. Cek kotak masuk (dan folder spam) '
  + 'untuk tautan verifikasi yang kami kirim saat kamu mendaftar.';

/** Halaman auth (brand resmi, LIGHT) — wired ke NextAuth. */
export default function AuthPage() {
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState({ orgName: '', name: '', email: '', password: '' });
  /** Paket & interval terpilih dari halaman pricing (?plan=&interval=). */
  const [plan, setPlan] = useState<'pro' | 'enterprise' | null>(null);
  const [interval, setInterval] = useState<'monthly' | 'yearly'>('monthly');
  /** Kode faktor kedua — kolomnya baru muncul setelah password terbukti benar. */
  const [totp, setTotp] = useState('');
  const [mintaTotp, setMintaTotp] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // Provider OAuth hanya terdaftar di NextAuth bila env-nya terisi. Tanpa
  // pengecekan ini tombolnya tetap tampil dan kliknya pasti gagal — menyuruh
  // orang mencoba sesuatu yang belum ada.
  const [oauth, setOauth] = useState<{ google: boolean; azure: boolean }>({ google: false, azure: false });
  useEffect(() => {
    fetch('/api/auth/providers')
      .then((r) => r.json())
      .then((p) => setOauth({ google: !!p?.google, azure: !!p?.['azure-ad'] }))
      .catch(() => { /* biarkan tersembunyi — email tetap bisa dipakai */ });
  }, []);

  // Jalur OAuth ditolak di callback signIn dan dikembalikan ke sini dgn alasan.
  // Sekaligus baca paket terpilih dari halaman pricing (?plan=&interval=) →
  // buka tab Daftar dengan paket sudah terpasang.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const err = q.get('error');
    if (err === 'pending') setNotice(PENDING_MSG);
    else if (err === 'rejected') setError(REJECTED_MSG);
    else if (err === 'oauth_no_email') setError('Provider tak memberikan alamat email.');

    const p = q.get('plan');
    if (p === 'pro' || p === 'enterprise') {
      setPlan(p);
      setTab('register');
      const iv = q.get('interval');
      if (iv === 'monthly' || iv === 'yearly') setInterval(iv);
    }
    if (err || p) window.history.replaceState({}, '', '/auth');
  }, []);

  async function doLogin(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null); setNotice(null);
    const res = await signIn('credentials', {
      email: form.email, password: form.password, totp: totp.trim(), redirect: false,
    });
    if (!res?.error) { window.location.href = '/chat'; return; }

    // NextAuth sengaja menolak akun pending sama seperti password salah (supaya
    // login tak bisa dipakai menebak email terdaftar). Tanyakan alasannya —
    // endpoint itu baru menjawab setelah password terbukti benar.
    const why = await fetch('/api/auth/login-status', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: form.email, password: form.password }),
    }).then((r) => r.json()).catch(() => ({ outcome: 'invalid' }));
    setBusy(false);

    if (why.outcome === 'unverified') setNotice(UNVERIFIED_MSG);
    else if (why.outcome === 'pending') setNotice(PENDING_MSG);
    else if (why.outcome === 'rejected') setError(REJECTED_MSG);
    else if (why.outcome === 'active') {
      /* Password BENAR dan akunnya aktif, tapi NextAuth tetap menolak —
         yang tersisa hanyalah faktor kedua. Kolomnya baru muncul di sini,
         bukan sejak awal: menampilkannya lebih dulu akan memberi tahu
         penebak email mana yang memakai 2FA, dan itu justru daftar akun
         bernilai tinggi. Kesimpulan ini pun hanya bisa ditarik oleh orang
         yang sudah memegang password yang benar. */
      setMintaTotp(true);
      setError(totp.trim()
        ? 'Kode tidak cocok. Periksa jam perangkatmu, lalu coba kode berikutnya.'
        : null);
      if (!totp.trim()) setNotice('Akun ini memakai dua faktor. Masukkan kode 6 digit dari aplikasi authenticator — atau salah satu kode cadanganmu.');
    }
    else setError('Email atau password salah.');
  }

  /** Lupa password: server SELALU membalas sama (anti enumerasi email). */
  async function forgot() {
    const email = form.email.trim();
    if (!email.includes('@')) { setError('Isi alamat email dulu, lalu klik "Lupa password?".'); return; }
    setBusy(true); setError(null); setNotice(null);
    try {
      await fetch('/api/auth/forgot', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      setNotice('Bila email itu terdaftar, tautan atur ulang password sudah dikirim. Cek kotak masuk dan folder spam.');
    } catch { setError('Gagal mengirim permintaan.'); }
    finally { setBusy(false); }
  }

  async function doRegister(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null); setNotice(null);
    const res = await fetch('/api/auth/signup', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, plan: plan ?? undefined, interval: plan ? interval : undefined }),
    });
    if (!res.ok) { const j = await res.json().catch(() => ({})); setBusy(false); setError(j.error ?? 'Pendaftaran gagal.'); return; }

    // Akun LANGSUNG AKTIF → auto-login, lalu arahkan ke bayar (paket berbayar)
    // atau langsung masuk app (free).
    const login = await signIn('credentials', { email: form.email, password: form.password, redirect: false });
    if (login?.error) {
      // Satu-satunya alasan sah gagal di sini: gerbang verifikasi email (D13,
      // hanya bila SMTP aktif). Jelaskan, jangan diam.
      setBusy(false);
      const why = await fetch('/api/auth/login-status', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.email, password: form.password }),
      }).then((r) => r.json()).catch(() => ({ outcome: 'invalid' }));
      setTab('login');
      setNotice(why.outcome === 'unverified' ? UNVERIFIED_MSG : 'Akun dibuat. Silakan masuk untuk melanjutkan.');
      return;
    }

    if (plan) {
      // Paket berbayar → buat tagihan QRIS lalu ke halaman bayar.
      try {
        const r = await fetch('/api/payments', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plan, interval }),
        });
        const j = await r.json().catch(() => ({}));
        if (r.ok && j.id) { window.location.href = `/billing/pay/${j.id}`; return; }
      } catch { /* jatuh ke onboarding di bawah */ }
      // Pembayaran belum siap (mis. gateway belum aktif) → masuk app, bisa
      // bayar kapan saja dari halaman paket.
      window.location.href = '/welcome';
      return;
    }
    window.location.href = '/chat';
  }

  return (
    <main className="auth-shell">
      <div className="auth-card card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
          <Image src="/brand/nalar-logo-400.png" alt="Nalar" width={120} height={48} priority style={{ height: 30, width: 'auto' }} />
          <span className="microlabel">ENTERPRISE KNOWLEDGE</span>
        </div>

        {/* aria-selected hanya sah pada role="tab" — tanpa role+tablist,
            pembaca layar mengabaikannya dan tab jadi tak terbaca statusnya. */}
        <div className="tabs" role="tablist" aria-label="Masuk atau daftar" style={{ marginBottom: 24 }}>
          <button type="button" role="tab" className="tab" aria-selected={tab === 'login'}
            onClick={() => setTab('login')}>Masuk</button>
          <button type="button" role="tab" className="tab" aria-selected={tab === 'register'}
            onClick={() => setTab('register')}>Daftar</button>
        </div>

        {(oauth.google || oauth.azure) && (
          <>
            <div className="stack gap-2" style={{ marginBottom: 18 }}>
              {oauth.google && <button className="btn" style={{ width: '100%' }} onClick={() => signIn('google', { callbackUrl: '/chat' })} disabled={busy}>Lanjut dengan Google</button>}
              {oauth.azure && <button className="btn" style={{ width: '100%' }} onClick={() => signIn('azure-ad', { callbackUrl: '/chat' })} disabled={busy}>Lanjut dengan Microsoft</button>}
            </div>
            <div className="auth-div">ATAU EMAIL</div>
          </>
        )}

        {tab === 'login' ? (
          <form onSubmit={doLogin} className="stack gap-4">
            <Field label="Email"><input className="input" type="email" required value={form.email} onChange={set('email')} placeholder="nama@perusahaan.com" /></Field>
            <Field label="Password"><input className="input" type="password" required value={form.password} onChange={set('password')} /></Field>
            {mintaTotp && (
              <Field label="Kode dua faktor"><input className="input mono" inputMode="numeric" autoComplete="one-time-code"
                  autoFocus required placeholder="000000" maxLength={14} value={totp}
                  onChange={(e) => setTotp(e.target.value)} />
                <span className="microlabel">6 DIGIT DARI APLIKASI, ATAU SATU KODE CADANGAN.</span></Field>
            )}
            {error && <span className="error">{error}</span>}
            {notice && <span className="notice">{notice}</span>}
            <button className={`btn btn-primary btn-lg${busy ? ' is-loading' : ''}`} style={{ width: '100%' }} disabled={busy}>Masuk</button>
            <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Belum punya akun? <button type="button" className="tautan" onClick={() => setTab('register')}>Daftar gratis</button></p>
            <p style={{ textAlign: 'center', fontSize: 13, marginTop: -6 }}>
              <button type="button" className="tautan" style={{ color: 'var(--muted)' }} onClick={forgot}>Lupa password?</button></p>
          </form>
        ) : (
          <form onSubmit={doRegister} className="stack gap-4">
            {plan && (
              <div className="plan-pick">
                <div className="pp-top">
                  <span className="pp-name">Paket {plan}</span>
                  <button type="button" className="tautan" onClick={() => setPlan(null)}>Pilih Free saja</button>
                </div>
                <div className="pp-intv" role="tablist" aria-label="Interval">
                  <button type="button" role="tab" aria-selected={interval === 'monthly'}
                    className={interval === 'monthly' ? 'on' : ''} onClick={() => setInterval('monthly')}>Bulanan</button>
                  <button type="button" role="tab" aria-selected={interval === 'yearly'}
                    className={interval === 'yearly' ? 'on' : ''} onClick={() => setInterval('yearly')}>Tahunan −20%</button>
                </div>
                <span className="microlabel">SETELAH DAFTAR, KAMU LANGSUNG DIARAHKAN KE PEMBAYARAN QRIS.</span>
              </div>
            )}
            <Field label="Nama organisasi"><input className="input" required value={form.orgName} onChange={set('orgName')} placeholder="PT Nusantara" /></Field>
            <Field label="Nama lengkap"><input className="input" required value={form.name} onChange={set('name')} /></Field>
            <Field label="Email"><input className="input" type="email" required value={form.email} onChange={set('email')} placeholder="nama@perusahaan.com" /></Field>
            <Field label="Password"><input className="input" type="password" required minLength={8} value={form.password} onChange={set('password')} placeholder="Minimal 8 karakter" /></Field>
            {error && <span className="error">{error}</span>}
            {notice && <span className="notice">{notice}</span>}
            <button className={`btn btn-primary btn-lg${busy ? ' is-loading' : ''}`} style={{ width: '100%' }} disabled={busy}>{plan ? 'Daftar & bayar' : 'Buat workspace'}</button>
            <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Sudah punya akun? <button type="button" className="tautan" onClick={() => setTab('login')}>Masuk</button></p>
          </form>
        )}
        <p className="microlabel" style={{ textAlign: 'center', marginTop: 26 }}>
          PENDAFTARAN TERBUKA · AKUN LANGSUNG AKTIF
        </p>
        {/* Ditampilkan sebelum orang membuat akun, bukan disembunyikan di footer. */}
        <p style={{ textAlign: 'center', marginTop: 10, fontSize: 12.5, color: 'var(--muted)' }}>
          Dengan mendaftar kamu menyetujui{' '}
          <a href="/terms" style={{ color: 'var(--signal)' }}>Ketentuan Layanan</a> dan{' '}
          <a href="/privacy" style={{ color: 'var(--signal)' }}>Kebijakan Privasi</a>.
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
        .plan-pick{ background:var(--card-2); border:1px solid var(--line);
          border-radius:var(--rad-sm); padding:12px 14px; display:flex; flex-direction:column; gap:10px; }
        .plan-pick .pp-top{ display:flex; align-items:center; justify-content:space-between; }
        .plan-pick .pp-name{ font-weight:700; text-transform:capitalize; }
        .plan-pick .pp-intv{ display:inline-flex; gap:4px; padding:3px; background:var(--bg);
          border:1px solid var(--line); border-radius:999px; }
        .plan-pick .pp-intv button{ border:0; background:transparent; cursor:pointer; padding:6px 14px;
          border-radius:999px; font-size:12.5px; font-weight:600; color:var(--muted); }
        .plan-pick .pp-intv button.on{ background:var(--signal); color:#fff; }
      `}</style>
    </main>
  );
}
