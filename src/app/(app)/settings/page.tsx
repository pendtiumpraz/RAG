'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { api, useApi } from '../../_lib/api';
import { Skeleton, useToast, Field } from '../../_components/ui';
import { BarisKosong, TabelAlat, TabelKaki, TdNo, Th, ThNo, useTabel } from '../../_components/tabel';
import type { OpsiTabel } from '../../_lib/tabel';
import { Select } from '../../_components/select';
import Integrations from './Integrations';
import Peringatan from './Peringatan';
import TwoFactor from './TwoFactor';
import Penyimpanan from './Penyimpanan';
import PanelPenyediaStorage from './PanelPenyediaStorage';
import { toggleTheme } from '../../providers';
import { PageTabs, type TabDef } from '../../_components/page-tabs';
import { useHashTab } from '../../_lib/useTab';

type SetTab = 'tampilan' | 'integrasi' | 'keamanan' | 'platform';
const SET_KEYS: readonly SetTab[] = ['tampilan', 'integrasi', 'keamanan', 'platform'];

interface Settings { active: { themeConfig: { theme?: { signal?: string; source?: string } } | null } | null }

/** Settings tenant + white-label ringkas (simpan themeConfig via /api/settings). */
export default function SettingsPage() {
  const { data: session } = useSession();
  const { data, loading, refetch } = useApi<Settings>('/api/settings');
  const [signal, setSignal] = useState('#2563EB');
  const [source, setSource] = useState('#F59E0B');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const isSuper = session?.user?.role === 'superadmin';
  const tabs = ([
    { key: 'tampilan', label: 'Tampilan' },
    { key: 'integrasi', label: 'Integrasi' },
    { key: 'keamanan', label: 'Keamanan' },
    { key: 'platform', label: 'Platform', super: true },
  ] as readonly TabDef<SetTab>[]).filter((t) => !t.super || isSuper);
  const [tab, setTab] = useHashTab(SET_KEYS, 'tampilan');
  const active = tabs.some((t) => t.key === tab) ? tab : tabs[0].key;

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
        {active === 'tampilan' && <button className={`btn btn-primary${busy ? ' is-loading' : ''}`} onClick={save} disabled={busy}>Simpan</button>}
      </div>

      <PageTabs tabs={tabs} active={active} onPick={setTab} label="Bagian setelan" />

      {active === 'tampilan' && (loading ? <div className="card"><Skeleton rows={3} /></div> : (
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
      ))}

      {active === 'integrasi' && <>
        <Integrations />
        {/* BYOB: seluruh anggota tenant mengelola koneksi penyimpanan objeknya. */}
        <Penyimpanan />
      </>}

      {active === 'keamanan' && <>
        {/* Peringatan menentukan apakah kerusakan diketahui atau tidak. */}
        <Peringatan />
        <TwoFactor />
        <PanelSso />
      </>}

      {active === 'platform' && isSuper && <>
        <PanelLisensi />
        <PanelRetrieval />
        <PanelKonektor />
        {/* Saklar penyedia BYOB — superadmin saja, plus saklar konektor di atasnya. */}
        <PanelPenyediaStorage />
        {/* Whitelist domain provisioning S2S (/api/v1) — superadmin, editable dari DB. */}
        {session?.user?.role === 'superadmin' && <PanelWhitelistS2S />}
        <PanelDemo />
        <MailSettings />
      </>}
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

const OPSI_SSO: OpsiTabel<KoneksiSso> = {
  cari: (c) => [c.domain, c.kind, c.issuer, c.clientId],
  saring: { kind: (c) => c.kind },
  urut: { domain: (c) => c.domain, kind: (c) => c.kind, issuer: (c) => c.issuer },
};

/* ── lisensi on-premise ─────────────────────────────────────────────── */

interface HasilLisensi {
  status: 'tak-berlaku' | 'kosong' | 'tidak-sah' | 'aktif' | 'kedaluwarsa';
  isi: { untuk: string; sampai?: string; edisi?: string; seri?: string } | null;
  pesan: string; sisaHari: number | null; perluPerhatian: boolean;
}

const LENCANA: Record<HasilLisensi['status'], string> = {
  aktif: 'badge-ok', kedaluwarsa: 'badge-danger', 'tidak-sah': 'badge-danger',
  kosong: 'badge-source', 'tak-berlaku': '',
};

/**
 * Keadaan lisensi — hanya berarti di pemasangan on-premise.
 *
 * Di SaaS panel ini menyatakan apa adanya bahwa lisensi tak berlaku di sini,
 * alih-alih disembunyikan. Panel yang hilang tanpa penjelasan membuat orang
 * mencarinya, dan yang mencarinya akan menyimpulkan ada yang rusak.
 */
function PanelLisensi() {
  const { data, loading } = useApi<HasilLisensi>('/api/admin/license');
  if (loading && !data) return null;
  if (!data) return null;

  return (
    <div className="card" style={{ marginTop: 'var(--sp-4)' }}>
      <div className="panel-head"><span className="t">lisensi</span>
        <span className={`badge ${LENCANA[data.status]}`}>{data.status}</span></div>
      <div className="card-pad stack gap-3">
        <p className="sub" style={{ margin: 0 }}>{data.pesan}</p>

        {data.isi && (
          <div className="table-wrap"><table className="table"><tbody>
            <tr><td>Pemegang</td><td><b>{data.isi.untuk}</b></td></tr>
            {data.isi.edisi && <tr><td>Edisi</td><td>{data.isi.edisi}</td></tr>}
            <tr><td>Berlaku sampai</td><td className="mono">
              {data.isi.sampai ?? 'tanpa masa berlaku'}
              {data.sisaHari != null && (
                <span className="microlabel" style={{ marginLeft: 8 }}>
                  {data.sisaHari >= 0 ? `SISA ${data.sisaHari} HARI` : `LEWAT ${Math.abs(data.sisaHari)} HARI`}
                </span>
              )}
            </td></tr>
            {data.isi.seri && <tr><td>Nomor seri</td><td className="mono">{data.isi.seri}</td></tr>}
          </tbody></table></div>
        )}

        {data.status !== 'tak-berlaku' && (
          <p className="microlabel">
            {/* DITULIS DI LAYAR, bukan cuma di kode. Tim IT yang menemukan
                lisensinya merah akan mengira layanannya akan mati, lalu
                mematikannya sendiri lebih dulu untuk "berjaga-jaga". */}
            TAK ADA FITUR YANG DIMATIKAN OLEH KEADAAN LISENSI — TERMASUK SAAT KEDALUWARSA.
            PEMERIKSAANNYA BERJALAN SEPENUHNYA DI SERVER INI, TANPA SATU PUN PANGGILAN KELUAR.
          </p>
        )}
      </div>
    </div>
  );
}

function PanelSso() {
  const { data, loading, refetch } = useApi<DataSso>('/api/sso');
  const t = useTabel(data?.connections ?? [], OPSI_SSO);
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
              <div className="stack gap-3">
                <TabelAlat
                  t={t} rows={data!.connections} cariLabel="Cari domain atau issuer"
                  saring={[{ kunci: 'kind', label: 'Semua penyedia', lebar: 165, ambil: (c) => c.kind }]}
                />
                <div className="table-wrap"><table className="table">
                  <thead><tr>
                    <ThNo />
                    <Th t={t} kunci="domain">Domain</Th>
                    <Th t={t} kunci="kind">Penyedia</Th>
                    <Th t={t} kunci="issuer">Issuer</Th>
                    <th />
                  </tr></thead>
                  <tbody>
                    <BarisKosong t={t} kolom={5} />
                    {t.hasil.tampil.map((c, i) => (
                      <tr key={c.id}>
                        <TdNo n={t.nomor(i)} />
                        <td><b>{c.domain}</b></td>
                        <td><span className="badge">{c.kind}</span></td>
                        <td className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>{c.issuer}</td>
                        <td><button className="btn btn-sm btn-ghost" onClick={() => void cabut(c.id, c.domain)}>Cabut</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
                <TabelKaki t={t} satuan="koneksi" />
              </div>
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

/* ── demo publik di landing (D-demo, migrasi 0044) ───────────────────
   Pengunjung boleh mencoba tanpa mendaftar — orang perlu melihat produknya
   bekerja sebelum membuat akun. Remnya: matikan otomatis saat kuota bulanan
   habis, karena tiap jawaban demo dibayar dengan token yang tak pernah jadi
   pendapatan dan pengunjungnya anonim: tak ada yang bisa ditagih. */
interface DataDemo {
  pengaturan: { chatbotId: string | null; batas: number };
  status: { keadaan: string; terpakai: number; batas: number };
  publicKey: string | null;
  chatbots: Array<{ id: string; name: string }>;
}

function PanelDemo() {
  const { data, loading, refetch } = useApi<DataDemo>('/api/admin/demo');
  const [chatbotId, setChatbotId] = useState('');
  const [batas, setBatas] = useState('1000');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!data) return;
    setChatbotId(data.pengaturan.chatbotId ?? '');
    setBatas(String(data.pengaturan.batas));
  }, [data]);

  async function simpan() {
    setBusy(true);
    try {
      await api('/api/admin/demo', {
        method: 'PUT',
        body: JSON.stringify({ chatbotId: chatbotId || null, batas: Number(batas) || 0 }),
      });
      toast(chatbotId ? 'Demo publik diperbarui' : 'Demo publik dimatikan'); refetch();
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  }

  const s = data?.status;
  return (
    <div className="card" style={{ marginTop: 'var(--sp-4)' }}>
      <div className="panel-head"><span className="t">demo publik di landing (superadmin)</span>
        {s && <span className="microlabel">{s.terpakai} / {s.batas} PESAN BULAN INI</span>}</div>
      <div className="card-pad stack gap-4">
        {loading ? <Skeleton rows={3} /> : (
          <>
            <Field label="Chatbot yang dipakai demo">
              <Select value={chatbotId} onChange={(e) => setChatbotId(e.target.value)} items={[
                { value: '', label: 'Tidak ada — demo dimatikan' },
                ...(data?.chatbots ?? []).map((c) => ({ value: c.id, label: c.name })),
              ]} />
              <p className="microlabel" style={{ marginTop: 6 }}>
                ISI KNOWLEDGE BASE CHATBOT INI AKAN BISA DITANYAI SIAPA PUN TANPA MENDAFTAR.
                PILIH YANG MEMANG BERISI DOKUMEN CONTOH — BUKAN DOKUMEN PELANGGAN.
              </p>
            </Field>

            <Field label="Rem: batas pesan per bulan">
              <input className="input" type="number" min={0} value={batas}
                onChange={(e) => setBatas(e.target.value)} />
              <p className="microlabel" style={{ marginTop: 6 }}>
                DEMO MATI SENDIRI SAAT ANGKA INI TERCAPAI, DAN HIDUP LAGI AWAL BULAN BERIKUTNYA.
                NOL BERARTI MATI TOTAL, BUKAN TANPA BATAS. BAWAAN 1.000 — SEPERLIMA PAKET PRO.
              </p>
            </Field>

            {s && s.keadaan === 'kuota-habis' && (
              <p className="microlabel" style={{ color: 'var(--source)' }}>
                KUOTA BULAN INI SUDAH HABIS — LANDING TIDAK MENAMPILKAN DEMO SAMPAI BULAN DEPAN.
              </p>
            )}
            {data?.publicKey && (
              <p className="microlabel">
                TAUTAN DEMO: /demo/{data.publicKey}
              </p>
            )}

            <div>
              <button className={`btn btn-primary${busy ? ' is-loading' : ''}`} disabled={busy}
                onClick={() => void simpan()}>Simpan pengaturan demo</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ── whitelist domain provisioning S2S (superadmin, migrasi 0053) ─────
   Bos minta whitelist domain yang boleh memanggil provisioning /api/v1
   (bertoken master NALAR_MASTER_KEY) bisa ditambah & dikurangi dari UI —
   bukan hardcode 'mairasales.com'. Token master tetap kontrol utama; daftar
   ini hanya menyaring request DARI PERAMBAN (yang membawa Origin). Server
   Maira (fetch S2S tanpa Origin) tetap lolos dikawal token. Daftar kosong =
   S2S-only, tak ada peramban yang diizinkan. */
function PanelWhitelistS2S() {
  const { data, loading, refetch } = useApi<{ domains: string[] }>('/api/admin/s2s-whitelist');
  const [domain, setDomain] = useState('');
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [keyStatus, setKeyStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const toast = useToast();
  const domains = data?.domains ?? [];

  async function tesKunci() {
    setTesting(true);
    try {
      const r = await api<{ ok: boolean; message: string }>('/api/admin/s2s-master-test', { method: 'POST' });
      setKeyStatus({ ok: r.ok, message: r.message });
      toast(r.message, r.ok ? 'ok' : 'error');
    } catch (e) { toast((e as Error).message, 'error'); } finally { setTesting(false); }
  }

  async function tambah() {
    if (!domain.trim()) return;
    setBusy(true);
    try {
      await api('/api/admin/s2s-whitelist', { method: 'POST', body: JSON.stringify({ domain }) });
      setDomain(''); toast('Domain ditambahkan ke whitelist'); refetch();
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  }

  async function hapus(d: string) {
    if (!confirm(`Hapus ${d} dari whitelist? Peramban di domain ini tak lagi bisa memanggil provisioning S2S.`)) return;
    try {
      await api(`/api/admin/s2s-whitelist?domain=${encodeURIComponent(d)}`, { method: 'DELETE' });
      toast('Domain dihapus'); refetch();
    } catch (e) { toast((e as Error).message, 'error'); }
  }

  return (
    <div className="card" style={{ marginTop: 'var(--sp-4)' }}>
      <div className="panel-head"><span className="t">whitelist provisioning S2S (superadmin)</span>
        <span className="cluster gap-2">
          {keyStatus && (
            <span className="microlabel" style={{ color: keyStatus.ok ? 'var(--good-mark)' : 'var(--danger)' }}>
              {keyStatus.ok ? 'MASTER KEY OK' : 'MASTER KEY BERMASALAH'}
            </span>
          )}
          <button className={`btn btn-sm btn-ghost${testing ? ' is-loading' : ''}`}
            disabled={testing} onClick={() => void tesKunci()}>Test master key</button>
          <span className="microlabel">{domains.length} DOMAIN</span>
        </span></div>
      <div className="card-pad stack gap-4">
        {keyStatus && (
          <p className="microlabel" style={{ color: keyStatus.ok ? 'var(--good-mark)' : 'var(--danger)', lineHeight: 1.7 }}>
            {keyStatus.message.toUpperCase()}
          </p>
        )}
        {loading ? <Skeleton rows={3} /> : (
          <>
            {domains.length > 0 ? (
              <div className="table-wrap"><table className="table"><tbody>
                {domains.map((d) => (
                  <tr key={d}>
                    <td className="mono"><b>{d}</b>
                      <span className="microlabel" style={{ marginLeft: 8 }}>+ SUBDOMAIN</span></td>
                    <td className="num" style={{ width: 1 }}>
                      <button className="btn btn-sm btn-ghost" onClick={() => void hapus(d)}>Hapus</button></td>
                  </tr>
                ))}
              </tbody></table></div>
            ) : (
              <p className="microlabel" style={{ color: 'var(--source)' }}>
                DAFTAR KOSONG — TAK ADA PERAMBAN YANG BOLEH PROVISIONING (S2S-ONLY). SERVER YANG
                MEMANGGIL TANPA ORIGIN TETAP JALAN SELAMA TOKEN MASTER SAH.
              </p>
            )}

            <Field label="Tambah domain">
              <div className="cluster gap-2">
                <input className="input mono" placeholder="mairasales.com" value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void tambah(); }} />
                <button className={`btn btn-primary${busy ? ' is-loading' : ''}`}
                  disabled={busy || !domain.trim()} onClick={() => void tambah()}>Tambah</button>
              </div>
              <p className="microlabel" style={{ marginTop: 6, lineHeight: 1.7 }}>
                DOMAIN INI + SEMUA SUBDOMAINNYA (app./admin./dst.) BOLEH MEMANGGIL /API/V1 DARI
                PERAMBAN. TOKEN MASTER (NALAR_MASTER_KEY) TETAP KONTROL UTAMA — DAFTAR INI HANYA
                LAPISAN TAMBAHAN UNTUK REQUEST YANG MEMBAWA ORIGIN.
              </p>
            </Field>
          </>
        )}
      </div>
    </div>
  );
}

/* ── saklar konektor (superadmin) ────────────────────────────────────
   Diminta pemilik produk: admin memilih konektor mana yang boleh dipakai,
   dan yang dimatikan tak boleh muncul sebagai pilihan. Penegakannya di
   server (api/sources menolak 422) — menyembunyikan pilihan di layar saja
   bukan penegakan. */
interface BarisKonektor {
  jenis: string; label: string; nyala: boolean; tersedia: boolean;
  butuhAplikasiKita: boolean; keterangan: string; sumberAktif: number;
}

/* ── saklar retrieval tingkat platform (superadmin) ──────────────────
   Keputusan PEMASANGAN, bukan per-tenant: yang ditukar adalah waktu lawan
   ketepatan pada infrastruktur bersama. */
function PanelRetrieval() {
  const { data, loading, refetch } = useApi<{ binaryQuantize: boolean }>('/api/admin/retrieval');
  const [biner, setBiner] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => { if (data) setBiner(data.binaryQuantize); }, [data]);

  async function simpan(nilai: boolean) {
    setBusy(true);
    setBiner(nilai);
    try {
      await api('/api/admin/retrieval', {
        method: 'PUT', body: JSON.stringify({ binaryQuantize: nilai }),
      });
      toast(nilai ? 'Kuantisasi biner dinyalakan' : 'Kuantisasi biner dimatikan');
      refetch();
    } catch (e) {
      setBiner(!nilai);                       // kembalikan; simpannya gagal
      toast((e as Error).message, 'error');
    } finally { setBusy(false); }
  }

  return (
    <div className="card" style={{ marginTop: 'var(--sp-4)' }}>
      <div className="panel-head"><span className="t">retrieval (superadmin)</span>
        <span className="badge">{biner ? 'kuantisasi biner: nyala' : 'kuantisasi biner: mati'}</span>
      </div>
      <div className="card-pad stack gap-3">
        {loading ? <Skeleton rows={2} /> : (
          <label className="cluster gap-3"
            style={{
              padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 8,
              alignItems: 'flex-start', cursor: busy ? 'wait' : 'pointer',
            }}>
            <input type="checkbox" style={{ marginTop: 3 }} checked={biner} disabled={busy}
              onChange={(e) => void simpan(e.target.checked)} />
            <span style={{ flex: 1 }}>
              <b>Kuantisasi biner sebagai lapisan penyaring</b>
              <p className="microlabel" style={{ marginTop: 6, lineHeight: 1.7 }}>
                MEMPERKECIL INDEKS PENCARIAN ±32× PADA KORPUS BESAR. JARAK HAMMING
                HANYA MEMPERSEMPIT KANDIDAT — JARAK EKSAK TETAP YANG MENENTUKAN
                URUTAN AKHIR, JADI KETEPATANNYA TIDAK DITUKAR.<br />
                MENGABAIKAN DIRINYA SENDIRI DI KORPUS KECIL, KARENA DI SANA IA
                JUSTRU MERUGIKAN. BUKTIKAN AMAN DI KORPUSMU DENGAN{' '}
                <code>npm run bench:biner</code> SEBELUM MENGANDALKANNYA.
              </p>
            </span>
          </label>
        )}
      </div>
    </div>
  );
}

function PanelKonektor() {
  const { data, loading, refetch } = useApi<{ konektor: BarisKonektor[] }>('/api/admin/connectors');
  const [nyala, setNyala] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (data) setNyala(Object.fromEntries(data.konektor.map((k) => [k.jenis, k.nyala])));
  }, [data]);

  async function simpan() {
    setBusy(true);
    try {
      await api('/api/admin/connectors', { method: 'PUT', body: JSON.stringify({ konektor: nyala }) });
      toast('Saklar konektor tersimpan'); refetch();
    } catch (e) { toast((e as Error).message, 'error'); } finally { setBusy(false); }
  }

  return (
    <div className="card" style={{ marginTop: 'var(--sp-4)' }}>
      <div className="panel-head"><span className="t">konektor sumber data (superadmin)</span></div>
      <div className="card-pad stack gap-3">
        {loading ? <Skeleton rows={4} /> : (
          <>
            {(data?.konektor ?? []).map((k) => (
              <label key={k.jenis} className="cluster gap-3"
                style={{
                  padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 8,
                  alignItems: 'flex-start', cursor: k.tersedia ? 'pointer' : 'not-allowed',
                  opacity: k.tersedia ? 1 : 0.6,
                }}>
                <input type="checkbox" style={{ marginTop: 3 }}
                  checked={!!nyala[k.jenis]} disabled={!k.tersedia || busy}
                  onChange={(e) => setNyala({ ...nyala, [k.jenis]: e.target.checked })} />
                <span style={{ flex: 1 }}>
                  <b>{k.label}</b>
                  {!k.tersedia && <span className="badge" style={{ marginLeft: 8 }}>BELUM TERSEDIA</span>}
                  {k.sumberAktif > 0 && (
                    <span className="badge badge-source" style={{ marginLeft: 8 }}>
                      {k.sumberAktif} SUMBER AKTIF
                    </span>
                  )}
                  <span className="microlabel" style={{ display: 'block', marginTop: 4 }}>{k.keterangan}</span>
                </span>
              </label>
            ))}

            <p className="microlabel">
              MEMATIKAN KONEKTOR HANYA MENUTUP PEMBUATAN SUMBER BARU — SUMBER YANG SUDAH ADA
              TETAP DISINKRONKAN. ITU SEBABNYA JUMLAH SUMBER AKTIF DITAMPILKAN DI SINI: KALAU
              INGIN BENAR-BENAR BERHENTI, SUMBERNYA HARUS DIHAPUS DI MASING-MASING KNOWLEDGE BASE.
            </p>

            <div>
              <button className={`btn btn-primary${busy ? ' is-loading' : ''}`} disabled={busy}
                onClick={() => void simpan()}>Simpan saklar konektor</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
