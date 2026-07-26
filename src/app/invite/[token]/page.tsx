'use client';

import { use, useEffect, useState } from 'react';
import Image from 'next/image';
import { signIn } from 'next-auth/react';

interface Peek { email: string; role: string; tenantName: string | null }

/**
 * Halaman penerimaan undangan — PUBLIK, diakses tanpa sesi.
 *
 * Bedanya dengan /auth: di sini orang bergabung ke tenant yang SUDAH ADA dan
 * langsung aktif, jadi tak ada gerbang "menunggu verifikasi". Email tak bisa
 * diubah — undangan terikat ke alamat tertentu.
 */
export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [peek, setPeek] = useState<Peek | null>(null);
  const [loading, setLoading] = useState(true);
  const [invalid, setInvalid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', password: '' });

  useEffect(() => {
    fetch(`/api/invitations/${token}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('invalid'))))
      .then(setPeek)
      .catch(() => setInvalid(true))
      .finally(() => setLoading(false));
  }, [token]);

  async function accept(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    const res = await fetch(`/api/invitations/${token}/accept`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setBusy(false); setError(j.error ?? 'Gagal menerima undangan.');
      return;
    }
    // Akun langsung aktif, jadi boleh auto-login (beda dgn signup publik).
    const login = await signIn('credentials', {
      email: peek!.email, password: form.password, redirect: false,
    });
    setBusy(false);
    if (login?.error) setError('Akun dibuat — silakan masuk lewat halaman login.');
    else window.location.href = '/chat';
  }

  return (
    <main className="auth-shell">
      <div className="auth-card card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
          <Image src="/brand/nalar-logo-400.png" alt="Nalar" width={120} height={48} priority style={{ height: 30, width: 'auto' }} />
          <span className="microlabel">UNDANGAN TIM</span>
        </div>

        {loading ? (
          <p style={{ color: 'var(--muted)' }}>Memeriksa undangan…</p>
        ) : invalid ? (
          <>
            <h2 style={{ marginBottom: 8 }}>Undangan tidak berlaku</h2>
            <p style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.6 }}>
              Tautan ini sudah dipakai, dicabut, atau kedaluwarsa. Minta admin
              tim mengirim undangan baru.
            </p>
            <a className="btn" style={{ width: '100%', marginTop: 20 }} href="/auth">Ke halaman masuk</a>
          </>
        ) : (
          <>
            <h2 style={{ marginBottom: 6 }}>Bergabung ke {peek?.tenantName ?? 'tim'}</h2>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 20 }}>
              Undangan untuk <b>{peek?.email}</b> sebagai <b>{peek?.role}</b>.
            </p>
            <form onSubmit={accept} className="stack gap-4">
              <div className="field"><label>Nama lengkap</label>
                <input className="input" value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
              <div className="field"><label>Buat password</label>
                <input className="input" type="password" required minLength={8} value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder="Minimal 8 karakter" /></div>
              {error && <span className="error">{error}</span>}
              <button className={`btn btn-primary btn-lg${busy ? ' is-loading' : ''}`} style={{ width: '100%' }} disabled={busy}>
                Gabung &amp; masuk
              </button>
            </form>
            <p className="microlabel" style={{ textAlign: 'center', marginTop: 24 }}>
              KAMU MASUK KE WORKSPACE YANG SUDAH ADA — BUKAN MEMBUAT BARU
            </p>
          </>
        )}
      </div>

      <style>{`
        .auth-shell{ min-height:100vh; display:grid; place-items:center; background:var(--bg); padding:24px; }
        .auth-card{ width:100%; max-width:400px; padding:30px; }
      `}</style>
    </main>
  );
}
