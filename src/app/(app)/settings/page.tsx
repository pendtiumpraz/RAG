'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { api, useApi } from '../../_lib/api';
import { Skeleton, useToast, Field } from '../../_components/ui';
import { Select } from '../../_components/select';
import Integrations from './Integrations';
import TwoFactor from './TwoFactor';
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
            <div className="card-pad table-wrap"><table className="table"><tbody>
              <tr><td>Mode</td><td className="num"><span className="badge badge-source">SaaS</span></td></tr>
              <tr><td>Isolasi RLS</td><td className="num"><span className="badge badge-ok"><span className="led led-live" />aktif</span></td></tr>
              <tr><td>API docs</td><td className="num"><a href="/api/openapi" target="_blank">OpenAPI ↗</a></td></tr>
            </tbody></table></div></div>
        </div>
      )}

      <Integrations />

      <TwoFactor />

      <PanelSso />
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
          <Field label="SMTP host"><input className="input mono" placeholder="smtp.gmail.com" value={f.host}
              onChange={(e) => setF({ ...f, host: e.target.value })} /></Field>
          <Field label="Port"><input className="input mono" inputMode="numeric" value={f.port}
              onChange={(e) => setF({ ...f, port: e.target.value.replace(/D/g, '') })} /></Field>
          <Field label="Akun / username"><input className="input mono" placeholder="akun@gmail.com" value={f.user}
              onChange={(e) => setF({ ...f, user: e.target.value })} /></Field>
          <Field label="App password"><input className="input mono" type="password"
              placeholder={data?.hasPassword ? 'kosongkan = tak diubah' : '16 karakter dari Google'}
              value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        </div>
        <div className="grid g3">
          <Field label="Nama pengirim"><input className="input" value={f.fromName} onChange={(e) => setF({ ...f, fromName: e.target.value })} /></Field>
          <Field label="Email pengirim"><input className="input mono" placeholder="sama dgn akun bila kosong" value={f.fromEmail}
              onChange={(e) => setF({ ...f, fromEmail: e.target.value })} /></Field>
          <Field label="Kirim email uji ke"><input className="input mono" placeholder="alamat kamu (opsional)" value={testTo}
              onChange={(e) => setTestTo(e.target.value)} /></Field>
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

/* ── SSO enterprise (D16) ─────────────────────────────────────────────
   Tenant menyalakan dan mengisi kredensial identity provider MILIKNYA
   sendiri; kita tak mendaftarkan aplikasi apa pun. Perutean login memakai
   domain email, dan domain wajib unik secara global — dua organisasi yang
   mengaku memiliki domain sama berarti karyawan satu perusahaan dikirim ke
   IdP perusahaan lain. */
interface KoneksiSso {
  id: string; kind: string; issuer: string; clientId: string; domain: string; enabled: boolean;
}
interface DataSso {
  connections: KoneksiSso[];
  presets: Array<{ jenis: string; label: string; labelIssuer: string; petunjuk: string }>;
  callbackUrl: string;
}

function PanelSso() {
  const { data, loading, refetch } = useApi<DataSso>('/api/sso');
  const [kind, setKind] = useState('entra');
  const [f, setF] = useState({ isian: '', clientId: '', clientSecret: '', domain: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const toast = useToast();

  const preset = data?.presets.find((p) => p.jenis === kind);

  async function tambah() {
    setBusy(true); setErr(null);
    try {
      await api('/api/sso', { method: 'POST', body: JSON.stringify({ kind, ...f }) });
      setF({ isian: '', clientId: '', clientSecret: '', domain: '' });
      toast('Identity provider terdaftar'); refetch();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  async function cabut(id: string, domain: string) {
    if (!confirm(`Cabut SSO untuk ${domain}? Orang yang biasa masuk lewat direktori perusahaan akan kehilangan jalan masuknya.`)) return;
    try { await api(`/api/sso?id=${id}`, { method: 'DELETE' }); toast('Koneksi dicabut'); refetch(); }
    catch (e) { toast((e as Error).message, 'error'); }
  }

  return (
    <div className="card" style={{ marginTop: 'var(--sp-4)' }}>
      <div className="panel-head"><span className="t">SSO organisasi</span>
        <span className="microlabel">{data?.connections.length ?? 0} TERDAFTAR</span></div>
      <div className="card-pad stack gap-4">
        {loading ? <Skeleton rows={3} /> : (
          <>
            {(data?.connections.length ?? 0) > 0 && (
              <div className="table-wrap"><table className="table">
                <thead><tr><th>Domain</th><th>Penyedia</th><th>Issuer</th><th /></tr></thead>
                <tbody>
                  {data!.connections.map((c) => (
                    <tr key={c.id}>
                      <td><b>{c.domain}</b></td>
                      <td><span className="badge">{c.kind}</span></td>
                      <td className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>{c.issuer}</td>
                      <td><button className="btn btn-sm btn-ghost" onClick={() => void cabut(c.id, c.domain)}>Cabut</button></td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}

            <Field label="Penyedia">
              <Select value={kind} onChange={(e) => setKind(e.target.value)}
                items={(data?.presets ?? []).map((p) => ({ value: p.jenis, label: p.label }))} />
              {preset && <p className="microlabel" style={{ marginTop: 6 }}>{preset.petunjuk}</p>}
            </Field>

            <Field label={preset?.labelIssuer ?? 'Issuer'}>
              <input className="input" value={f.isian} onChange={(e) => setF({ ...f, isian: e.target.value })} />
            </Field>
            <Field label="Domain email organisasi">
              <input className="input" value={f.domain} placeholder="perusahaan.co.id"
                onChange={(e) => setF({ ...f, domain: e.target.value })} />
              <p className="microlabel" style={{ marginTop: 6 }}>
                ORANG YANG MENGETIK EMAIL DI DOMAIN INI AKAN DIARAHKAN KE IDENTITY PROVIDER ANDA.
                SATU DOMAIN HANYA BOLEH MENUNJUK SATU IDP — DI SELURUH NALAR, BUKAN CUMA DI
                ORGANISASI INI.
              </p>
            </Field>
            <Field label="Client ID">
              <input className="input" value={f.clientId} autoComplete="off"
                onChange={(e) => setF({ ...f, clientId: e.target.value })} />
            </Field>
            <Field label="Client secret">
              <input className="input" type="password" value={f.clientSecret} autoComplete="off"
                onChange={(e) => setF({ ...f, clientSecret: e.target.value })} />
              <p className="microlabel" style={{ marginTop: 6 }}>
                DISIMPAN TERENKRIPSI DAN TAK PERNAH DIKIRIM BALIK KE PERAMBAN — TERMASUK KE LAYAR INI.
              </p>
            </Field>

            <Field label="URL callback untuk didaftarkan di IdP Anda">
              <code className="mono" style={{
                display: 'block', padding: 10, background: 'var(--card-2)',
                border: '1px solid var(--line)', borderRadius: 7, fontSize: 12, wordBreak: 'break-all',
              }}>{data?.callbackUrl}</code>
              <p className="microlabel" style={{ marginTop: 6 }}>
                SALIN PERSIS. SATU HURUF BEDA MEMBUAT IDP MENOLAK DENGAN GALAT YANG TAK MENYEBUT SEBABNYA.
              </p>
            </Field>

            {err && <span className="error">{err}</span>}
            <div>
              <button className={`btn btn-primary${busy ? ' is-loading' : ''}`}
                disabled={busy || !f.isian.trim() || !f.clientId.trim() || !f.clientSecret || !f.domain.trim()}
                onClick={() => void tambah()}>Daftarkan identity provider</button>
            </div>

            <p className="microlabel">
              PENGGUNA YANG MASUK LEWAT SSO TETAP MENUNGGU PERSETUJUAN SEBELUM BISA MASUK — SAMA
              SEPERTI JALUR PENDAFTARAN LAIN. DIREKTORI PERUSAHAAN MEMBUKTIKAN SIAPA ORANGNYA,
              BUKAN BAHWA IA BOLEH MELIHAT ISI WORKSPACE INI.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
