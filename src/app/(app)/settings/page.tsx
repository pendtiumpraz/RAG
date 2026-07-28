'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { api, useApi } from '../../_lib/api';
import { Skeleton, useToast } from '../../_components/ui';
import { toggleTheme } from '../../providers';

interface Settings { active: { themeConfig: { theme?: { signal?: string; source?: string } } | null } | null }

/** Settings tenant + white-label ringkas (simpan themeConfig via /api/settings). */
export default function SettingsPage() {
  const { data: session } = useSession();
  const { data, loading, refetch } = useApi<Settings>('/api/settings');
  const [signal, setSignal] = useState('#2563EB');
  const [source, setSource] = useState('#F59E0B');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => {
    const t = data?.active?.themeConfig?.theme;
    if (t?.signal) setSignal(t.signal); if (t?.source) setSource(t.source);
  }, [data]);

  async function save() {
    setBusy(true);
    try {
      await api('/api/settings', { method: 'POST', body: JSON.stringify({ themeConfig: { theme: { signal, source } } }) });
      toast('Branding tersimpan'); refetch();
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  }

  return (
    <>
      <div className="page-head">
        <div><h1>Settings</h1><p className="sub">Tenant, tampilan, dan white-label workspace.</p></div>
        <button className={`btn btn-primary${busy ? ' is-loading' : ''}`} onClick={save} disabled={busy}>Simpan</button>
      </div>

      {loading ? <div className="card"><Skeleton rows={3} /></div> : (
        <div className="grid g3">
          <div className="card"><div className="panel-head"><span className="t">tampilan</span></div>
            <div className="card-pad stack gap-3">
              <p style={{ color: 'var(--muted)', fontSize: 13 }}>Tema mengikuti brand resmi (light default). Bisa diubah per perangkat.</p>
              <button className="btn" onClick={toggleTheme}>Ganti tema (light / dark)</button>
            </div></div>

          <div className="card"><div className="panel-head"><span className="t">white-label</span></div>
            <div className="card-pad stack gap-4">
              <div className="cluster" style={{ justifyContent: 'space-between' }}>
                <label className="kicker">Signal (interaktif)</label>
                <input type="color" value={signal} onChange={(e) => setSignal(e.target.value)}
                  style={{ width: 40, height: 30, border: '1px solid var(--line-strong)', borderRadius: 6, background: 'none' }} />
              </div>
              <div className="cluster" style={{ justifyContent: 'space-between' }}>
                <label className="kicker">Source (sitasi)</label>
                <input type="color" value={source} onChange={(e) => setSource(e.target.value)}
                  style={{ width: 40, height: 30, border: '1px solid var(--line-strong)', borderRadius: 6, background: 'none' }} />
              </div>
              <p className="microlabel">DITERAPKAN KE DASHBOARD, WIDGET EMBED, &amp; HALAMAN CLIENT.</p>
            </div></div>

          <div className="card"><div className="panel-head"><span className="t">deployment</span></div>
            <div className="card-pad"><table className="table"><tbody>
              <tr><td>Mode</td><td className="num"><span className="badge badge-source">SaaS</span></td></tr>
              <tr><td>Isolasi RLS</td><td className="num"><span className="badge badge-ok"><span className="led led-live" />aktif</span></td></tr>
              <tr><td>API docs</td><td className="num"><a href="/api/openapi" target="_blank">OpenAPI ↗</a></td></tr>
            </tbody></table></div></div>
        </div>
      )}

      {session?.user?.role === 'superadmin' && <MailSettings />}
    </>
  );
}

/* ── SMTP platform (superadmin, D13) ────────────────────────────────── */

interface MailCfg {
  config: { host?: string; port?: number; secure?: boolean; user?: string; fromName?: string; fromEmail?: string } | null;
  hasPassword: boolean;
  configured: boolean;
}

/**
 * Konfigurasi email platform — di DATABASE, bukan env. Gmail + App Password
 * langsung jalan (smtp.gmail.com:465, secure). Selama belum diisi, alur
 * verifikasi email & reset password tidak dipaksakan (on-prem tanpa mail
 * server tetap utuh).
 */
function MailSettings() {
  const { data, refetch } = useApi<MailCfg>('/api/admin/mail-settings');
  const toast = useToast();
  const [f, setF] = useState({ host: '', port: '465', secure: true, user: '', fromName: 'Nalar', fromEmail: '' });
  const [password, setPassword] = useState('');
  const [testTo, setTestTo] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const c = data?.config;
    if (c) setF({
      host: c.host ?? '', port: String(c.port ?? 465), secure: c.secure !== false,
      user: c.user ?? '', fromName: c.fromName ?? 'Nalar', fromEmail: c.fromEmail ?? '',
    });
  }, [data]);

  async function save() {
    setBusy(true);
    try {
      const r = await api<{ testSent: boolean | null }>('/api/admin/mail-settings', {
        method: 'PUT',
        body: JSON.stringify({
          config: {
            host: f.host.trim(), port: Number(f.port) || 465, secure: f.secure,
            user: f.user.trim(), fromName: f.fromName.trim() || 'Nalar',
            fromEmail: (f.fromEmail || f.user).trim(),
          },
          ...(password ? { password } : {}),
          ...(testTo.trim() ? { testTo: testTo.trim() } : {}),
        }),
      });
      setPassword('');
      toast(r.testSent === false ? 'Tersimpan, tapi email uji GAGAL terkirim — cek host/port/app password'
        : r.testSent ? 'Tersimpan & email uji terkirim' : 'Konfigurasi email tersimpan');
      refetch();
    } catch (e) { toast((e as Error).message, 'error'); }
    finally { setBusy(false); }
  }

  return (
    <div className="card" style={{ marginTop: 'var(--sp-4)' }}>
      <div className="panel-head"><span className="t">email platform / SMTP (superadmin)</span>
        {data?.configured
          ? <span className="badge badge-ok"><span className="led led-live" />aktif</span>
          : <span className="badge"><span className="led led-off" />belum diisi</span>}</div>
      <div className="card-pad stack gap-4">
        <div className="grid g4">
          <div className="field"><label>SMTP host</label>
            <input className="input mono" placeholder="smtp.gmail.com" value={f.host}
              onChange={(e) => setF({ ...f, host: e.target.value })} /></div>
          <div className="field"><label>Port</label>
            <input className="input mono" inputMode="numeric" value={f.port}
              onChange={(e) => setF({ ...f, port: e.target.value.replace(/D/g, '') })} /></div>
          <div className="field"><label>Akun / username</label>
            <input className="input mono" placeholder="akun@gmail.com" value={f.user}
              onChange={(e) => setF({ ...f, user: e.target.value })} /></div>
          <div className="field"><label>App password</label>
            <input className="input mono" type="password"
              placeholder={data?.hasPassword ? 'kosongkan = tak diubah' : '16 karakter dari Google'}
              value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        </div>
        <div className="grid g3">
          <div className="field"><label>Nama pengirim</label>
            <input className="input" value={f.fromName} onChange={(e) => setF({ ...f, fromName: e.target.value })} /></div>
          <div className="field"><label>Email pengirim</label>
            <input className="input mono" placeholder="sama dgn akun bila kosong" value={f.fromEmail}
              onChange={(e) => setF({ ...f, fromEmail: e.target.value })} /></div>
          <div className="field"><label>Kirim email uji ke</label>
            <input className="input mono" placeholder="alamat kamu (opsional)" value={testTo}
              onChange={(e) => setTestTo(e.target.value)} /></div>
        </div>
        <label className="cluster gap-2" style={{ cursor: 'pointer', fontSize: 13 }}>
          <input type="checkbox" checked={f.secure} onChange={(e) => setF({ ...f, secure: e.target.checked })} />
          Koneksi TLS langsung (port 465). Matikan untuk STARTTLS (port 587).
        </label>
        <div className="cluster gap-2">
          <button className={`btn btn-primary${busy ? ' is-loading' : ''}`} disabled={busy || !f.host || !f.user} onClick={save}>
            Simpan{testTo.trim() ? ' & kirim uji' : ''}
          </button>
          <span className="microlabel">GMAIL: BUAT APP PASSWORD DI AKUN GOOGLE → KEAMANAN → SANDI APLIKASI</span>
        </div>
        <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>
          Dipakai untuk: <b>verifikasi email pendaftar</b>, kabar akun disetujui,
          undangan anggota tim, dan <b>reset password</b>. Selama belum diisi,
          verifikasi email tidak dipaksakan dan undangan dibagikan manual.
        </p>
      </div>
    </div>
  );
}
